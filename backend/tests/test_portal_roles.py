import os
import unittest
from unittest.mock import patch

os.environ.setdefault(
    "DATABASE_URI",
    "mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=40&connectTimeoutMS=40",
)

from app import routes, utils
from app.schema import ProfileCreate


class PortalRoleTests(unittest.TestCase):
    def test_connect_accounts_are_students(self):
        self.assertEqual(utils.portal_role_for_email(" Student@CONNECT.UST.HK "), "student")

    def test_ust_accounts_are_staff(self):
        self.assertEqual(utils.portal_role_for_email("member@ust.hk"), "staff")

    def test_unrelated_domains_remain_external(self):
        self.assertEqual(utils.portal_role_for_email("person@example.com"), "external")

    @patch.object(routes, "is_email_allowed", return_value=True)
    @patch.object(routes, "is_admin", return_value=False)
    def test_role_endpoint_returns_staff_flags(self, _is_admin, _is_allowed):
        result = routes.get_my_role("member@ust.hk")
        self.assertEqual(result["role"], "staff")
        self.assertTrue(result["is_staff"])
        self.assertFalse(result["is_student"])

    @patch.object(routes, "create_user_profile", return_value="1")
    @patch.object(routes, "require_allowed_email")
    def test_staff_profile_discards_student_only_fields(self, _allowed, create_profile):
        payload = ProfileCreate(
            login_email="member@ust.hk",
            full_name="Staff Member",
            preferred_name="Staff",
            SID="should-not-save",
            study_year="5",
            major="FINA",
            contact_phone="1234",
            profile_email="member@ust.hk",
            graduation_year=2030,
        )
        routes.create_profile(payload)
        args = create_profile.call_args.args
        self.assertEqual(args[1], "")
        self.assertEqual(args[4], "")
        self.assertEqual(args[5], "")
        self.assertIsNone(args[12])


class AudienceYearTests(unittest.TestCase):
    def test_years_four_and_five_are_valid_audiences(self):
        self.assertEqual(utils.normalize_audience(["FINA_YEAR_4"]), ["FINA_YEAR_4"])
        self.assertEqual(utils.normalize_audience(["QFIN_YEAR_5"]), ["QFIN_YEAR_5"])

    @patch.object(utils, "profile_program", return_value="FINA")
    @patch.object(utils, "get_user_profile", return_value={"study_year": "5"})
    def test_year_five_student_matches_targeted_event(self, _profile, _program):
        self.assertTrue(utils.audience_allows(["FINA_YEAR_5"], "student@connect.ust.hk"))
        self.assertFalse(utils.audience_allows(["FINA_YEAR_4"], "student@connect.ust.hk"))


if __name__ == "__main__":
    unittest.main()
