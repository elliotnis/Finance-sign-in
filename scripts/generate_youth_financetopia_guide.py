#!/usr/bin/env python3
"""Build the cited Youth Financetopia facilitator PDF from game data."""

from __future__ import annotations

import ast
import html
import json
import shutil
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
TRADING_PATH = ROOT / "backend" / "app" / "trading.py"
SOURCE_PATH = ROOT / "docs" / "youth-financetopia-sources.json"
OUTPUT_PATH = ROOT / "output" / "pdf" / "youth-financetopia-facilitator-guide.pdf"
DOCS_COPY_PATH = ROOT / "docs" / "youth-financetopia-news-summary.pdf"
MARKDOWN_PATH = ROOT / "docs" / "youth-financetopia-news-summary.md"

INK = colors.HexColor("#13231F")
INK_SOFT = colors.HexColor("#31443E")
PAPER = colors.HexColor("#F4F0E3")
CREAM = colors.HexColor("#FFFAF0")
WHITE = colors.HexColor("#FFFEF9")
LINE = colors.HexColor("#C9C7B8")
BLUE = colors.HexColor("#255FDD")
TEAL = colors.HexColor("#087565")
LIME = colors.HexColor("#D9FF64")
CORAL = colors.HexColor("#FF6A4D")
YELLOW = colors.HexColor("#F5C74B")
RED = colors.HexColor("#B92D38")


REAL_MAPPING = {
    "stock_a": ("Meta Platforms / Facebook", "Advertising, privacy, platform growth and rate sensitivity"),
    "stock_b": ("Occidental Petroleum", "Commodity exposure, acquisition leverage and balance-sheet repair"),
    "stock_c": ("Eli Lilly", "Defensive sales, research catalysts and manufacturing execution"),
    "metal_d": ("Gold", "Safe-haven demand, real yields, dollar strength and liquidity"),
    "energy_e": ("Crude oil, mainly WTI", "Demand, supply, storage, sanctions and trade routes"),
    "fx_f": ("EUR/USD", "Relative policy, growth expectations and dollar cycles"),
    "fear_g": ("Cboe VIX", "Broad-market expected volatility from SPX options"),
}


