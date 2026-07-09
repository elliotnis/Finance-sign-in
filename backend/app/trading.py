from __future__ import annotations

import math
import secrets
import string
from datetime import datetime, timezone
from typing import Any

from .mongo import (
    trading_game_collection,
    trading_order_collection,
    trading_team_collection,
)
from .utils import is_admin, is_email_allowed, normalize_email_for_access


INITIAL_CASH = 1_000_000.0
ROUND_DURATION_SECONDS = 180
TEAM_SIZE_LIMIT = 3


def _period_id(year: int, quarter: int) -> str:
    return f"{year}Q{quarter}"


PERIODS = [
    {
        "id": _period_id(year, quarter),
        "year": year,
        "quarter": quarter,
        "label": f"{year} Q{quarter}",
        "months": months,
    }
    for year in range(2018, 2023)
    for quarter, months in enumerate(
        [
            "Jan-Mar",
            "Apr-Jun",
            "Jul-Sep",
            "Oct-Dec",
        ],
        start=1,
    )
]


INTEREST_RATES = {
    2018: 0.020,
    2019: 0.015,
    2020: 0.0025,
    2021: 0.0025,
    2022: 0.035,
}


ASSETS = [
    {
        "id": "stock_a",
        "fake_name": "Stock A",
        "kind": "Equity",
        "tradable": True,
        "unit": "share",
        "color": "#1f6feb",
        "profile": "Large social platform exposed to advertising growth, privacy shocks, and risk appetite.",
        "prices": [
            160, 194, 164, 131,
            166, 193, 178, 205,
            166, 227, 261, 273,
            294, 347, 339, 336,
            222, 161, 136, 120,
        ],
    },
    {
        "id": "stock_b",
        "fake_name": "Stock B",
        "kind": "Equity",
        "tradable": True,
        "unit": "share",
        "color": "#ce7e00",
        "profile": "Leveraged energy producer that is highly sensitive to oil shocks and balance-sheet pressure.",
        "prices": [
            65, 83, 82, 61,
            66, 51, 44, 41,
            13, 18, 10, 17,
            26, 31, 30, 29,
            57, 59, 62, 63,
        ],
    },
    {
        "id": "stock_c",
        "fake_name": "Stock C",
        "kind": "Equity",
        "tradable": True,
        "unit": "share",
        "color": "#7c3aed",
        "profile": "Defensive healthcare compounder with drug-trial catalysts and obesity-treatment optionality.",
        "prices": [
            85, 92, 107, 116,
            125, 111, 110, 131,
            140, 164, 150, 169,
            184, 229, 232, 276,
            286, 324, 336, 366,
        ],
    },
    {
        "id": "metal_d",
        "fake_name": "Metal D",
        "kind": "Commodity",
        "tradable": True,
        "unit": "oz",
        "color": "#b88a00",
        "profile": "Safe-haven metal affected by real yields, liquidity stress, and war-risk demand.",
        "prices": [
            1320, 1250, 1190, 1282,
            1292, 1409, 1472, 1517,
            1570, 1780, 1885, 1898,
            1730, 1765, 1758, 1829,
            1920, 1810, 1660, 1824,
        ],
    },
    {
        "id": "energy_e",
        "fake_name": "Energy E",
        "kind": "Commodity",
        "tradable": True,
        "unit": "barrel",
        "color": "#0f766e",
        "profile": "Energy contract driven by sanctions, demand collapses, supply discipline, and war premiums.",
        "prices": [
            65, 74, 76, 42,
            60, 58, 56, 61,
            20, 39, 40, 48,
            59, 73, 75, 75,
            101, 109, 82, 80,
        ],
    },
    {
        "id": "fx_f",
        "fake_name": "FX Pair F",
        "kind": "FX",
        "tradable": True,
        "unit": "lot",
        "color": "#0b7285",
        "profile": "Dollar-linked currency pair that moves with rate differentials and global stress.",
        "prices": [
            1.23, 1.17, 1.16, 1.15,
            1.14, 1.13, 1.10, 1.12,
            1.10, 1.12, 1.17, 1.22,
            1.18, 1.19, 1.16, 1.13,
            1.11, 1.05, 0.98, 1.07,
        ],
    },
    {
        "id": "fear_g",
        "fake_name": "Fear Gauge G",
        "kind": "Indicator",
        "tradable": False,
        "unit": "index",
        "color": "#dc2626",
        "profile": "Volatility indicator for market stress; visible to teams but not directly tradable.",
        "prices": [
            37, 16, 22, 36,
            15, 18, 21, 14,
            83, 35, 27, 23,
            21, 16, 19, 17,
            36, 29, 33, 22,
        ],
    },
]


