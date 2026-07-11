import os
import hashlib
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from bson import ObjectId
from pymongo.errors import DuplicateKeyError


os.environ.setdefault(
    "DATABASE_URI",
    "mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=40&connectTimeoutMS=40",
)

from app import magic_link, routes, trading, trading_auth, utils  # noqa: E402
from app.email_service import EmailSendError  # noqa: E402


class Cursor(list):
    def sort(self, *_args, **_kwargs):
        return self


class TradingDataSafetyTests(unittest.TestCase):
    def test_asset_history_stops_at_current_period(self):
        first_quarter = trading._asset_payload(0)
        later_quarter = trading._asset_payload(5)

        self.assertTrue(all(len(asset["series"]) == 1 for asset in first_quarter))
        self.assertTrue(all(len(asset["series"]) == 6 for asset in later_quarter))
        self.assertTrue(all(asset["series"][-1]["period_id"] == "2019Q2" for asset in later_quarter))

    def test_news_unlocks_by_quarter_not_by_whole_year(self):
        q1_items = trading._news_payload(0)
        q4_items = trading._news_payload(3)

        self.assertTrue(q1_items)
        self.assertTrue(all(item["period_id"] == "2018Q1" for item in q1_items))
        self.assertTrue(all(item["period_id"].startswith("2018") for item in q4_items))
        self.assertFalse(any(item["period_id"].startswith("2019") for item in q4_items))

    def test_public_leaderboard_does_not_expose_join_codes_or_emails(self):
        teams = Cursor([
            {
                "team_code": "FD-SECRET",
                "team_name": "Team North",
                "leader_email": "captain@example.edu",
                "members": ["captain@example.edu"],
            }
        ])
        with patch.object(trading.trading_team_collection, "find", return_value=teams), patch.object(
            trading,
            "simulate_portfolio",
            return_value={"equity": 1_050_000, "return_pct": 5},
        ):
            row = trading.leaderboard(0)[0]

        self.assertEqual(row["team_name"], "Team North")
        self.assertNotIn("team_code", row)
        self.assertNotIn("leader_email", row)

    def test_reset_clears_orders_but_preserves_team_setup(self):
        game_collection = MagicMock()
        order_collection = MagicMock()
        expected = {"current_period_index": 0, "is_round_open": False}
        with patch.object(trading, "is_gamemaster", return_value=True), patch.object(
            trading, "trading_game_collection", game_collection
        ), patch.object(trading, "trading_order_collection", order_collection), patch.object(
            trading, "public_game_state", return_value=expected
        ), patch.object(trading, "_acquire_game_lock", return_value="lock-owner"), patch.object(
            trading, "_release_game_lock"
        ):
            result = trading.reset_game("host@example.edu")

        self.assertEqual(result, expected)
        order_collection.delete_many.assert_called_once_with({})

    def test_mongo_ids_are_json_safe_in_admin_payloads(self):
        value = ObjectId()
        self.assertEqual(trading._serialize(value), str(value))

    def test_student_team_payload_masks_other_member_emails_in_the_api(self):
        team = {
            "team_code": "FD-SAFE",
            "team_name": "Privacy Team",
            "leader_email": "captain@example.edu",
            "members": ["captain@example.edu", "student@example.edu"],
        }
        with patch.object(trading, "is_gamemaster", return_value=False):
            payload = trading._public_team(team, "student@example.edu")

        self.assertNotIn("captain@example.edu", str(payload))
        self.assertEqual(payload["members"][0]["display_email"], "c***n@example.edu")
        self.assertEqual(payload["members"][1]["display_email"], "student@example.edu")
        self.assertTrue(payload["members"][0]["is_leader"])
        self.assertTrue(payload["members"][1]["is_self"])

    def test_gamemaster_payload_never_exposes_player_api_keys(self):
        team = {
            "team_code": "FD-KEY",
            "team_name": "Key Team",
            "leader_email": "host@example.edu",
            "members": ["host@example.edu"],
            "api_key": "fd_live_secret",
        }
        with patch.object(trading, "is_gamemaster", return_value=True):
            payload = trading._public_team(team, "host@example.edu")

        self.assertNotIn("api_key", payload)