EVENT_SOURCES = {
    "2018q1-a-privacy": ["S01", "S02"],
    "2018q1-c-pipeline": ["S12"],
    "2018q2-e-supply": ["S19", "S33"],
    "2018q3-b-deal": ["S08"],
    "2018q4-d-crosscurrents": ["S19", "S23"],
    "2019q1-a-ads": ["S03"],
    "2019q1-f-policy": ["S20", "S21", "S22", "S32"],
    "2019q2-c-policy": ["S13"],
    "2019q3-d-easing": ["S21", "S22", "S23"],
    "2019q4-b-debt": ["S08"],
    "2020q1-e-storage": ["S25", "S33"],
    "2020q1-g-stress": ["S28", "S34"],
    "2020q2-d-policy": ["S24"],
    "2020q3-a-digital": ["S04"],
    "2020q4-c-treatment": ["S14", "S15"],
    "2021q1-b-reopening": ["S10", "S26"],
    "2021q2-g-options": ["S27", "S28"],
    "2021q3-c-data": ["S16", "S17"],
    "2021q4-a-shift": ["S05", "S06"],
    "2022q1-e-conflict": ["S30"],
    "2022q1-b-cashflow": ["S11"],
    "2022q2-d-rates": ["S29", "S31"],
    "2022q3-c-demand": ["S18"],
    "2022q4-a-measurement": ["S06", "S07"],
    "2022q4-f-dollar": ["S29", "S32"],
    "2018q1-growth": ["S01", "S02"],
    "2018q1-energy-calm": ["S19", "S28", "S33", "S34"],
    "2018q2-platform-warning": ["S02"],
    "2018q2-health-momentum": ["S12"],
    "2018q3-risk-off": ["S20", "S28", "S32"],
    "2018q3-oil-glut": ["S19", "S33"],
    "2018q4-policy-pause": ["S20", "S28"],
    "2018q4-supply-response": ["S19", "S33"],
    "2019q1-debt-pressure": ["S08"],
    "2019q1-defensive-split": ["S13", "S23", "S28"],
    "2019q2-trade-slowdown": ["S19", "S33"],
    "2019q2-policy-support": ["S21", "S22", "S23", "S32"],
    "2019q3-risk-rally": ["S21", "S22", "S28"],
    "2019q3-energy-balance": ["S19", "S33"],
    "2019q4-pandemic-shock": ["S25", "S28", "S34"],
    "2019q4-defensive-offset": ["S13", "S23", "S24"],
    "2020q1-policy-rebound": ["S04", "S14", "S24", "S28", "S34"],
    "2020q1-energy-reset": ["S25", "S33"],
    "2020q2-digital-ads": ["S04"],
    "2020q2-energy-fragility": ["S09", "S25", "S28", "S33"],
    "2020q3-reopening-trade": ["S09", "S14", "S26", "S28"],
    "2020q3-health-pipeline": ["S14", "S15"],
    "2020q4-reopening-cashflow": ["S09", "S26", "S33"],
    "2020q4-metabolic-data": ["S16"],
    "2021q1-broad-reopening": ["S04", "S09", "S16", "S26", "S28"],
    "2021q1-rate-divergence": ["S23", "S29", "S32"],
    "2021q2-variant-risk": ["S26", "S28"],
    "2021q2-research-catalysts": ["S16", "S17"],
    "2021q3-inflation-shift": ["S23", "S28", "S29", "S32"],
    "2021q3-health-repricing": ["S16", "S17"],
    "2021q4-energy-scarcity": ["S10", "S26", "S33"],
    "2021q4-growth-reset": ["S05", "S06", "S28"],
    "2022q1-platform-competition": ["S06"],
    "2022q1-obesity-breakthrough": ["S18"],
    "2022q2-recession-energy": ["S11", "S30", "S33"],
    "2022q2-dollar-squeeze": ["S29", "S31", "S32", "S34"],
    "2022q3-inflation-turn": ["S29", "S31", "S32", "S34"],
    "2022q3-advertising-slump": ["S07"],
}


DEBRIEF_LENS = {
    "stock_a": "Separate user attention from advertiser economics, then add regulation and discount-rate risk.",
    "stock_b": "Ask whether stronger commodity cash flow is enough to compensate for leverage and execution risk.",
    "stock_c": "Distinguish dependable core sales from uncertain trial, approval and capacity outcomes.",
    "metal_d": "Compare safe-haven demand with the opportunity cost created by yields and dollar strength.",
    "energy_e": "Trace the physical chain: demand, production response, storage and regional transport limits.",
    "fx_f": "A higher proxy means euro strength and dollar weakness; compare policy and growth on both sides.",
    "fear_g": "This broad-market gauge comes from SPX options. Single-stock chaos can coexist with a calm VIX.",
}


def ascii_text(value: object) -> str:
    text = str(value or "")
    for mark in ("\u2010", "\u2011", "\u2012", "\u2013", "\u2014", "\u2212"):
        text = text.replace(mark, "-")
    return text.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')


def safe(value: object) -> str:
    return html.escape(ascii_text(value))


def literal_assignment(name: str):
    tree = ast.parse(TRADING_PATH.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign):
            if any(isinstance(target, ast.Name) and target.id == name for target in node.targets):
                return ast.literal_eval(node.value)
    raise KeyError(f"Could not find {name} in {TRADING_PATH}")


def load_events():
    events = literal_assignment("NEWS_EVENTS")
    for row_id, period_id, asset_ids, headline, brief, rumor, question in literal_assignment("BALANCE_SIGNAL_ROWS"):
        events.append({
            "id": row_id,
            "period_id": period_id,
            "asset_ids": asset_ids,
            "headline": headline,
            "brief": brief,
            "rumor": rumor,
            "question": question,
        })
    events.sort(key=lambda event: event["period_id"])
    return events


def event_asset_ids(event):
    return event.get("asset_ids") or [event["asset_id"]]


