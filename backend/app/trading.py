from __future__ import annotations

import math
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from .mongo import (
    trading_game_collection,
    trading_order_collection,
    trading_team_collection,
)
from .utils import is_gamemaster, is_trading_player_email_allowed, normalize_email_for_access


INITIAL_CASH = 1_000_000.0
ROUND_DURATION_SECONDS = 180
TEAM_SIZE_LIMIT = 3
OPERATION_LOCK_SECONDS = 30


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
        "fake_name": "Pulse Social",
        "calibration_proxy": "Meta Platforms",
        "kind": "Equity",
        "tradable": True,
        "unit": "share",
        "color": "#1f6feb",
        "profile": "Global social network funded by digital advertising, where engagement, privacy rules, advertiser demand, and ambitious platform investment all matter.",
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
        "fake_name": "Cedar Ridge Energy",
        "calibration_proxy": "Occidental Petroleum",
        "kind": "Equity",
        "tradable": True,
        "unit": "share",
        "color": "#ce7e00",
        "profile": "US-focused oil-and-gas producer whose returns depend on crude prices, output discipline, debt, and capital allocation.",
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
        "fake_name": "Aster Therapeutics",
        "calibration_proxy": "Eli Lilly",
        "kind": "Equity",
        "tradable": True,
        "unit": "share",
        "color": "#7c3aed",
        "profile": "Research-led medicines company with established treatments and high-stakes late-stage programs in metabolic disease and other major conditions.",
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
        "fake_name": "Harbor Metal",
        "calibration_proxy": "Gold spot price (USD per troy ounce)",
        "kind": "Commodity",
        "tradable": True,
        "unit": "oz",
        "color": "#b88a00",
        "profile": "Defensive precious metal priced in US dollars per ounce, shaped by real yields, currency strength, central-bank demand, and risk appetite.",
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
        "fake_name": "Meridian Crude",
        "calibration_proxy": "WTI crude oil spot price",
        "kind": "Commodity",
        "tradable": True,
        "unit": "barrel",
        "color": "#0f766e",
        "profile": "Benchmark crude oil priced per barrel, driven by global mobility, producer supply policy, inventories, and geopolitical risk.",
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
        "fake_name": "Atlas Currency Pair",
        "calibration_proxy": "EUR/USD",
        "kind": "FX",
        "tradable": True,
        "unit": "lot",
        "color": "#0b7285",
        "profile": "Major developed-market currency pair driven by relative central-bank policy, growth expectations, trade, and market stress.",
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
        "fake_name": "Market Nerves Index",
        "calibration_proxy": "CBOE VIX",
        "kind": "Indicator",
        "tradable": False,
        "unit": "index",
        "color": "#dc2626",
        "profile": "Options-implied measure of expected broad-market volatility, shown as a market-stress signal only and not directly tradable.",
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
            "rumor": "Options desks warn a calm broad-market gauge can hide turbulence in individual stocks.",
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