class TradingIdentityTests(unittest.TestCase):
    def test_create_team_uses_verified_session_not_spoofed_payload_email(self):
        payload = routes.TradingTeamCreatePayload(
            team_name="Team Secure",
            leader_email="spoofed-admin@example.edu",
        )
        with patch.object(routes, "create_team", return_value={"team_name": "Team Secure"}) as create_team:
            routes.trading_create_team_endpoint(payload, email="student@example.edu")

        create_team.assert_called_once_with("Team Secure", "student@example.edu")

    def test_round_control_uses_verified_session_not_payload_email(self):
        payload = routes.TradingAdminPayload(admin_email="spoofed-admin@example.edu")
        with patch.object(routes, "start_round", return_value={"is_round_open": True}) as start_round:
            routes.trading_start_round_endpoint(payload, email="verified-host@example.edu")

        start_round.assert_called_once_with("verified-host@example.edu")

    def test_student_session_cannot_use_host_action(self):
        payload = routes.TradingAdminPayload(admin_email="real-host@example.edu")
        with patch.object(routes, "start_round", return_value="forbidden"):
            with self.assertRaises(routes.HTTPException) as context:
                routes.trading_start_round_endpoint(payload, email="student@example.edu")
        self.assertEqual(context.exception.status_code, 403)

    def test_missing_bearer_session_is_rejected(self):
        with patch.object(routes, "authenticate_trading_session", return_value=None):
            with self.assertRaises(routes.HTTPException) as context:
                routes.require_trading_session(None)
        self.assertEqual(context.exception.status_code, 401)

    def test_bearer_token_is_hashed_before_database_lookup(self):
        sessions = MagicMock()
        sessions.find_one.return_value = {
            "email": "student@example.edu",
            "revoked_at": None,
            "audience": "player",
        }
        with patch.object(trading_auth, "trading_session_collection", sessions), patch.object(
            trading_auth, "is_trading_player_email_allowed", return_value=True
        ):
            email = trading_auth.authenticate_trading_session("Bearer secret-token")

        self.assertEqual(email, "student@example.edu")
        query = sessions.find_one.call_args.args[0]
        self.assertEqual(
            query["token_hash"],
            hashlib.sha256(b"secret-token").hexdigest(),
        )

    def test_created_session_persists_its_audience(self):
        sessions = MagicMock()
        with patch.object(trading_auth, "trading_session_collection", sessions), patch.object(
            trading_auth, "is_trading_player_email_allowed", return_value=True
        ), patch.object(trading_auth.secrets, "token_urlsafe", return_value="player-token"):
            session = trading_auth.create_trading_session(
                "player@example.edu",
                audience="player",
            )

        self.assertEqual(session["audience"], "player")
        stored = sessions.insert_one.call_args.args[0]
        self.assertEqual(stored["audience"], "player")
        self.assertEqual(stored["token_hash"], hashlib.sha256(b"player-token").hexdigest())

    def test_gamemaster_session_requires_the_dedicated_role(self):
        sessions = MagicMock()
        with patch.object(trading_auth, "trading_session_collection", sessions), patch.object(
            trading_auth, "is_gamemaster", return_value=False
        ):
            with self.assertRaises(ValueError):
                trading_auth.create_trading_session(
                    "portal-admin@example.edu",
                    audience="gamemaster",
                )

        sessions.insert_one.assert_not_called()

    def test_normal_portal_admin_is_not_implicitly_a_gamemaster(self):
        with patch.dict(
            os.environ,
            {
                "ADMIN_EMAILS": "portal-admin@example.edu",
                "GAMEMASTER_EMAILS": "",
            },
            clear=False,
        ), patch.object(
            utils.trading_gamemaster_access_collection,
            "find_one",
            return_value=None,
        ):
            self.assertFalse(utils.is_gamemaster("portal-admin@example.edu"))

    def test_dedicated_gamemaster_env_role_is_allowed(self):
        with patch.dict(
            os.environ,
            {"GAMEMASTER_EMAILS": "event-host@example.edu"},
            clear=False,
        ):
            self.assertTrue(utils.is_gamemaster("event-host@example.edu"))

    def test_event_host_can_also_use_participant_access(self):
        with patch.dict(
            os.environ,
            {
                "GAMEMASTER_EMAILS": "event-host@example.edu",
                "TRADING_PARTICIPANT_EMAILS": "event-host@example.edu",
            },
            clear=False,
        ):
            self.assertTrue(utils.is_gamemaster("event-host@example.edu"))
            self.assertTrue(utils.is_trading_player_email_allowed("event-host@example.edu"))

    def test_invalid_order_mode_is_rejected_before_storage(self):
        team = {"leader_email": "student@example.edu"}
        with patch.object(trading, "is_trading_player_email_allowed", return_value=True), patch.object(
            trading, "get_team_for_email", return_value=team
        ):
            self.assertEqual(
                trading.place_order("student@example.edu", "stock_a", "buy", 1, "bypass"),
                "invalid_mode",
            )

    def test_player_bearer_token_cannot_be_used_as_gamemaster_session(self):
        sessions = MagicMock()
        sessions.find_one.return_value = {
            "email": "host@example.edu",
            "revoked_at": None,
            "audience": "player",
        }
        with patch.object(trading_auth, "trading_session_collection", sessions):
            email = trading_auth.authenticate_trading_session(
                "Bearer player-token",
                expected_audience="gamemaster",
            )

        self.assertIsNone(email)

    def test_gamemaster_bearer_token_cannot_be_used_as_player_session(self):
        sessions = MagicMock()
        sessions.find_one.return_value = {
            "email": "host@example.edu",
            "revoked_at": None,
            "audience": "gamemaster",
        }
        with patch.object(trading_auth, "trading_session_collection", sessions):
            email = trading_auth.authenticate_trading_session(
                "Bearer host-token",
                expected_audience="player",
            )

        self.assertIsNone(email)

    def test_role_dependencies_request_the_matching_session_audience(self):
        with patch.object(routes, "authenticate_trading_session", return_value="player@example.edu") as authenticate:
            self.assertEqual(
                routes.require_player_trading_session("Bearer player-token"),
                "player@example.edu",
            )
            authenticate.assert_called_once_with("Bearer player-token", expected_audience="player")

        with patch.object(routes, "authenticate_trading_session", return_value="host@example.edu") as authenticate:
            self.assertEqual(
                routes.require_gamemaster_trading_session("Bearer host-token"),
                "host@example.edu",
            )
            authenticate.assert_called_once_with("Bearer host-token", expected_audience="gamemaster")

    def test_gamemaster_role_does_not_use_normal_portal_admin_check(self):
        with patch.object(routes, "is_gamemaster", return_value=False):
            with self.assertRaises(routes.HTTPException) as context:
                routes.require_gamemaster_email("portal-admin@example.edu")

        self.assertEqual(context.exception.status_code, 403)

    def test_gamemaster_leader_api_key_is_disabled_for_continuous_orders(self):
        team = {"leader_email": "host@example.edu", "team_code": "FD-HOST"}
        with patch.object(trading.trading_team_collection, "find_one", return_value=team), patch.object(
            trading, "is_gamemaster", return_value=True
        ):
            result = trading.place_api_order("fd_live_old_key", "stock_a", "buy", 1)

        self.assertEqual(result, "invalid_api_key")