NEWS_BY_YEAR = {
    2018: [
        {
            "asset_id": "stock_a",
            "summary": "A privacy scandal and slower user growth hit the social-platform proxy while the wider market sold off late in the year.",
            "rumor": "Forum chatter says regulators may force a costly product redesign.",
        },
        {
            "asset_id": "stock_b",
            "summary": "Energy-linked equities rallied with crude early, then cracked as oversupply fears returned in Q4.",
            "rumor": "Desk rumor: management is hunting for a large acquisition.",
        },
        {
            "asset_id": "stock_c",
            "summary": "The healthcare proxy advanced steadily as core drug franchises expanded.",
            "rumor": "Clinical-trial watchers think the pipeline is deeper than the market assumes.",
        },
        {
            "asset_id": "metal_d",
            "summary": "Higher rates and a strong dollar pressured safe-haven metal before a year-end bounce.",
            "rumor": "Macro blogs argue the late bounce is only short covering.",
        },
        {
            "asset_id": "energy_e",
            "summary": "Supply concerns pushed energy higher before Q4 oversupply fears caused a sharp reversal.",
            "rumor": "Shipping desks report inventories building faster than headlines suggest.",
        },
    ],
    2019: [
        {
            "asset_id": "stock_a",
            "summary": "The social-platform proxy recovered as advertising demand stabilized despite recurring political pressure.",
            "rumor": "A product-growth leak suggests engagement is improving in smaller markets.",
        },
        {
            "asset_id": "stock_b",
            "summary": "A debt-heavy acquisition plan damaged confidence in the energy proxy.",
            "rumor": "Credit desks say the dividend may become harder to defend.",
        },
        {
            "asset_id": "stock_c",
            "summary": "The healthcare proxy absorbed political drug-pricing pressure while buying a precision-medicine asset.",
            "rumor": "Specialists say the acquisition could be strategically cheap if trials convert.",
        },
        {
            "asset_id": "metal_d",
            "summary": "Central-bank easing and trade-war uncertainty supported a strong metal rally.",
            "rumor": "Risk desks say real-money funds are rebuilding safe-haven allocations.",
        },
        {
            "asset_id": "fx_f",
            "summary": "Rate cuts and trade-war uncertainty pulled the currency pair through a choppy range.",
            "rumor": "Macro traders are fading every relief rally until trade language changes.",
        },
    ],
    2020: [
        {
            "asset_id": "stock_a",
            "summary": "The platform proxy fell in the COVID crash but rebounded with online advertising and e-commerce demand.",
            "rumor": "User data whispers point to a sharp lockdown engagement spike.",
        },
        {
            "asset_id": "stock_b",
            "summary": "The energy proxy nearly broke under COVID demand destruction, negative oil, and acquisition debt.",
            "rumor": "Message boards speculate lenders may demand asset sales.",
        },
        {
            "asset_id": "stock_c",
            "summary": "The healthcare proxy behaved defensively and gained attention from an emergency-use treatment.",
            "rumor": "Trial watchers say one late-stage readout could change the growth story.",
        },
        {
            "asset_id": "metal_d",
            "summary": "Safe-haven metal briefly sold off for cash, then surged on stimulus and risk hedging.",
            "rumor": "Macro tourists are buying metal as a stimulus hedge.",
        },
        {
            "asset_id": "energy_e",
            "summary": "Energy collapsed as demand disappeared and storage filled, then recovered after supply cuts.",
            "rumor": "Physical traders warn storage constraints are worse than screens imply.",
        },
    ],
    2021: [
        {
            "asset_id": "stock_a",
            "summary": "The platform proxy reached a high before growth and identity-shift concerns appeared.",
            "rumor": "Social chatter says a major rebrand could distract management.",
        },
        {
            "asset_id": "stock_b",
            "summary": "The energy proxy improved as reopening demand lifted crude.",
            "rumor": "Value investors are quietly revisiting the balance-sheet story.",
        },
        {
            "asset_id": "stock_c",
            "summary": "Two major drug narratives lifted the healthcare proxy despite a risk-on market.",
            "rumor": "Doctors in specialist forums are discussing unusually strong trial data.",
        },
        {
            "asset_id": "fear_g",
            "summary": "Volatility faded from 2020 extremes but spiked around meme-stock and variant shocks.",
            "rumor": "Options desks say retail call volume is distorting risk readings.",
        },
        {
            "asset_id": "fx_f",
            "summary": "The currency pair weakened gradually as rate expectations diverged.",
            "rumor": "Macro funds are positioning for a stronger dollar cycle.",
        },
    ],
    2022: [
        {
            "asset_id": "stock_a",
            "summary": "The platform proxy collapsed under privacy changes, slowing users, heavy investment, and higher rates.",
            "rumor": "Ad buyers say measurement issues are worse than management admits.",
        },
        {
            "asset_id": "stock_b",
            "summary": "The energy proxy became a standout winner as war-risk premiums and investor accumulation lifted sentiment.",
            "rumor": "Market chatter says a famous capital allocator is still buying dips.",
        },
        {
            "asset_id": "stock_c",
            "summary": "The healthcare proxy rose against the bear market on obesity-treatment expectations.",
            "rumor": "Channel checks suggest demand could exceed production capacity.",
        },
        {
            "asset_id": "metal_d",
            "summary": "Metal spiked on war risk, then fell under aggressive rate hikes and dollar strength before recovering.",
            "rumor": "Gold desks say the move is a round trip, not a clean trend.",
        },
        {
            "asset_id": "energy_e",
            "summary": "Energy jumped after war began, then faded as recession risk and dollar strength weighed.",
            "rumor": "Commodity brokers say headline prices hide sharp regional stress.",
        },
    ],
}