# Student-facing clues are released in individual quarters. The longer annual
# recaps above are retained for facilitator calibration and are never returned
# to players.
NEWS_EVENTS = [
    {
        "id": "2018q1-a-privacy",
        "period_id": "2018Q1",
        "asset_id": "stock_a",
        "headline": "Questions grow around customer data",
        "brief": "Lawmakers want clearer answers about how a large consumer network handles personal information. Advertisers have not changed their plans yet.",
        "rumor": "A costly product redesign may be discussed behind closed doors.",
        "question": "Is this a short-term headline, or could it change the business model?",
    },
    {
        "id": "2018q1-c-pipeline",
        "period_id": "2018Q1",
        "asset_id": "stock_c",
        "headline": "A steady business hints at another trial update",
        "brief": "Core medicine sales remain dependable while researchers prepare a new pipeline presentation.",
        "rumor": "Specialists think the pipeline may be broader than investors expect.",
        "question": "How much should a possible future result matter today?",
    },
    {
        "id": "2018q2-e-supply",
        "period_id": "2018Q2",
        "asset_id": "energy_e",
        "headline": "Supply looks tight - for now",
        "brief": "Export disruptions are supporting energy prices, but weekly inventory declines are becoming less consistent.",
        "rumor": "Some shipping desks say hidden stockpiles are building.",
        "question": "Which matters more: today's shortage or tomorrow's inventory?",
    },
    {
        "id": "2018q3-b-deal",
        "period_id": "2018Q3",
        "asset_id": "stock_b",
        "headline": "Board studies a large expansion",
        "brief": "An energy producer is exploring a deal that could increase output and also increase debt.",
        "rumor": "Management may announce something larger than the market expects.",
        "question": "When does growth become too expensive?",
    },
    {
        "id": "2018q4-d-crosscurrents",
        "period_id": "2018Q4",
        "asset_id": "metal_d",
        "headline": "Safe-haven demand meets a strong currency",
        "brief": "Investors are nervous after a broad selloff, while higher yields and a firm US dollar remain headwinds for defensive metal.",
        "rumor": "The latest bounce may be traders closing old bets rather than starting new ones.",
        "question": "Can an asset be defensive and still face macro pressure?",
    },
    {
        "id": "2019q1-a-ads",
        "period_id": "2019Q1",
        "asset_id": "stock_a",
        "headline": "Advertisers return, scrutiny remains",
        "brief": "Marketing demand is stabilizing after a difficult year, but policy questions have not disappeared.",
        "rumor": "Engagement may be improving fastest in smaller markets.",
        "question": "Does improving demand outweigh a risk that is still unresolved?",
    },
    {
        "id": "2019q1-f-policy",
        "period_id": "2019Q1",
        "asset_id": "fx_f",
        "headline": "Central banks signal different paths",
        "brief": "Traders are comparing which central bank may ease policy first as global growth expectations soften.",
        "rumor": "Macro funds are preparing to sell every short-lived relief rally.",
        "question": "Which side of the pair has the stronger policy support?",
    },
    {
        "id": "2019q2-c-policy",
        "period_id": "2019Q2",
        "asset_id": "stock_c",
        "headline": "Pricing debate reaches healthcare",
            "brief": "Politicians are discussing medicine affordability while a major drugmaker invests in a smaller research business.",
        "rumor": "Researchers believe the acquired science may be worth more than the purchase price.",
        "question": "How do policy risk and innovation pull value in opposite directions?",
    },
    {
        "id": "2019q3-d-easing",
        "period_id": "2019Q3",
        "asset_id": "metal_d",
        "headline": "Rate cuts return to the conversation",
        "brief": "Trade uncertainty is rising and policy makers are becoming more willing to support growth.",
        "rumor": "Large long-term funds may be rebuilding defensive positions.",
        "question": "Would easier policy change the opportunity cost of holding metal?",
    },
    {
        "id": "2019q4-b-debt",
        "period_id": "2019Q4",
        "asset_id": "stock_b",
        "headline": "Big deal, bigger balance sheet",
            "brief": "An oil producer has committed to a major acquisition. Investors now have to judge the extra production against the extra debt.",
        "rumor": "Credit desks are questioning whether the dividend can stay untouched.",
        "question": "What could go right - and what must go right?",
    },
    {
        "id": "2020q1-e-storage",
        "period_id": "2020Q1",
        "asset_id": "energy_e",
        "headline": "Travel stops and storage fills",
        "brief": "A global health emergency is cutting transport demand much faster than producers can reduce supply.",
        "rumor": "Physical traders say available storage is disappearing faster than public data suggests.",
        "question": "What happens when a physical product has nowhere to go?",
    },
    {
        "id": "2020q1-g-stress",
        "period_id": "2020Q1",
        "asset_id": "fear_g",
        "headline": "Stress gauge flashes red",
        "brief": "Option prices show investors paying unusually high amounts for protection as uncertainty spreads across markets.",
        "rumor": "Some desks are selling even their safest assets just to raise cash.",
        "question": "Does extreme fear warn of more danger, or signal forced selling?",
    },
    {
        "id": "2020q2-d-policy",
        "period_id": "2020Q2",
        "asset_id": "metal_d",
        "headline": "Emergency support changes the macro picture",
        "brief": "Central banks and governments are launching unusually large support programs after a rush for cash.",
        "rumor": "New buyers are treating defensive metal as insurance against the policy response.",
        "question": "Could the same policy calm markets and create a new long-term risk?",
    },
    {
        "id": "2020q3-a-digital",
        "period_id": "2020Q3",
        "asset_id": "stock_a",
        "headline": "Online activity jumps, advertising stays uneven",
        "brief": "People are spending more time on digital services, but many small advertisers remain under pressure.",
        "rumor": "Internal usage figures may be stronger than the company has shared publicly.",
        "question": "Which is more important for this business: attention or advertiser budgets?",
    },
    {
        "id": "2020q4-c-treatment",
        "period_id": "2020Q4",
        "asset_id": "stock_c",
        "headline": "Treatment data draws attention",
        "brief": "A healthcare company reports encouraging emergency-treatment evidence while its core business remains stable.",
        "rumor": "Another late-stage trial could become the larger story.",
        "question": "How should a one-off catalyst be compared with the core business?",
    },
    {
        "id": "2021q1-b-reopening",
        "period_id": "2021Q1",
        "asset_id": "stock_b",
        "headline": "Reopening lifts fuel expectations",
            "brief": "Mobility is improving and producers are still cautious about adding supply. One producer is using stronger cash flow to repair its finances.",
        "rumor": "Value investors are quietly revisiting companies they avoided last year.",
        "question": "How quickly can better conditions repair a weak balance sheet?",
    },
    {
        "id": "2021q2-g-options",
        "period_id": "2021Q2",
        "asset_id": "fear_g",
        "headline": "Calmer index, noisy corners",
        "brief": "The broad-market stress gauge is lower, even while a few individual companies are moving wildly.",
        "rumor": "Some traders warn that a calm headline index can hide risk concentrated in single stocks.",
        "question": "Can a market look calm while parts of it are unstable?",
    },
    {
        "id": "2021q3-c-data",
        "period_id": "2021Q3",
        "asset_id": "stock_c",
        "headline": "Two research programs approach key updates",
            "brief": "A drugmaker has more than one late-stage program that could affect its future growth story.",
        "rumor": "Specialist discussions describe one dataset as unusually strong.",
        "question": "How much confidence belongs in a story before full data arrives?",
    },
    {
        "id": "2021q4-a-shift",
        "period_id": "2021Q4",
        "asset_id": "stock_a",
        "headline": "A new identity comes with a large bill",
            "brief": "A consumer internet company is redirecting investment toward a long-term platform idea while near-term growth becomes less certain.",
        "rumor": "The rebrand may be distracting leaders from the existing advertising engine.",
        "question": "When is long-term investment a strength, and when is it a warning?",
    },
    {
        "id": "2022q1-e-conflict",
        "period_id": "2022Q1",
        "asset_id": "energy_e",
        "headline": "Conflict threatens a major supply route",
        "brief": "Sanctions and transport uncertainty are forcing buyers to rethink where energy will come from.",
        "rumor": "Regional shortages may be more severe than the global benchmark suggests.",
        "question": "Is the shock temporary, or will trade routes change for longer?",
    },
    {
        "id": "2022q1-b-cashflow",
        "period_id": "2022Q1",
        "asset_id": "stock_b",
        "headline": "Stronger prices transform the debt story",
            "brief": "An oil producer is generating far more cash as the energy market tightens, giving management new choices about debt and shareholder returns.",
        "rumor": "A famous long-term investor may still be adding to a position.",
        "question": "How should improved cash flow change the way you view old debt?",
    },
    {
        "id": "2022q2-d-rates",
        "period_id": "2022Q2",
        "asset_id": "metal_d",
        "headline": "War risk meets aggressive rate hikes",
        "brief": "Demand for protection remains, while faster policy tightening and a stronger dollar raise the cost of holding defensive metal.",
        "rumor": "Some desks expect a round trip rather than a clean trend.",
        "question": "Which force is likely to last longer?",
    },
    {
        "id": "2022q3-c-demand",
        "period_id": "2022Q3",
        "asset_id": "stock_c",
        "headline": "A new treatment could face a supply problem",
        "brief": "Demand expectations for an obesity treatment are rising so quickly that manufacturing capacity is becoming part of the debate.",
        "rumor": "Early channel checks suggest demand could run ahead of production.",
        "question": "Can very strong demand still create an execution risk?",
    },
    {
        "id": "2022q4-a-measurement",
        "period_id": "2022Q4",
        "asset_id": "stock_a",
        "headline": "Advertisers question measurement",
        "brief": "Privacy changes make digital ads harder to measure just as higher rates make distant profits less valuable.",
        "rumor": "Some buyers say the measurement problem is worse than public guidance implies.",
        "question": "Are these two separate risks, or can they reinforce each other?",
    },
    {
        "id": "2022q4-f-dollar",
        "period_id": "2022Q4",
        "asset_id": "fx_f",
        "headline": "Rate gaps pull currencies apart",
            "brief": "One central bank is tightening faster while energy costs put different pressure on the two economies in a major currency pair.",
        "rumor": "Positioning may be crowded after a long move in the same direction.",
        "question": "Does a strong trend become safer or riskier when everyone sees it?",
    },
]