class TradingMutationLockTests(unittest.TestCase):
    def test_operation_lock_is_owner_scoped_and_has_an_expiry(self):
        collection = MagicMock()
        collection.find_one_and_update.return_value = {
            "key": "global",
            "operation_lock_owner": "owner-1",
        }
        with patch.object(trading, "get_game_state"), patch.object(
            trading, "trading_game_collection", collection
        ), patch.object(trading.secrets, "token_urlsafe", return_value="owner-1"):
            owner = trading._acquire_game_lock()

        self.assertEqual(owner, "owner-1")
        query = collection.find_one_and_update.call_args.args[0]
        update = collection.find_one_and_update.call_args.args[1]
        self.assertEqual(query["key"], "global")
        self.assertEqual(update["$set"]["operation_lock_owner"], "owner-1")
        self.assertGreater(update["$set"]["operation_lock_expires_at"], datetime.now(timezone.utc))

    def test_busy_market_returns_conflict_without_writing(self):
        with patch.object(trading, "is_gamemaster", return_value=True), patch.object(
            trading, "_acquire_game_lock", return_value=None
        ), patch.object(trading.trading_game_collection, "update_one") as update:
            result = trading.start_round("host@example.edu")

        self.assertEqual(result, "game_busy")
        update.assert_not_called()
        with self.assertRaises(routes.HTTPException) as context:
            routes.trading_result_or_error(result)
        self.assertEqual(context.exception.status_code, 409)

    def test_order_releases_lock_when_round_is_closed(self):
        team = {"team_code": "FD-ONE", "leader_email": "student@example.edu"}
        with patch.object(trading, "_acquire_game_lock", return_value="owner-1"), patch.object(
            trading, "_release_game_lock"
        ) as release, patch.object(
            trading,
            "public_game_state",
            return_value={"current_period_index": 0, "is_round_open": False},
        ), patch.object(trading.trading_order_collection, "insert_one") as insert:
            result = trading._place_team_order(team, "stock_a", "buy", 1, "discrete")

        self.assertEqual(result, "round_closed")
        release.assert_called_once_with("owner-1")
        insert.assert_not_called()

    def test_game_state_first_use_recovers_when_another_worker_wins(self):
        collection = MagicMock()
        expected = {"key": "global", "current_period_index": 0}
        collection.find_one_and_update.side_effect = DuplicateKeyError("duplicate")
        collection.find_one.return_value = expected
        with patch.object(trading, "trading_game_collection", collection):
            state = trading.get_game_state()

        self.assertEqual(state, expected)
        collection.find_one.assert_called_once_with({"key": "global"})

    def test_current_quarter_interest_is_not_spendable_twice(self):
        existing_order = {
            "period_index": 0,
            "asset_id": "stock_a",
            "side": "buy",
            "quantity": 3125,
            "price": 160,
        }
        with patch.object(trading, "_orders_for_team", return_value=[existing_order]):
            portfolio = trading.simulate_portfolio("FD-ONE", 0)

        self.assertEqual(portfolio["available_cash"], 500_000)
        self.assertEqual(portfolio["cash"], 502_500)

        team = {"team_code": "FD-ONE", "leader_email": "student@example.edu"}
        with patch.object(trading, "_acquire_game_lock", return_value="owner-1"), patch.object(
            trading, "_release_game_lock"
        ) as release, patch.object(
            trading,
            "public_game_state",
            return_value={"current_period_index": 0, "is_round_open": True},
        ), patch.object(
            trading,
            "simulate_portfolio",
            return_value=portfolio,
        ), patch.object(trading.trading_order_collection, "insert_one") as insert:
            result = trading._place_team_order(
                team,
                "stock_a",
                "buy",
                3140.625,
                "discrete",
            )

        self.assertEqual(result, "insufficient_cash")
        release.assert_called_once_with("owner-1")
        insert.assert_not_called()