def event_asset_names(event, asset_map):
    return [asset_map[asset_id]["fake_name"] for asset_id in event_asset_ids(event)]


def event_debrief_lens(event, asset_map):
    asset_ids = event_asset_ids(event)
    if len(asset_ids) == 1:
        return DEBRIEF_LENS[asset_ids[0]]
    names = ", ".join(event_asset_names(event, asset_map))
    return (
        f"Compare how the shared signal could affect {names}. Ask students to separate direct effects "
        "from indirect effects and explain why the assets may react by different amounts."
    )


def register_fonts() -> None:
    font_dir = Path("/usr/share/fonts/truetype/dejavu")
    pdfmetrics.registerFont(TTFont("YFSans", font_dir / "DejaVuSans.ttf"))
    pdfmetrics.registerFont(TTFont("YFSansBold", font_dir / "DejaVuSans-Bold.ttf"))
    pdfmetrics.registerFont(TTFont("YFSerif", font_dir / "DejaVuSerif.ttf"))
    pdfmetrics.registerFont(TTFont("YFSerifBold", font_dir / "DejaVuSerif-Bold.ttf"))


def build_styles():
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle(
            "YFBody", parent=base["BodyText"], fontName="YFSans", fontSize=9,
            leading=13, textColor=INK_SOFT, spaceAfter=5,
        ),
        "small": ParagraphStyle(
            "YFSmall", parent=base["BodyText"], fontName="YFSans", fontSize=7.2,
            leading=9.6, textColor=INK_SOFT,
        ),
        "tiny": ParagraphStyle(
            "YFTiny", parent=base["BodyText"], fontName="YFSans", fontSize=6.4,
            leading=8, textColor=INK_SOFT, splitLongWords=True,
        ),
        "eyebrow": ParagraphStyle(
            "YFEyebrow", parent=base["BodyText"], fontName="YFSansBold", fontSize=7,
            leading=9, textColor=BLUE, tracking=1.1, spaceAfter=4,
        ),
        "title": ParagraphStyle(
            "YFTitle", parent=base["Title"], fontName="YFSerifBold", fontSize=34,
            leading=35, textColor=INK, alignment=TA_LEFT, spaceAfter=10,
        ),
        "cover_year": ParagraphStyle(
            "YFCoverYear", parent=base["Title"], fontName="YFSansBold", fontSize=48,
            leading=50, textColor=INK, alignment=TA_LEFT,
        ),
        "h1": ParagraphStyle(
            "YFH1", parent=base["Heading1"], fontName="YFSerifBold", fontSize=23,
            leading=26, textColor=INK, spaceBefore=2, spaceAfter=9,
        ),
        "h2": ParagraphStyle(
            "YFH2", parent=base["Heading2"], fontName="YFSerifBold", fontSize=14,
            leading=17, textColor=INK, spaceBefore=5, spaceAfter=5,
        ),
        "h3": ParagraphStyle(
            "YFH3", parent=base["Heading3"], fontName="YFSansBold", fontSize=10,
            leading=12, textColor=INK, spaceAfter=3,
        ),
        "card_title": ParagraphStyle(
            "YFCardTitle", parent=base["Heading3"], fontName="YFSerifBold", fontSize=11.2,
            leading=13.5, textColor=INK, spaceAfter=2,
        ),
        "card_label": ParagraphStyle(
            "YFCardLabel", parent=base["BodyText"], fontName="YFSansBold", fontSize=6.6,
            leading=8, textColor=TEAL, tracking=0.6,
        ),
        "quote": ParagraphStyle(
            "YFQuote", parent=base["BodyText"], fontName="YFSerif", fontSize=9.2,
            leading=12.5, textColor=INK, leftIndent=8, borderColor=YELLOW,
            borderWidth=0, borderPadding=0,
        ),
        "source_title": ParagraphStyle(
            "YFSourceTitle", parent=base["BodyText"], fontName="YFSansBold", fontSize=7.4,
            leading=9.5, textColor=INK,
        ),
        "source_url": ParagraphStyle(
            "YFSourceURL", parent=base["BodyText"], fontName="YFSans", fontSize=6.2,
            leading=8, textColor=BLUE, splitLongWords=True,
        ),
        "cover_center": ParagraphStyle(
            "YFCoverCenter", parent=base["BodyText"], fontName="YFSansBold", fontSize=8,
            leading=10, textColor=CREAM, alignment=TA_CENTER, tracking=1,
        ),
    }


class GuideDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs):
        super().__init__(filename, **kwargs)
        frame = Frame(
            18 * mm, 17 * mm, A4[0] - 36 * mm, A4[1] - 32 * mm,
            leftPadding=0, rightPadding=0, topPadding=7 * mm, bottomPadding=5 * mm,
        )
        self.addPageTemplates(PageTemplate(id="guide", frames=[frame], onPage=self._page_art))

    def _page_art(self, canvas, doc):
        canvas.saveState()
        canvas.setFillColor(PAPER)
        canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
        if doc.page > 1:
            canvas.setStrokeColor(LINE)
            canvas.setLineWidth(0.6)
            canvas.line(18 * mm, A4[1] - 13 * mm, A4[0] - 18 * mm, A4[1] - 13 * mm)
            canvas.setFont("YFSansBold", 6.8)
            canvas.setFillColor(INK)
            canvas.drawString(18 * mm, A4[1] - 10 * mm, "YOUTH FINANCETOPIA / FACILITATOR ONLY")
            canvas.setFont("YFSans", 6.8)
            canvas.setFillColor(INK_SOFT)
            canvas.drawRightString(A4[0] - 18 * mm, 9 * mm, f"PAGE {doc.page}")
        canvas.restoreState()


def callout(title: str, body: str, styles, background=CREAM, accent=BLUE):
    data = [[
        Paragraph(safe(title).upper(), styles["h3"]),
        Paragraph(safe(body), styles["body"]),
    ]]
    table = Table(data, colWidths=[41 * mm, 118 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("BOX", (0, 0), (-1, -1), 1, INK),
        ("LINEBEFORE", (0, 0), (0, -1), 6, accent),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def event_card(event, asset_map, styles):
    asset_ids = event_asset_ids(event)
    asset = asset_map[asset_ids[0]]
    asset_names = ", ".join(event_asset_names(event, asset_map))
    source_ids = ", ".join(EVENT_SOURCES.get(event["id"], [])) or "Scenario synthesis"
    period_asset = f"{event['period_id'][:4]} Q{event['period_id'][-1]} / {asset_names}"
    header = Table([
        [Paragraph(safe(period_asset).upper(), styles["card_label"]), Paragraph(safe(event["headline"]), styles["card_title"])],
    ], colWidths=[32 * mm, 127 * mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    body = Table([
        [Paragraph("CONFIRMED BRIEF", styles["card_label"]), Paragraph(safe(event["brief"]), styles["small"])],
        [Paragraph("FICTIONAL RUMOR", styles["card_label"]), Paragraph(safe(event["rumor"]), styles["small"])],
        [Paragraph("ASK THE ROOM", styles["card_label"]), Paragraph(safe(event["question"]), styles["quote"])],
        [Paragraph("DEBRIEF LENS", styles["card_label"]), Paragraph(safe(event_debrief_lens(event, asset_map)), styles["small"])],
        [Paragraph("SOURCE IDS", styles["card_label"]), Paragraph(safe(source_ids), styles["tiny"])],
    ], colWidths=[32 * mm, 127 * mm])
    body.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEABOVE", (0, 0), (-1, 0), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (0, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    shell = Table([[header], [body]], colWidths=[165 * mm])
    shell.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WHITE),
        ("BOX", (0, 0), (-1, -1), 0.9, INK),
        ("LINEBEFORE", (0, 0), (0, -1), 5, colors.HexColor(asset["color"])),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return KeepTogether([shell, Spacer(1, 3.2 * mm)])


def build_markdown(assets, events, sources) -> None:
    asset_map = {asset["id"]: asset for asset in assets}
    lines = [
        "---",
        'title: "Youth Financetopia Challenge: Newsroom and Facilitator Guide"',
        'subtitle: "Quarter-by-quarter cards, teaching notes and authoritative sources"',
        'date: "2026-07-12"',
        "---",
        "",
        "# Facilitator-only guide",
        "",
        "> **Contains asset mappings and debrief prompts. Do not publish this file on the student-facing site.**",
        "",
        "This is a classroom simulation, not investment advice. Prices are simplified and rounded teaching traces. The card timeline compresses real themes into a fictional 2018-2022 game sequence. Rumors are invented, and cards are not dated historical reporting or recommendations.",
        "",
        "The React challenge releases cards quarter by quarter and clips every chart to the current period. Each quarter's cards are forward-looking signals for the next revealed mark. Students see fake names only. The host controls the timer and round progression through a server-verified admin session.",
        "",
        "# Fake asset map",
        "",
        "| Game name | Real-world trace | Teaching role |",
        "| --- | --- | --- |",
    ]
    for asset in assets:
        real_name, role = REAL_MAPPING[asset["id"]]
        lines.append(f"| {ascii_text(asset['fake_name'])} | {ascii_text(real_name)} | {ascii_text(role)} |")
    lines.extend([
        "",
        "## Accuracy notes",
        "",
        "- **Fear Gauge G:** The VIX is based on S&P 500 index option prices. Single-stock or meme-stock option activity does not directly enter its calculation. Real VIX products exist, but the gauge is not tradable in this simulation.",
        "- **FX Pair F:** The proxy follows EUR/USD quote direction. Higher means euro strength and dollar weakness; lower means dollar strength.",
        "- **Medical history:** The 2020 treatment card describes information known at the time. FDA later revoked authorization for bamlanivimab when used alone; the card is not current medical guidance.",
        "",
        "# Classroom flow",
        "",
        "1. Open confirmed briefs and ask teams to paraphrase the fact.",
        "2. Use the question to surface competing explanations.",
        "3. Reveal fictional desk chatter only after students label it unverified.",
        "4. Have teams pin evidence, state a view and confidence, and write one sentence.",
        "5. The captain reviews quantity, price and estimated cash before confirming.",
        "",
        "# Quarter cards",
        "",
    ])
    current_year = None
    for event in events:
        year = event["period_id"][:4]
        if year != current_year:
            current_year = year
            lines.extend([f"## {year}", ""])
        asset_names = ", ".join(event_asset_names(event, asset_map))
        source_ids = ", ".join(EVENT_SOURCES.get(event["id"], [])) or "Scenario synthesis"
        lines.extend([
            f"### {event['period_id'][:4]} Q{event['period_id'][-1]} / {ascii_text(asset_names)}",
            "",
            f"**Headline:** {ascii_text(event['headline'])}",
            "",
            f"**Confirmed brief:** {ascii_text(event['brief'])}",
            "",
            f"**Fictional rumor:** {ascii_text(event['rumor'])}",
            "",
            f"**Ask the room:** {ascii_text(event['question'])}",
            "",
            f"**Debrief lens:** {ascii_text(event_debrief_lens(event, asset_map))}",
            "",
            f"**Source IDs:** {source_ids}",
            "",
        ])
    lines.extend([
        "# Debrief prompts",
        "",
        "1. Which statement was a fact, a rumor, or your own inference?",
        "2. What single clue changed your mind most?",
        "3. Was your confidence supported by independent evidence?",
        "4. Would you make the same choice again with the same information?",
        "5. What would a real analyst still need to know?",
        "",
        "# Plain-language glossary",
        "",
        "- **Catalyst:** An event that could change expectations or price.",
        "- **Hedge:** A position intended to reduce another risk.",
        "- **Leverage:** Debt or borrowing that can magnify gains and losses.",
        "- **Liquidity:** How easily an asset can be traded without a large price change.",
        "- **Rate differential:** The gap between interest rates in two economies.",
        "- **Real yield:** An interest rate after accounting for expected inflation.",
        "- **Short covering:** Buying that closes an earlier bet on a falling price.",
        "- **Volatility:** How widely and quickly prices move.",
        "",
        "# Source appendix",
        "",
        "Source links were checked on 2026-07-10. They anchor historical themes and simplified calibration; card wording remains a fictionalized synthesis.",
        "",
    ])
    current_group = None
    for source in sources:
        if source["group"] != current_group:
            if current_group is not None:
                lines.append("")
            current_group = source["group"]
            lines.extend([f"## {ascii_text(current_group)}", ""])
        lines.append(
            f"- **{source['id']}** [{ascii_text(source['title'])}]({source['url']}) - {ascii_text(source['publisher'])}, {ascii_text(source['date'])}."
        )
    lines.append("")
    MARKDOWN_PATH.write_text("\n".join(lines), encoding="utf-8")


def build_pdf() -> None:
    register_fonts()
    styles = build_styles()
    assets = literal_assignment("ASSETS")
    events = load_events()
    sources = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    asset_map = {asset["id"]: asset for asset in assets}
    build_markdown(assets, events, sources)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = GuideDocTemplate(
        str(OUTPUT_PATH), pagesize=A4,
        title="Youth Financetopia Challenge - Facilitator News and Sources Guide",
        author="HKUST Youth Financetopia Challenge",
        subject="Facilitator-only scenario notes, news cards, debrief prompts and sources",
        creator="Youth Financetopia documentation generator",
    )
    story = []

    story.extend([
        Spacer(1, 16 * mm),
        Table([[Paragraph("FACILITATOR ONLY / CONTAINS ASSET MAPPINGS", styles["cover_center"])]], colWidths=[93 * mm], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), INK),
            ("BOX", (0, 0), (-1, -1), 1, INK),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])),
        Spacer(1, 14 * mm),
        Paragraph("YOUTH FINANCETOPIA CHALLENGE", styles["eyebrow"]),
        Paragraph("Newsroom &<br/>facilitator guide", styles["title"]),
        Paragraph(
            "Quarter-by-quarter market cards, source anchors, teaching notes and classroom safeguards.",
            ParagraphStyle("CoverDeck", parent=styles["body"], fontSize=12, leading=17, textColor=INK_SOFT, spaceAfter=18),
        ),
        Table([[Paragraph("2018-2022", styles["cover_year"]), Paragraph("VERSION 2.1<br/>12 JULY 2026", styles["eyebrow"])]], colWidths=[118 * mm, 47 * mm], style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), LIME),
            ("BOX", (0, 0), (-1, -1), 1.2, INK),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ])),
        Spacer(1, 18 * mm),
        callout(
            "Classroom simulation - not investment advice",
            "Prices are simplified and rounded teaching traces. Headlines compress real themes into a fictional game timeline. Rumors are invented. Do not present the cards as dated historical reporting or as recommendations to buy or sell.",
            styles, background=CREAM, accent=CORAL,
        ),
        Spacer(1, 7 * mm),
        Paragraph("Students should receive fake names only. Keep this guide off the student-facing site until the debrief.", styles["body"]),
        PageBreak(),
    ])

    story.extend([
        Paragraph("HOW TO USE THIS GUIDE", styles["eyebrow"]),
        Paragraph("Keep the uncertainty. Teach the process.", styles["h1"]),
        Paragraph(
            "The challenge works when students must decide what matters without being handed the real ticker, the future path or a perfect answer. The website releases only the current quarter's forward-looking cards and historical chart points earned so far. Those cards are evidence for predicting the next revealed quarterly mark, not explanations of the mark already on screen.",
            styles["body"],
        ),
        Spacer(1, 4 * mm),
        callout("1 / Brief", "Ask teams to open confirmed briefs first. Let them paraphrase the fact before discussing direction.", styles, LIME, TEAL),
        Spacer(1, 3 * mm),
        callout("2 / Question", "Use the card's question to surface competing explanations. Reward a team that identifies what it still does not know.", styles, CREAM, BLUE),
        Spacer(1, 3 * mm),
        callout("3 / Rumor", "Reveal desk chatter only after the fact is understood. It may be useful, irrelevant or false; students must label it as unverified.", styles, colors.HexColor("#FFF0EB"), CORAL),
        Spacer(1, 3 * mm),
        callout("4 / Decide", "Teams pin evidence, choose a view and confidence, write one sentence, then review quantity and estimated cash before the captain confirms.", styles, YELLOW, INK),
        Spacer(1, 7 * mm),
        Paragraph("Facilitator guardrails", styles["h2"]),
        Paragraph("- Never reveal the real mapping during live play.\n- Do not tell teams which asset should rise or fall.\n- Treat a well-reasoned hold as a valid decision.\n- Separate outcome quality from decision quality in the debrief.\n- Explain that all company and market references are historical classroom context, not current financial or medical guidance.", styles["body"]),
        PageBreak(),
    ])

    story.extend([
        Paragraph("FACILITATOR KEY", styles["eyebrow"]),
        Paragraph("Fake asset map", styles["h1"]),
        Paragraph("This page contains the answer key. The student website and student handouts must use fake names only.", styles["body"]),
    ])
    mapping_rows = [[
        Paragraph("GAME NAME", styles["card_label"]),
        Paragraph("REAL-WORLD TRACE", styles["card_label"]),
        Paragraph("TEACHING ROLE", styles["card_label"]),
    ]]
    for asset in assets:
        real_name, role = REAL_MAPPING[asset["id"]]
        mapping_rows.append([
            Paragraph(safe(asset["fake_name"]), styles["h3"]),
            Paragraph(safe(real_name), styles["small"]),
            Paragraph(safe(role), styles["small"]),
        ])
    mapping_table = Table(mapping_rows, colWidths=[31 * mm, 50 * mm, 84 * mm], repeatRows=1)
    mapping_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), CREAM),
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, CREAM]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([
        Spacer(1, 3 * mm), mapping_table, Spacer(1, 8 * mm),
        Paragraph("Accuracy notes that matter", styles["h2"]),
        callout(
            "Fear Gauge G",
            "The VIX is based on S&P 500 index option prices and represents expected broad-market volatility. Meme-stock or single-stock call volume does not directly enter its calculation. A broad gauge can look calm while individual shares are chaotic. VIX products exist in real markets; the gauge is simply not tradable in this simulation.",
            styles, CREAM, RED,
        ),
        Spacer(1, 3 * mm),
        callout(
            "FX Pair F",
            "The proxy follows EUR/USD quote direction: a higher value means euro strength and dollar weakness; a lower value means dollar strength. Students need this convention before interpreting a move.",
            styles, CREAM, TEAL,
        ),
        Spacer(1, 3 * mm),
        callout(
            "Medical history",
            "The 2020 emergency-use card is a known-at-the-time historical scenario. FDA later revoked authorization for bamlanivimab when used alone. Do not treat the card as current medical guidance.",
            styles, colors.HexColor("#FFF0EB"), CORAL,
        ),
        PageBreak(),
    ])

    for year in range(2018, 2023):
        year_events = [event for event in events if event["period_id"].startswith(str(year))]
        story.extend([
            Paragraph(f"{year} NEWSROOM", styles["eyebrow"]),
            Paragraph(f"Quarter cards: {year}", styles["h1"]),
            Paragraph(
                "Release each card only when its game quarter is reached. Source IDs point to the appendix; the card wording is a fictionalized synthesis rather than a quotation.",
                styles["body"],
            ),
            Spacer(1, 2 * mm),
        ])
        for index, event in enumerate(year_events):
            if len(year_events) == 5 and index == 3:
                story.extend([
                    PageBreak(),
                    Paragraph(f"{year} NEWSROOM / CONTINUED", styles["eyebrow"]),
                    Paragraph(f"Quarter cards: {year}", styles["h1"]),
                    Paragraph("Continue the same release rule: no card appears before its game quarter.", styles["body"]),
                    Spacer(1, 2 * mm),
                ])
            story.append(event_card(event, asset_map, styles))
        if year != 2022:
            story.append(PageBreak())

    story.extend([
        PageBreak(),
        Paragraph("DEBRIEF TOOLKIT", styles["eyebrow"]),
        Paragraph("Make the reasoning visible", styles["h1"]),
        Paragraph("Use these prompts after results are marked. Ask for evidence before showing the real mapping.", styles["body"]),
        Spacer(1, 3 * mm),
    ])
    prompts = [
        ("Fact, rumor or inference?", "Choose one statement your team used. Was it confirmed information, unverified chatter or your own conclusion?"),
        ("What changed your mind?", "Name the single clue or price move that caused the largest update to your view."),
        ("Was confidence calibrated?", "Compare your stated confidence with the strength and independence of your evidence."),
        ("Outcome versus process", "Would you make the same decision again with the same information, even if the result was poor?"),
        ("What stayed hidden?", "List information a real analyst would still want before making a larger decision."),
    ]
    for title, body in prompts:
        story.extend([callout(title, body, styles, WHITE, YELLOW), Spacer(1, 2.5 * mm)])
    story.extend([
        Spacer(1, 5 * mm),
        Paragraph("Plain-language glossary", styles["h2"]),
    ])
    glossary = [
        ("Catalyst", "An event that could change expectations or price."),
        ("Hedge", "A position intended to reduce another risk."),
        ("Leverage", "Debt or borrowing that can magnify gains and losses."),
        ("Liquidity", "How easily an asset can be traded without a large price change."),
        ("Rate differential", "The gap between interest rates in two economies."),
        ("Real yield", "An interest rate after accounting for expected inflation."),
        ("Short covering", "Buying that closes an earlier bet on a falling price."),
        ("Volatility", "How widely and quickly prices move."),
    ]
    glossary_rows = []
    for i in range(0, len(glossary), 2):
        row = []
        for term, meaning in glossary[i:i + 2]:
            row.append(Paragraph(f"<b>{safe(term)}</b><br/>{safe(meaning)}", styles["small"]))
        glossary_rows.append(row)
    glossary_table = Table(glossary_rows, colWidths=[82.5 * mm, 82.5 * mm])
    glossary_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("BACKGROUND", (0, 0), (-1, -1), CREAM),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([glossary_table, PageBreak()])

    story.extend([
        Paragraph("SOURCE APPENDIX", styles["eyebrow"]),
        Paragraph("Authoritative anchors", styles["h1"]),
        Paragraph(
            "These sources calibrate historical themes and the simplified proxy traces. They do not turn a fictional card into a dated transcript. Access checks were completed on 10 July 2026.",
            styles["body"],
        ),
        Spacer(1, 3 * mm),
    ])
    current_group = None
    for source in sources:
        if source["group"] != current_group:
            if current_group is not None:
                story.append(Spacer(1, 3 * mm))
            current_group = source["group"]
            story.append(Paragraph(safe(current_group), styles["h2"]))
        url = safe(source["url"])
        item = Table([
            [Paragraph(safe(source["id"]), styles["card_label"]), Paragraph(
                f"{safe(source['title'])}<br/><font name='YFSans' color='#64716C'>{safe(source['publisher'])} / {safe(source['date'])}</font>",
                styles["source_title"],
            )],
            [Paragraph("", styles["tiny"]), Paragraph(f"<link href='{url}' color='#255FDD'>{url}</link>", styles["source_url"])],
        ], colWidths=[14 * mm, 151 * mm])
        item.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LINEBELOW", (0, -1), (-1, -1), 0.35, LINE),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(KeepTogether([item, Spacer(1, 1.2 * mm)]))

    doc.build(story)
    DOCS_COPY_PATH.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(OUTPUT_PATH, DOCS_COPY_PATH)
    print(f"Wrote {OUTPUT_PATH}")
    print(f"Updated {DOCS_COPY_PATH}")
    print(f"Updated {MARKDOWN_PATH}")


if __name__ == "__main__":
    build_pdf()