# Each decision window also receives a compact, forward-looking signal pack.
# These clues explain the main forces behind the *next* quarterly mark without
# revealing which fictional asset they map to. Grouped signals keep the reading
# load manageable for a three-minute high-school team discussion.
BALANCE_SIGNAL_ROWS = [
    ("2018q1-growth", "2018Q1", ["stock_a"], "Usage and ad budgets stay resilient",
     "Privacy questions are growing, but user activity remains strong and large advertisers have not reduced their budgets.",
     "Smaller advertisers may be increasing spending faster than expected.",
     "Can strong operating momentum outweigh a serious long-term risk for one more quarter?"),
    ("2018q1-energy-calm", "2018Q1", ["stock_b", "energy_e", "fear_g"], "Tighter supply meets calmer markets",
     "Oil inventories are falling while producers remain disciplined. At the same time, broad demand for market protection is easing.",
     "A few major buyers may be locking in more fuel than usual.",
     "Which assets benefit when physical supply tightens but financial fear falls?"),
    ("2018q2-platform-warning", "2018Q2", ["stock_a", "fear_g"], "Growth warning shakes confidence",
     "A large online platform warns that user growth and future profit margins may slow even though current advertising revenue is healthy.",
     "Product teams may be spending heavily to address privacy concerns.",
     "Does a strong current quarter matter if management lowers expectations?"),
    ("2018q2-health-momentum", "2018Q2", ["stock_c"], "Core medicines carry the quarter",
     "Established treatments are selling steadily while several research programs continue without a major setback.",
     "Analysts may be raising long-term estimates before the next formal update.",
     "How valuable is dependable growth when other sectors are becoming less certain?"),
    ("2018q3-risk-off", "2018Q3", ["stock_a", "fear_g", "fx_f"], "Rates and trade tension hit risky assets",
     "Borrowing costs are rising and trade tensions are weakening confidence. Investors are paying more for protection and cutting exposure to expensive growth companies.",
     "Systematic funds may have more selling to complete.",
     "Which assets are most sensitive when both rates and fear rise together?"),
    ("2018q3-oil-glut", "2018Q3", ["stock_b", "energy_e"], "Supply catches up with demand",
     "Production is rising faster than consumption, and inventories are starting to rebuild after months of tight supply.",
     "Exporters may compete for market share instead of cutting output quickly.",
     "How does an unexpected surplus affect both a commodity and a debt-heavy producer?"),
    ("2018q4-policy-pause", "2018Q4", ["stock_a", "fear_g"], "Policy makers sound more patient",
     "After a sharp selloff, policy makers signal they can slow future rate increases if growth weakens further.",
     "Large funds may be preparing to rebuild positions sold during the panic.",
     "Can a change in policy expectations reverse fear before the economy improves?"),
    ("2018q4-supply-response", "2018Q4", ["stock_b", "energy_e"], "Producers discuss supply restraint",
     "After a steep energy-price fall, major producers are considering output cuts while lower prices begin to support demand.",
     "The announced cuts may be larger than traders expect.",
     "What usually happens after low prices trigger both less supply and more demand?"),
    ("2019q1-debt-pressure", "2019Q1", ["stock_b"], "Expansion plan raises financing questions",
     "An oil producer is pursuing a large acquisition that could increase reserves but leave the combined company with much more debt.",
     "Some shareholders may oppose the deal unless terms improve.",
     "When can buying more assets destroy value for existing owners?"),
    ("2019q1-defensive-split", "2019Q1", ["stock_c", "metal_d", "fear_g"], "Defensive choices send mixed signals",
     "Medicine-pricing debate pressures healthcare shares while softer growth expectations increase demand for defensive metal and market protection.",
     "Policy proposals may be harsher in headlines than in final law.",
     "Why can two defensive assets move in different directions?"),
    ("2019q2-trade-slowdown", "2019Q2", ["stock_b", "energy_e", "fear_g"], "Trade dispute clouds industrial demand",
     "Factories and freight indicators are slowing as trade restrictions widen, weakening expected fuel demand and increasing uncertainty.",
     "Producers may delay investment before they cut current output.",
     "Which reacts first to weaker demand: the commodity, the producer, or market fear?"),
    ("2019q2-policy-support", "2019Q2", ["stock_a", "metal_d", "fx_f"], "Central banks prepare support",
     "Policy makers are discussing lower rates as global growth slows, reducing financing pressure but also changing currency and metal incentives.",
     "Markets may already expect more easing than officials will deliver.",
     "Who benefits most when rates fall but expectations are already high?"),
    ("2019q3-risk-rally", "2019Q3", ["stock_a", "stock_c", "fear_g"], "Lower rates revive risk appetite",
     "Easier financial conditions support advertising, healthcare valuations, and broader equity demand while the cost of protection falls.",
     "A temporary trade agreement may be closer than public statements suggest.",
     "How can one macro change lift very different businesses at the same time?"),
    ("2019q3-energy-balance", "2019Q3", ["stock_b", "energy_e"], "Supply discipline steadies energy",
     "Producers are limiting new spending and inventories are no longer rising as quickly, even though demand growth remains modest.",
     "Independent producers may cut drilling plans again.",
     "Is stabilization enough to help a highly indebted producer?"),
    ("2019q4-pandemic-shock", "2019Q4", ["stock_a", "stock_b", "energy_e", "fear_g"], "Health emergency threatens global activity",
     "Travel, manufacturing, and in-person commerce are suddenly at risk as a new illness spreads across borders and forecasts are cut rapidly.",
     "Restrictions may last longer than early official estimates.",
     "Which assets face direct demand destruction, and which mainly face a confidence shock?"),
    ("2019q4-defensive-offset", "2019Q4", ["stock_c", "metal_d"], "Investors search for resilience and cash",
     "Healthcare demand looks comparatively stable and defensive metal is wanted as insurance, although forced selling could briefly pressure almost everything.",
     "Emergency policy support may arrive faster than in past crises.",
     "Can a defensive asset fall temporarily during a rush for cash?"),
    ("2020q1-policy-rebound", "2020Q1", ["stock_a", "stock_c", "metal_d", "fear_g"], "Emergency support changes expectations",
     "Governments and central banks launch large support programs while digital activity and essential healthcare demand remain strong.",
     "Investors may move from maximum fear to recovery bets before the economy reopens.",
     "Which assets can recover while the real economy is still weak?"),
    ("2020q1-energy-reset", "2020Q1", ["stock_b", "energy_e"], "Historic supply cuts follow the collapse",
     "After storage stress and a demand crash, producers announce deep output cuts and some transport activity begins to recover from extremely low levels.",
     "Temporary well closures may become permanent supply reductions.",
     "Can terrible current conditions create the setup for a sharp rebound?"),
    ("2020q2-digital-ads", "2020Q2", ["stock_a"], "Digital demand recovers unevenly",
     "Online activity stays elevated and large advertisers return faster than small businesses, improving the outlook for a global ad platform.",
     "Shopping activity inside social apps may be accelerating.",
     "Does a shift in where people spend time create a durable advantage?"),
    ("2020q2-energy-fragility", "2020Q2", ["stock_b", "energy_e", "fear_g"], "Oil rebounds, balance sheets lag",
     "Crude prices recover from extreme lows, but indebted producers still face weak cash flow and refinancing pressure as market fear gradually declines.",
     "Lenders may demand asset sales even if the commodity keeps improving.",
     "Why might the commodity recover before the company that produces it?"),
    ("2020q3-reopening-trade", "2020Q3", ["stock_b", "energy_e", "fear_g"], "Vaccine progress strengthens reopening bets",
     "Encouraging vaccine results improve expectations for travel and fuel demand, helping energy markets while reducing demand for protection.",
     "Distribution could begin sooner than conservative forecasts assume.",
     "Which prices move first when investors anticipate reopening months ahead?"),
    ("2020q3-health-pipeline", "2020Q3", ["stock_c"], "Research pipeline broadens beyond the crisis",
     "A medicines company reports progress across both emergency treatments and longer-term metabolic and neurological programs.",
     "One non-pandemic program may eventually matter more than the emergency treatment.",
     "How should investors compare temporary revenue with a durable pipeline?"),
    ("2020q4-reopening-cashflow", "2020Q4", ["stock_b", "energy_e", "fear_g"], "Reopening improves the cash-flow map",
     "Vaccinations begin, mobility forecasts rise, and producers hold back spending, creating a better supply-demand outlook and calmer markets.",
     "Energy inventories may normalize faster than expected.",
     "How does restrained supply amplify a demand recovery?"),
    ("2020q4-metabolic-data", "2020Q4", ["stock_c"], "Metabolic treatment clears an important hurdle",
     "Late-stage data show meaningful improvements in a large chronic-disease market, strengthening confidence in a future product launch.",
     "Doctors may use the treatment more broadly than the initial label suggests.",
     "What makes a clinical result commercially important rather than merely interesting?"),
    ("2021q1-broad-reopening", "2021Q1", ["stock_a", "stock_b", "stock_c", "energy_e", "fear_g"], "Reopening lifts several kinds of demand",
     "Mobility, advertising, elective healthcare, and industrial activity improve together while market protection becomes less expensive.",
     "Household savings may support a stronger spending burst than forecasts show.",
     "Which businesses gain directly, and which gain mainly through confidence?"),
    ("2021q1-rate-divergence", "2021Q1", ["metal_d", "fx_f"], "Recovery changes the rate debate",
     "One economy is recovering faster, pushing its bond yields higher and changing the relative appeal of defensive metal and major currencies.",
     "Policy makers may tolerate higher inflation for longer than bond traders expect.",
     "How do relative rates connect a currency pair and a defensive metal?"),
    ("2021q2-variant-risk", "2021Q2", ["fear_g", "energy_e"], "A new variant tests the calm",
     "A more contagious virus variant creates uncertainty about travel even as vaccination keeps the base-case recovery intact.",
     "Options traders may be underpricing short-term disruption.",
     "When does a setback change the trend rather than merely interrupt it?"),
    ("2021q2-research-catalysts", "2021Q2", ["stock_c"], "Two programs strengthen the growth case",
     "Positive metabolic data and a regulatory breakthrough designation improve the odds that new medicines can expand future sales.",
     "Manufacturing capacity may become the next constraint.",
     "What new risk appears after scientific uncertainty falls?"),
    ("2021q3-inflation-shift", "2021Q3", ["fear_g", "fx_f", "metal_d"], "Inflation changes policy expectations",
     "Persistent inflation leads traders to expect earlier tightening, supporting one side of a major currency pair and challenging defensive metal.",
     "Bond markets may be moving faster than central-bank guidance.",
     "How can fear rise even when economic growth remains healthy?"),
    ("2021q3-health-repricing", "2021Q3", ["stock_c"], "Strong data expand the addressable market",
     "Research results suggest a metabolic treatment could serve a much larger patient group than investors assumed a year ago.",
     "Early demand forecasts may still underestimate physician interest.",
     "How should a larger potential market change valuation before launch?"),
    ("2021q4-energy-scarcity", "2021Q4", ["stock_b", "energy_e"], "Energy supply struggles to match reopening",
     "Demand has returned near pre-crisis levels while producer investment remains restrained, improving cash flow for efficient oil companies.",
     "A prominent long-term investor may be accumulating shares in the sector.",
     "How does scarcity affect the commodity and a leveraged producer differently?"),
    ("2021q4-growth-reset", "2021Q4", ["stock_a", "fear_g"], "Higher rates expose expensive growth plans",
     "User growth slows just as rates rise and a consumer platform commits heavily to a long-dated project with uncertain returns.",
     "Advertising measurement problems may be worse than management first expected.",
     "Why do higher rates magnify a company-specific execution problem?"),
    ("2022q1-platform-competition", "2022Q1", ["stock_a"], "Short-form competition pressures engagement",
     "A mature social platform faces stronger competition for younger users while privacy changes make advertising results harder to measure.",
     "Management may increase spending before engagement stabilizes.",
     "Can a profitable core business offset weakening user momentum?"),
    ("2022q1-obesity-breakthrough", "2022Q1", ["stock_c"], "Trial results point to a very large market",
     "A late-stage obesity study reports unusually strong results, increasing expectations for demand across metabolic disease treatment.",
     "Insurers may cover the treatment sooner than expected.",
     "What must happen after strong science for shareholders to benefit?"),
    ("2022q2-recession-energy", "2022Q2", ["stock_b", "energy_e"], "Recession fears challenge the energy spike",
     "Rapid rate increases and slowing activity forecasts reduce expected fuel demand after an extreme war-driven price surge.",
     "Physical shortages may ease before geopolitical risk disappears.",
     "Can demand fear overpower a genuine supply problem?"),
    ("2022q2-dollar-squeeze", "2022Q2", ["stock_a", "metal_d", "fx_f", "fear_g"], "A stronger dollar tightens global conditions",
     "Faster US rate increases strengthen the dollar, pressure a major currency pair and defensive metal, and keep volatility elevated.",
     "Crowded dollar positions may eventually become vulnerable to reversal.",
     "Which move is driven by fundamentals, and which may be driven by positioning?"),
    ("2022q3-inflation-turn", "2022Q3", ["metal_d", "fx_f", "fear_g"], "Inflation shows early signs of cooling",
     "Softer inflation data raise hopes that rate increases can slow, weakening the dollar from extreme levels and calming market stress.",
     "Policy makers may still resist declaring victory.",
     "Why can markets turn before central banks officially change direction?"),
    ("2022q3-advertising-slump", "2022Q3", ["stock_a"], "Weak advertising meets heavy spending",
     "Advertisers cut budgets as economic growth slows, while a consumer platform continues investing heavily in an uncertain long-term project.",
     "Cost reductions may arrive later than investors want.",
     "Which matters more during a slowdown: current revenue weakness or future investment discipline?"),
]