class MagicLinkSecurityTests(unittest.TestCase):
    def test_portal_code_is_bound_to_email_and_scope(self):
        payload = routes.EmailLinkVerify(
            email="student@connect.ust.hk",
            code="123456",
        )
        user = {"_id": ObjectId(), "email": "student@connect.ust.hk"}
        with patch.object(routes, "consume_magic_link", return_value=user) as consume:
            response = routes.verify_email_link(payload)

        self.assertEqual(response["email"], "student@connect.ust.hk")
        consume.assert_called_once_with(
            "123456",
            expected_email="student@connect.ust.hk",
            expected_scope="portal",
        )

    def test_player_code_is_bound_before_session_creation(self):
        payload = routes.TradingEmailCodeVerify(
            email="player@example.edu",
            code="654321",
        )
        user = {"_id": ObjectId(), "email": "player@example.edu"}
        session = {"token": "opaque", "email": "player@example.edu", "audience": "player"}
        with patch.object(routes, "consume_magic_link", return_value=user) as consume, patch.object(
            routes, "create_trading_session", return_value=session
        ) as create_session:
            response = routes.verify_player_trading_email_code(payload)

        self.assertEqual(response["trading_session"], session)
        consume.assert_called_once_with(
            "654321",
            expected_email="player@example.edu",
            expected_scope="trading_player",
        )
        create_session.assert_called_once_with("player@example.edu", audience="player")

    def test_gamemaster_code_is_bound_before_session_creation(self):
        payload = routes.TradingEmailCodeVerify(
            email="host@example.edu",
            code="987654",
        )
        user = {"_id": ObjectId(), "email": "host@example.edu"}
        session = {"token": "opaque", "email": "host@example.edu", "audience": "gamemaster"}
        with patch.object(routes, "consume_magic_link", return_value=user) as consume, patch.object(
            routes, "create_trading_session", return_value=session
        ) as create_session:
            response = routes.verify_gamemaster_trading_email_code(payload)

        self.assertEqual(response["trading_session"], session)
        consume.assert_called_once_with(
            "987654",
            expected_email="host@example.edu",
            expected_scope="trading_gamemaster",
        )
        create_session.assert_called_once_with("host@example.edu", audience="gamemaster")

    def test_malformed_challenge_email_is_a_client_error(self):
        payload = routes.TradingEmailCodeVerify(email="not-an-email", code="123456")
        with self.assertRaises(routes.HTTPException) as context:
            routes.verify_trading_email_code(payload)
        self.assertEqual(context.exception.status_code, 400)

    def test_empty_portal_email_cannot_disable_code_binding(self):
        payload = routes.EmailLinkVerify(email="", code="123456")
        with self.assertRaises(routes.HTTPException) as context:
            routes.verify_email_link(payload)
        self.assertEqual(context.exception.status_code, 400)

    def test_wrong_code_increments_attempts_for_that_email_and_scope(self):
        collection = MagicMock()
        collection.find_one_and_update.side_effect = [None, {"failed_attempts": 1}]
        with patch.object(magic_link, "magic_link_collection", collection):
            user = magic_link.consume_magic_link(
                "000000",
                expected_email="player@example.edu",
                expected_scope="trading",
            )

        self.assertIsNone(user)
        self.assertEqual(collection.find_one_and_update.call_count, 2)
        failure_query = collection.find_one_and_update.call_args_list[1].args[0]
        failure_update = collection.find_one_and_update.call_args_list[1].args[1]
        self.assertEqual(failure_query["email"], "player@example.edu")
        self.assertEqual(failure_query["access_scope"], "trading")
        self.assertEqual(failure_update["$inc"], {"failed_attempts": 1})

    def test_invalid_cooldown_environment_uses_safe_default(self):
        with patch.dict(os.environ, {"MAGIC_LINK_REQUEST_COOLDOWN_SECONDS": "oops"}):
            self.assertEqual(magic_link._request_cooldown_seconds(), 60)

    def test_concurrent_request_claim_is_rate_limited(self):
        request_collection = MagicMock()
        request_collection.find_one_and_update.side_effect = DuplicateKeyError("duplicate")
        with patch.object(
            magic_link,
            "magic_link_request_collection",
            request_collection,
        ):
            with self.assertRaises(magic_link.MagicLinkError):
                magic_link._claim_request_slot("player@example.edu", "trading", 60)

    def test_smtp_failure_removes_pending_code_and_releases_request_slot(self):
        collection = MagicMock()
        inserted_id = ObjectId()
        collection.insert_one.return_value.inserted_id = inserted_id
        with patch.object(
            magic_link,
            "magic_link_collection",
            collection,
        ), patch.object(
            magic_link,
            "_claim_request_slot",
            return_value=("trading:player@example.edu", "request-1"),
        ), patch.object(
            magic_link,
            "_release_request_slot",
        ) as release, patch.object(
            magic_link,
            "send_email",
            side_effect=EmailSendError("smtp down"),
        ):
            with self.assertRaises(EmailSendError):
                magic_link.create_magic_link_for_email(
                    "player@example.edu",
                    access_scope="trading",
                )

        collection.delete_one.assert_called_once_with(
            {"_id": inserted_id, "delivery_status": "pending"}
        )
        release.assert_called_once_with("trading:player@example.edu", "request-1")


if __name__ == "__main__":
    unittest.main()