def _asset_price_map(asset: dict[str, Any]) -> dict[str, float]:
    return {PERIODS[i]["id"]: float(price) for i, price in enumerate(asset["prices"])}


ASSET_LOOKUP = {asset["id"]: {**asset, "price_map": _asset_price_map(asset)} for asset in ASSETS}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _code(prefix: str, length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return prefix + "".join(secrets.choice(alphabet) for _ in range(length))


def _public_team(team: dict[str, Any] | None, requester: str | None = None) -> dict[str, Any] | None:
    if not team:
        return None
    requester = normalize_email_for_access(requester or "")
    is_leader = requester and requester == team.get("leader_email")
    data = {
        "team_code": team["team_code"],
        "team_name": team["team_name"],
        "leader_email": team["leader_email"],
        "members": team.get("members", []),
        "member_count": len(team.get("members", [])),
        "is_leader": bool(is_leader),
        "created_at": _serialize(team.get("created_at")),
    }
    if is_leader:
        data["api_key"] = team.get("api_key")
    return data


def _serialize(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_serialize(v) for v in value]
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    return value


def get_game_state() -> dict[str, Any]:
    state = trading_game_collection.find_one({"key": "global"})
    if state:
        return state
    state = {
        "key": "global",
        "current_period_index": 0,
        "round_duration_seconds": ROUND_DURATION_SECONDS,
        "round_started_at": None,
        "created_at": _now(),
        "updated_at": _now(),
    }
    trading_game_collection.insert_one(state)
    return trading_game_collection.find_one({"key": "global"})


def _round_seconds_left(state: dict[str, Any]) -> int:
    started = state.get("round_started_at")
    if not started:
        return 0
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    elapsed = (_now() - started).total_seconds()
    return max(0, int(state.get("round_duration_seconds", ROUND_DURATION_SECONDS) - elapsed))


def public_game_state() -> dict[str, Any]:
    state = get_game_state()
    period_index = int(state.get("current_period_index", 0))
    period_index = max(0, min(period_index, len(PERIODS) - 1))
    return {
        "current_period_index": period_index,
        "current_period": PERIODS[period_index],
        "round_duration_seconds": state.get("round_duration_seconds", ROUND_DURATION_SECONDS),
        "round_started_at": _serialize(state.get("round_started_at")),
        "seconds_left": _round_seconds_left(state),
        "is_round_open": _round_seconds_left(state) > 0,
        "is_complete": period_index >= len(PERIODS) - 1,
    }


def reset_game(admin_email: str):
    if not is_admin(admin_email):
        return "forbidden"
    trading_game_collection.update_one(
        {"key": "global"},
        {
            "$set": {
                "current_period_index": 0,
                "round_duration_seconds": ROUND_DURATION_SECONDS,
                "round_started_at": None,
                "updated_at": _now(),
            },
            "$setOnInsert": {"created_at": _now()},
        },
        upsert=True,
    )
    return public_game_state()


def start_round(admin_email: str):
    if not is_admin(admin_email):
        return "forbidden"
    trading_game_collection.update_one(
        {"key": "global"},
        {
            "$set": {
                "round_started_at": _now(),
                "round_duration_seconds": ROUND_DURATION_SECONDS,
                "updated_at": _now(),
            },
            "$setOnInsert": {"created_at": _now(), "current_period_index": 0},
        },
        upsert=True,
    )
    return public_game_state()


def advance_round(admin_email: str):
    if not is_admin(admin_email):
        return "forbidden"
    state = get_game_state()
    next_index = min(int(state.get("current_period_index", 0)) + 1, len(PERIODS) - 1)
    trading_game_collection.update_one(
        {"key": "global"},
        {
            "$set": {
                "current_period_index": next_index,
                "round_started_at": _now(),
                "round_duration_seconds": ROUND_DURATION_SECONDS,
                "updated_at": _now(),
            }
        },
    )
    return public_game_state()


def create_team(team_name: str, leader_email: str):
    leader_email = normalize_email_for_access(leader_email)
    if not is_email_allowed(leader_email):
        return "email_not_allowed"
    existing = trading_team_collection.find_one({"members": leader_email})
    if existing:
        return "already_in_team"

    team = {
        "team_name": (team_name or "Trading Team").strip()[:80],
        "leader_email": leader_email,
        "members": [leader_email],
        "team_code": _code("FD-"),
        "api_key": _code("fd_live_", 24),
        "created_at": _now(),
        "updated_at": _now(),
    }
    trading_team_collection.insert_one(team)
    return _public_team(team, leader_email)


def join_team(team_code: str, email: str):
    email = normalize_email_for_access(email)
    if not is_email_allowed(email):
        return "email_not_allowed"
    if trading_team_collection.find_one({"members": email}):
        return "already_in_team"
    team = trading_team_collection.find_one({"team_code": (team_code or "").strip().upper()})
    if not team:
        return "not_found"
    if len(team.get("members", [])) >= TEAM_SIZE_LIMIT:
        return "team_full"
    trading_team_collection.update_one(
        {"_id": team["_id"]},
        {"$addToSet": {"members": email}, "$set": {"updated_at": _now()}},
    )
    return _public_team(trading_team_collection.find_one({"_id": team["_id"]}), email)


def get_team_for_email(email: str):
    email = normalize_email_for_access(email)
    return trading_team_collection.find_one({"members": email})


def _orders_for_team(team_code: str):
    return list(trading_order_collection.find({"team_code": team_code}).sort([("period_index", 1), ("created_at", 1)]))


def period_price(asset_id: str, period_index: int) -> float:
    asset = ASSET_LOOKUP[asset_id]
    period_index = max(0, min(period_index, len(PERIODS) - 1))
    return float(asset["prices"][period_index])


def continuous_price(asset_id: str, period_index: int | None = None) -> float:
    if period_index is None:
        period_index = public_game_state()["current_period_index"]
    base = period_price(asset_id, period_index)
    phase = (_now().timestamp() / 17.0) + (list(ASSET_LOOKUP).index(asset_id) * 0.8)
    return round(base * (1 + math.sin(phase) * 0.006), 4)


def simulate_portfolio(team_code: str, through_period_index: int | None = None):
    if through_period_index is None:
        through_period_index = public_game_state()["current_period_index"]
    through_period_index = max(0, min(int(through_period_index), len(PERIODS) - 1))

    orders = _orders_for_team(team_code)
    cash = INITIAL_CASH
    holdings = {asset["id"]: 0.0 for asset in ASSETS if asset["tradable"]}
    order_cursor = 0
    history = []

    for index, period in enumerate(PERIODS[: through_period_index + 1]):
        while order_cursor < len(orders) and int(orders[order_cursor].get("period_index", 0)) == index:
            order = orders[order_cursor]
            asset_id = order["asset_id"]
            qty = float(order["quantity"])
            price = float(order["price"])
            gross = qty * price
            if order["side"] == "buy":
                cash -= gross
                holdings[asset_id] = holdings.get(asset_id, 0.0) + qty
            elif order["side"] == "sell":
                cash += gross
                holdings[asset_id] = holdings.get(asset_id, 0.0) - qty
            order_cursor += 1

        quarterly_rate = INTEREST_RATES.get(period["year"], 0.0) / 4.0
        cash *= 1 + quarterly_rate
        position_value = sum(
            qty * period_price(asset_id, index)
            for asset_id, qty in holdings.items()
            if qty
        )
        history.append(
            {
                "period": period,
                "cash": round(cash, 2),
                "position_value": round(position_value, 2),
                "equity": round(cash + position_value, 2),
                "return_pct": round(((cash + position_value) / INITIAL_CASH - 1) * 100, 2),
            }
        )

    return {
        "cash": round(cash, 2),
        "holdings": [
            {
                "asset_id": asset_id,
                "quantity": round(qty, 4),
                "price": period_price(asset_id, through_period_index),
                "value": round(qty * period_price(asset_id, through_period_index), 2),
            }
            for asset_id, qty in holdings.items()
            if abs(qty) > 0.0001
        ],
        "history": history,
        "equity": history[-1]["equity"] if history else INITIAL_CASH,
        "return_pct": history[-1]["return_pct"] if history else 0,
    }


def place_order(email: str, asset_id: str, side: str, quantity: float, mode: str = "discrete"):
    email = normalize_email_for_access(email)
    team = get_team_for_email(email)
    if not team:
        return "team_required"
    if team.get("leader_email") != email:
        return "leader_required"
    return _place_team_order(team, asset_id, side, quantity, mode)


def place_api_order(api_key: str, asset_id: str, side: str, quantity: float):
    team = trading_team_collection.find_one({"api_key": api_key})
    if not team:
        return "invalid_api_key"
    return _place_team_order(team, asset_id, side, quantity, "continuous")


def _place_team_order(team: dict[str, Any], asset_id: str, side: str, quantity: float, mode: str):
    asset = ASSET_LOOKUP.get(asset_id)
    if not asset or not asset.get("tradable"):
        return "invalid_asset"
    side = (side or "").lower()
    if side not in {"buy", "sell"}:
        return "invalid_side"
    try:
        quantity = float(quantity)
    except (TypeError, ValueError):
        return "invalid_quantity"
    if quantity <= 0:
        return "invalid_quantity"

    state = public_game_state()
    period_index = state["current_period_index"]
    if mode == "discrete" and not state["is_round_open"]:
        return "round_closed"

    portfolio = simulate_portfolio(team["team_code"], period_index)
    held_qty = next((h["quantity"] for h in portfolio["holdings"] if h["asset_id"] == asset_id), 0.0)
    price = continuous_price(asset_id, period_index) if mode == "continuous" else period_price(asset_id, period_index)
    gross = quantity * price

    if side == "buy" and gross > portfolio["cash"]:
        return "insufficient_cash"
    if side == "sell" and quantity > held_qty:
        return "insufficient_holdings"

    order = {
        "team_code": team["team_code"],
        "asset_id": asset_id,
        "side": side,
        "quantity": quantity,
        "price": round(price, 4),
        "gross": round(gross, 2),
        "mode": mode,
        "period_index": period_index,
        "period_id": PERIODS[period_index]["id"],
        "created_by": team["leader_email"] if mode == "discrete" else "api",
        "created_at": _now(),
    }
    result = trading_order_collection.insert_one(order)
    order["id"] = str(result.inserted_id)
    return _serialize(order)


def _asset_payload(period_index: int):
    return [
        {
            "id": asset["id"],
            "fake_name": asset["fake_name"],
            "kind": asset["kind"],
            "tradable": asset["tradable"],
            "unit": asset["unit"],
            "color": asset["color"],
            "profile": asset["profile"],
            "price": period_price(asset["id"], period_index),
            "continuous_price": continuous_price(asset["id"], period_index),
            "series": [
                {"period_id": PERIODS[i]["id"], "label": PERIODS[i]["label"], "price": float(price)}
                for i, price in enumerate(asset["prices"])
            ],
        }
        for asset in ASSETS
    ]


def _news_payload(period_index: int):
    visible_years = {p["year"] for p in PERIODS[: period_index + 1]}
    items = []
    for year in sorted(visible_years):
        for item in NEWS_BY_YEAR.get(year, []):
            asset = ASSET_LOOKUP.get(item["asset_id"])
            items.append(
                {
                    "year": year,
                    "asset_id": item["asset_id"],
                    "asset_name": asset["fake_name"] if asset else "Market",
                    "summary": item["summary"],
                    "rumor": item["rumor"],
                }
            )
    return items


def leaderboard(period_index: int | None = None):
    if period_index is None:
        period_index = public_game_state()["current_period_index"]
    rows = []
    for team in trading_team_collection.find({}).sort([("created_at", 1)]):
        portfolio = simulate_portfolio(team["team_code"], period_index)
        rows.append(
            {
                "team_code": team["team_code"],
                "team_name": team["team_name"],
                "leader_email": team["leader_email"],
                "member_count": len(team.get("members", [])),
                "equity": portfolio["equity"],
                "return_pct": portfolio["return_pct"],
            }
        )
    rows.sort(key=lambda row: row["equity"], reverse=True)
    return [{**row, "rank": index + 1} for index, row in enumerate(rows)]


def team_state(email: str):
    email = normalize_email_for_access(email)
    if not is_email_allowed(email):
        return "email_not_allowed"
    game = public_game_state()
    team = get_team_for_email(email)
    portfolio = simulate_portfolio(team["team_code"], game["current_period_index"]) if team else None
    return {
        "game": game,
        "team": _public_team(team, email),
        "portfolio": portfolio,
        "assets": _asset_payload(game["current_period_index"]),
        "periods": PERIODS,
        "news": _news_payload(game["current_period_index"]),
        "leaderboard": leaderboard(game["current_period_index"]),
        "interest_rates": INTEREST_RATES,
        "initial_cash": INITIAL_CASH,
        "team_size_limit": TEAM_SIZE_LIMIT,
        "continuous_api": {
            "snapshot": "GET /api/trading/continuous/snapshot?api_key=YOUR_KEY",
            "order": "POST /api/trading/continuous/order",
            "order_body": {"api_key": "YOUR_KEY", "asset_id": "stock_a", "side": "buy", "quantity": 10},
        },
    }


def gamemaster_state(admin_email: str):
    admin_email = normalize_email_for_access(admin_email)
    if not is_admin(admin_email):
        return "forbidden"
    game = public_game_state()
    teams = []
    for team in trading_team_collection.find({}).sort([("created_at", 1)]):
        portfolio = simulate_portfolio(team["team_code"], game["current_period_index"])
        teams.append(
            {
                "team": _public_team(team, admin_email),
                "portfolio": portfolio,
                "orders": [_serialize(order) for order in _orders_for_team(team["team_code"])],
            }
        )
    return {
        "game": game,
        "teams": teams,
        "leaderboard": leaderboard(game["current_period_index"]),
    }


def continuous_snapshot(api_key: str):
    team = trading_team_collection.find_one({"api_key": api_key})
    if not team:
        return "invalid_api_key"
    game = public_game_state()
    return {
        "game": game,
        "team_code": team["team_code"],
        "assets": _asset_payload(game["current_period_index"]),
        "portfolio": simulate_portfolio(team["team_code"], game["current_period_index"]),
    }