NEWS_EVENTS.extend(
    {
        "id": row_id,
        "period_id": period_id,
        "asset_ids": asset_ids,
        "headline": headline,
        "brief": brief,
        "rumor": rumor,
        "question": question,
    }
    for row_id, period_id, asset_ids, headline, brief, rumor, question in BALANCE_SIGNAL_ROWS
)


def _asset_price_map(asset: dict[str, Any]) -> dict[str, float]:
    return {PERIODS[i]["id"]: float(price) for i, price in enumerate(asset["prices"])}


ASSET_LOOKUP = {asset["id"]: {**asset, "price_map": _asset_price_map(asset)} for asset in ASSETS}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _code(prefix: str, length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return prefix + "".join(secrets.choice(alphabet) for _ in range(length))


def _masked_email(email: str) -> str:
    local, separator, domain = (email or "").partition("@")
    if not separator:
        return "Participant"
    if len(local) <= 2:
        masked_local = f"{local[:1]}***"
    else:
        masked_local = f"{local[0]}***{local[-1]}"
    return f"{masked_local}@{domain}"


def _public_team(
    team: dict[str, Any] | None,
    requester: str | None = None,
    *,
    include_api_key: bool = False,
) -> dict[str, Any] | None:
    if not team:
        return None
    requester = normalize_email_for_access(requester or "")
    is_leader = requester and requester == team.get("leader_email")
    can_view_private_members = bool(requester and is_gamemaster(requester))
    leader_email = team.get("leader_email", "")
    members = []
    for index, raw_email in enumerate(team.get("members", []), start=1):
        normalized_member = normalize_email_for_access(raw_email)
        is_self = normalized_member == requester
        members.append(
            {
                "slot": index,
                "display_email": (
                    normalized_member
                    if is_self or can_view_private_members
                    else _masked_email(normalized_member)
                ),
                "is_self": is_self,
                "is_leader": normalized_member == leader_email,
            }
        )
    data = {
        "team_code": team["team_code"],
        "team_name": team["team_name"],
        "members": members,
        "member_count": len(members),
        "is_leader": bool(is_leader),
        "created_at": _serialize(team.get("created_at")),
    }
    if is_leader and include_api_key:
        data["api_key"] = team.get("api_key")
    return data


def _serialize(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_serialize(v) for v in value]
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    if isinstance(value, ObjectId):
        return str(value)
    return value


def get_game_state() -> dict[str, Any]:
    now = _now()
    try:
        return trading_game_collection.find_one_and_update(
            {"key": "global"},
            {
                "$setOnInsert": {
                    "key": "global",
                    "current_period_index": 0,
                    "round_duration_seconds": ROUND_DURATION_SECONDS,
                    "round_started_at": None,
                    "created_at": now,
                    "updated_at": now,
                }
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        # Another worker won the first-use upsert against the unique key index.
        return trading_game_collection.find_one({"key": "global"})


def _acquire_game_lock() -> str | None:
    """Claim a short Mongo-backed lease for challenge state mutations."""
    get_game_state()
    owner = secrets.token_urlsafe(18)
    now = _now()
    locked = trading_game_collection.find_one_and_update(
        {
            "key": "global",
            "$or": [
                {"operation_lock_expires_at": {"$lte": now}},
                {"operation_lock_expires_at": None},
                {"operation_lock_expires_at": {"$exists": False}},
            ],
        },
        {
            "$set": {
                "operation_lock_owner": owner,
                "operation_lock_expires_at": now
                + timedelta(seconds=OPERATION_LOCK_SECONDS),
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    return owner if locked and locked.get("operation_lock_owner") == owner else None


def _release_game_lock(owner: str) -> None:
    trading_game_collection.update_one(
        {"key": "global", "operation_lock_owner": owner},
        {
            "$unset": {
                "operation_lock_owner": "",
                "operation_lock_expires_at": "",
            }
        },
    )


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
    if not is_gamemaster(admin_email):
        return "forbidden"
    lock_owner = _acquire_game_lock()
    if not lock_owner:
        return "game_busy"
    try:
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
        # A reset starts a fresh competition while keeping organized teams.
        trading_order_collection.delete_many({})
    finally:
        _release_game_lock(lock_owner)
    return public_game_state()


def start_round(admin_email: str):
    if not is_gamemaster(admin_email):
        return "forbidden"
    lock_owner = _acquire_game_lock()
    if not lock_owner:
        return "game_busy"
    try:
        if public_game_state()["is_complete"]:
            return "game_complete"
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
    finally:
        _release_game_lock(lock_owner)
    return public_game_state()


def advance_round(admin_email: str):
    if not is_gamemaster(admin_email):
        return "forbidden"
    lock_owner = _acquire_game_lock()
    if not lock_owner:
        return "game_busy"
    try:
        state = get_game_state()
        next_index = min(
            int(state.get("current_period_index", 0)) + 1,
            len(PERIODS) - 1,
        )
        trading_game_collection.update_one(
            {"key": "global"},
            {
                "$set": {
                    "current_period_index": next_index,
                    # Advancing closes trading. The host opens the next decision
                    # window explicitly after presenting the updated briefing.
                    "round_started_at": None,
                    "round_duration_seconds": ROUND_DURATION_SECONDS,
                    "updated_at": _now(),
                }
            },
        )
    finally:
        _release_game_lock(lock_owner)
    return public_game_state()


def create_team(team_name: str, leader_email: str):
    leader_email = normalize_email_for_access(leader_email)
    if not is_trading_player_email_allowed(leader_email):
        return "email_not_allowed"
    lock_owner = _acquire_game_lock()
    if not lock_owner:
        return "game_busy"
    try:
        existing = trading_team_collection.find_one({"members": leader_email})
        if existing:
            return "already_in_team"

        clean_team_name = (team_name or "").strip()[:80] or "Trading Team"
        team = {
            "team_name": clean_team_name,
            "leader_email": leader_email,
            "members": [leader_email],
            "team_code": _code("FD-"),
            "api_key": _code("fd_live_", 24),
            "created_at": _now(),
            "updated_at": _now(),
        }
        trading_team_collection.insert_one(team)
    finally:
        _release_game_lock(lock_owner)
    return _public_team(team, leader_email, include_api_key=True)


def join_team(team_code: str, email: str):
    email = normalize_email_for_access(email)
    if not is_trading_player_email_allowed(email):
        return "email_not_allowed"
    lock_owner = _acquire_game_lock()
    if not lock_owner:
        return "game_busy"
    try:
        if trading_team_collection.find_one({"members": email}):
            return "already_in_team"
        team = trading_team_collection.find_one(
            {"team_code": (team_code or "").strip().upper()}
        )
        if not team:
            return "not_found"
        if len(team.get("members", [])) >= TEAM_SIZE_LIMIT:
            return "team_full"
        result = trading_team_collection.update_one(
            {
                "_id": team["_id"],
                "members": {"$ne": email},
                f"members.{TEAM_SIZE_LIMIT - 1}": {"$exists": False},
            },
            {"$addToSet": {"members": email}, "$set": {"updated_at": _now()}},
        )
        if result.modified_count != 1:
            return "team_full"
        updated_team = trading_team_collection.find_one({"_id": team["_id"]})
        return _public_team(updated_team, email, include_api_key=True)
    finally:
        _release_game_lock(lock_owner)


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
    # Student-facing marks are quarter-close values. They intentionally do not
    # tick during a live decision window; the next mark arrives only when the
    # gamemaster advances the quarter.
    return period_price(asset_id, period_index)


def simulate_portfolio(team_code: str, through_period_index: int | None = None):
    if through_period_index is None:
        through_period_index = public_game_state()["current_period_index"]
    through_period_index = max(0, min(int(through_period_index), len(PERIODS) - 1))

    orders = _orders_for_team(team_code)
    cash = INITIAL_CASH
    holdings = {asset["id"]: 0.0 for asset in ASSETS if asset["tradable"]}
    order_cursor = 0
    history = []
    available_cash = cash

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

        # Every order in a round is booked before that quarter's cash interest
        # is credited. This pre-interest balance is what can still be spent.
        available_cash = cash
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
                "available_cash": round(available_cash, 2),
                "cash": round(cash, 2),
                "position_value": round(position_value, 2),
                "equity": round(cash + position_value, 2),
                "return_pct": round(((cash + position_value) / INITIAL_CASH - 1) * 100, 2),
            }
        )

    return {
        "cash": round(cash, 2),
        "available_cash": round(available_cash, 2),
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
    if not is_trading_player_email_allowed(email):
        return "email_not_allowed"
    team = get_team_for_email(email)
    if not team:
        return "team_required"
    if team.get("leader_email") != email:
        return "leader_required"
    if mode not in {"discrete", "continuous"}:
        return "invalid_mode"
    return _place_team_order(team, asset_id, side, quantity, mode)


def submit_team_decisions(email: str, decisions: list[dict[str, Any]]):
    """Lock one complete decision board for the current quarter.

    A board can include buy, sell, and hold rows. It is deliberately an atomic
    submission: the captain can unsubmit the entire board while the timer is
    open, but cannot quietly change individual rows after submission.
    """
    email = normalize_email_for_access(email)
    if not is_trading_player_email_allowed(email):
        return "email_not_allowed"
    team = get_team_for_email(email)
    if not team:
        return "team_required"
    if team.get("leader_email") != email:
        return "leader_required"
    if not isinstance(decisions, list) or not decisions:
        return "invalid_decisions"

    lock_owner = _acquire_game_lock()
    if not lock_owner:
        return "game_busy"
    try:
        state = public_game_state()
        period_index = state["current_period_index"]
        if not state["is_round_open"]:
            return "round_closed"
        if trading_order_collection.find_one({
            "team_code": team["team_code"], "period_index": period_index, "mode": "discrete",
        }):
            return "order_locked"

        portfolio = simulate_portfolio(team["team_code"], period_index)
        cash = float(portfolio["available_cash"])
        holdings = {row["asset_id"]: float(row["quantity"]) for row in portfolio["holdings"]}
        seen_assets = set()
        submission_id = secrets.token_urlsafe(12)
        orders = []
        for raw in decisions:
            asset_id = str(raw.get("asset_id", ""))
            side = str(raw.get("side", "hold")).lower()
            asset = ASSET_LOOKUP.get(asset_id)
            if not asset or not asset.get("tradable"):
                return "invalid_asset"
            if asset_id in seen_assets:
                return "invalid_decisions"
            seen_assets.add(asset_id)
            if side not in {"buy", "sell", "hold"}:
                return "invalid_side"
            try:
                quantity = float(raw.get("quantity", 0))
            except (TypeError, ValueError):
                return "invalid_quantity"
            if side == "hold":
                quantity = 0.0
            if side != "hold" and (not math.isfinite(quantity) or quantity <= 0):
                return "invalid_quantity"

            price = period_price(asset_id, period_index)
            gross = quantity * price
            if side == "buy":
                if gross > cash:
                    return "insufficient_cash"
                cash -= gross
                holdings[asset_id] = holdings.get(asset_id, 0.0) + quantity
            elif side == "sell":
                if quantity > holdings.get(asset_id, 0.0):
                    return "insufficient_holdings"
                cash += gross
                holdings[asset_id] = holdings.get(asset_id, 0.0) - quantity
            orders.append({
                "team_code": team["team_code"], "asset_id": asset_id, "side": side,
                "quantity": quantity, "price": round(price, 4), "gross": round(gross, 2),
                "mode": "discrete", "submission_id": submission_id,
                "period_index": period_index, "period_id": PERIODS[period_index]["id"],
                "created_by": team["leader_email"], "created_at": _now(),
            })
        trading_order_collection.insert_many(orders)
        return {"submission_id": submission_id, "orders": [_serialize(order) for order in orders]}
    finally:
        _release_game_lock(lock_owner)


def unsubmit_team_decisions(email: str):
    """Unlock the captain's current decision board before the round closes."""
    email = normalize_email_for_access(email)
    if not is_trading_player_email_allowed(email):
        return "email_not_allowed"
    team = get_team_for_email(email)
    if not team:
        return "team_required"
    if team.get("leader_email") != email:
        return "leader_required"
    lock_owner = _acquire_game_lock()
    if not lock_owner:
        return "game_busy"
    try:
        state = public_game_state()
        if not state["is_round_open"]:
            return "round_closed"
        result = trading_order_collection.delete_many({
            "team_code": team["team_code"],
            "period_index": state["current_period_index"],
            "mode": "discrete",
        })
        if not result.deleted_count:
            return "not_submitted"
        return {"deleted_count": result.deleted_count}
    finally:
        _release_game_lock(lock_owner)


def place_api_order(api_key: str, asset_id: str, side: str, quantity: float):
    team = trading_team_collection.find_one({"api_key": api_key})
    if not team or is_gamemaster(team.get("leader_email", "")):
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
    if not math.isfinite(quantity) or quantity <= 0:
        return "invalid_quantity"

    lock_owner = _acquire_game_lock()
    if not lock_owner:
        return "game_busy"
    try:
        state = public_game_state()
        period_index = state["current_period_index"]
        if not state["is_round_open"]:
            return "round_closed"

        portfolio = simulate_portfolio(team["team_code"], period_index)
        held_qty = next(
            (
                holding["quantity"]
                for holding in portfolio["holdings"]
                if holding["asset_id"] == asset_id
            ),
            0.0,
        )
        price = (
            continuous_price(asset_id, period_index)
            if mode == "continuous"
            else period_price(asset_id, period_index)
        )
        gross = quantity * price

        if side == "buy" and gross > portfolio["available_cash"]:
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
    finally:
        _release_game_lock(lock_owner)


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
            "continuous_price": period_price(asset["id"], period_index),
            "series": [
                {"period_id": PERIODS[i]["id"], "label": PERIODS[i]["label"], "price": float(price)}
                for i, price in enumerate(asset["prices"][: period_index + 1])
            ],
        }
        for asset in ASSETS
    ]


def _news_payload(period_index: int):
    visible_period_ids = {p["id"] for p in PERIODS[: period_index + 1]}
    items = []
    for item in NEWS_EVENTS:
        if item["period_id"] not in visible_period_ids:
            continue
        period = next(p for p in PERIODS if p["id"] == item["period_id"])
        items.append(
            {
                **{key: value for key, value in item.items() if key not in {"asset_id", "asset_ids"}},
                "year": period["year"],
                "quarter": period["quarter"],
                "period_label": period["label"],
            }
        )
    return items


def _debrief_payload(period_index: int):
    """Reveal the previous decision's clue-to-asset links after prices move."""
    if period_index <= 0:
        return None
    decision_index = period_index - 1
    decision_period = PERIODS[decision_index]
    outcome_period = PERIODS[period_index]
    rows = []
    for asset in ASSETS:
        if not asset.get("tradable"):
            continue
        related = [
            event["headline"]
            for event in NEWS_EVENTS
            if event["period_id"] == decision_period["id"]
            and (
                event.get("asset_id") == asset["id"]
                or asset["id"] in event.get("asset_ids", [])
            )
        ]
        before = period_price(asset["id"], decision_index)
        after = period_price(asset["id"], period_index)
        rows.append({
            "asset_id": asset["id"],
            "asset_name": asset["fake_name"],
            "move_pct": round((after / before - 1) * 100, 2),
            "clue_headlines": related,
        })
    return {
        "decision_period": decision_period,
        "outcome_period": outcome_period,
        "rows": rows,
    }


def leaderboard(period_index: int | None = None):
    if period_index is None:
        period_index = public_game_state()["current_period_index"]
    rows = []
    for team in trading_team_collection.find({}).sort([("created_at", 1)]):
        portfolio = simulate_portfolio(team["team_code"], period_index)
        rows.append(
            {
                "team_name": team["team_name"],
                "member_count": len(team.get("members", [])),
                "equity": portfolio["equity"],
                "return_pct": portfolio["return_pct"],
            }
        )
    rows.sort(key=lambda row: row["equity"], reverse=True)
    return [{**row, "rank": index + 1} for index, row in enumerate(rows)]


def team_state(email: str):
    email = normalize_email_for_access(email)
    if not is_trading_player_email_allowed(email):
        return "email_not_allowed"
    game = public_game_state()
    team = get_team_for_email(email)
    portfolio = simulate_portfolio(team["team_code"], game["current_period_index"]) if team else None
    submitted_decisions = []
    if team:
        submitted_decisions = [
            _serialize(order)
            for order in trading_order_collection.find({
                "team_code": team["team_code"],
                "period_index": game["current_period_index"],
                "mode": "discrete",
            }).sort([("created_at", 1)])
        ]
    return {
        "game": game,
        "team": _public_team(team, email, include_api_key=True),
        "portfolio": portfolio,
        "submitted_decisions": submitted_decisions,
        "assets": _asset_payload(game["current_period_index"]),
        "periods": PERIODS,
        "news": _news_payload(game["current_period_index"]),
        "debrief": _debrief_payload(game["current_period_index"]),
        "leaderboard": leaderboard(game["current_period_index"]),
        "interest_rates": {
            year: rate
            for year, rate in INTEREST_RATES.items()
            if year <= game["current_period"]["year"]
        },
        "initial_cash": INITIAL_CASH,
        "team_size_limit": TEAM_SIZE_LIMIT,
        "continuous_api": {
            "snapshot": "GET /api/trading/continuous/snapshot with X-Team-Api-Key header",
            "order": "POST /api/trading/continuous/order",
            "order_body": {"asset_id": "stock_a", "side": "buy", "quantity": 10},
            "auth_header": "X-Team-Api-Key: YOUR_KEY",
        },
    }


def gamemaster_state(admin_email: str):
    admin_email = normalize_email_for_access(admin_email)
    if not is_gamemaster(admin_email):
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
    if not team or is_gamemaster(team.get("leader_email", "")):
        return "invalid_api_key"
    game = public_game_state()
    return {
        "game": game,
        "team_code": team["team_code"],
        "assets": _asset_payload(game["current_period_index"]),
        "portfolio": simulate_portfolio(team["team_code"], game["current_period_index"]),
    }
