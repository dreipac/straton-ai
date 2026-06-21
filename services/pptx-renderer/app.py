"""
PowerPoint-Renderer — interner Microservice, der das von Straton produzierte Slide-HTML
(`<div data-theme="…"><section class="slide" data-layout="…">…</section>…</div>`, siehe
`src/features/chat/constants/pptxExportPrompt.ts`) in eine echte `.pptx`-Datei umwandelt.

Wird ausschliesslich von der Edge Function `generate-pptx-from-outline` aufgerufen (Shared-Secret
im Header `X-Internal-Token`) — kein öffentlich erreichbarer Endpoint.
"""

import os
from io import BytesIO

from bs4 import BeautifulSoup
from fastapi import FastAPI, Header, HTTPException, Response
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Inches, Pt
from pydantic import BaseModel

INTERNAL_TOKEN = os.environ.get("PPTX_RENDER_SERVICE_TOKEN", "")

ALLOWED_LAYOUTS = {"title", "section", "content", "table", "stats", "twocol", "agenda", "boxes"}
MAX_SLIDES = 60

# Pendant zu `PPTX_ICON_WHITELIST` in `pptxExportPrompt.ts` — gleiche Zeichen, gleiche Reihenfolge.
ICON_WHITELIST = {
    "🎯", "💡", "📈", "📊", "🔒", "🌍", "🚀", "⚡",
    "🤝", "💰", "✅", "⭐", "🛡", "🧩", "🔄", "📌",
    "⏱", "🧠", "🌱", "🏆", "🔧", "📍", "🔥", "🎓",
}


def validate_icon(text: str) -> str:
    """Nur whitelisted Icons rendern — alles andere wird stillschweigend zu leerem String (kein Crash)."""
    cleaned = text.strip()
    return cleaned if cleaned in ICON_WHITELIST else ""

# 96px = 1in in der Vorschau-CSS (`PPTX_SLIDE_NATIVE_WIDTH/HEIGHT`) — exakt 96 DPI, daher
# rechnen alle Mass-/Schriftangaben hier 1:1 aus den px-Werten in pptxOutline.ts um.
SLIDE_WIDTH_IN = 1280 / 96
SLIDE_HEIGHT_IN = 720 / 96
MARGIN_X_IN = 96 / 96
MARGIN_Y_IN = 72 / 96
CONTENT_WIDTH_IN = SLIDE_WIDTH_IN - 2 * MARGIN_X_IN
CONTENT_HEIGHT_IN = SLIDE_HEIGHT_IN - 2 * MARGIN_Y_IN

COLOR_TEXT_DARK = RGBColor(0x0F, 0x17, 0x2A)
COLOR_TEXT_LIGHT = RGBColor(0xF8, 0xFA, 0xFC)
COLOR_SUBTITLE_LIGHT = RGBColor(0xE2, 0xE8, 0xF0)
COLOR_BG_WHITE = RGBColor(0xFF, 0xFF, 0xFF)
COLOR_STAT_LABEL = RGBColor(0x47, 0x55, 0x69)

FONT_FAMILY = "Calibri"

# px → pt: 96px = 1in = 72pt, also px * 0.75.
PT_H1 = Pt(56 * 0.75)
PT_H2 = Pt(36 * 0.75)
PT_SUBTITLE = Pt(24 * 0.75)
PT_BODY = Pt(26 * 0.75)
PT_TABLE = Pt(22 * 0.75)
PT_COL_H2 = Pt(27)
PT_STAT_VALUE = Pt(40)
PT_STAT_LABEL = Pt(15)
PT_BOX_ICON = Pt(32)
PT_BOX_TITLE = Pt(18)
PT_BOX_TEXT = Pt(14)

DEFAULT_THEME = "blue"

# 5 kuratierte Paletten — Pendant zu `PPTX_THEME_PALETTES` in `pptxOutline.ts` (gleiche Hex-Werte).
THEME_PALETTES = {
    "blue": {
        "accent": RGBColor(0x1D, 0x4E, 0xD8),
        "accent_on_dark": RGBColor(0xBF, 0xDB, 0xFE),
        "bg_dark_from": RGBColor(0x0F, 0x17, 0x2A),
        "bg_dark_to": RGBColor(0x1E, 0x3A, 0x8A),
        "box_colors": (RGBColor(0x1D, 0x4E, 0xD8), RGBColor(0x0E, 0xA5, 0xE9), RGBColor(0x4F, 0x46, 0xE5)),
    },
    "green": {
        "accent": RGBColor(0x15, 0x80, 0x3D),
        "accent_on_dark": RGBColor(0xBB, 0xF7, 0xD0),
        "bg_dark_from": RGBColor(0x05, 0x2E, 0x1F),
        "bg_dark_to": RGBColor(0x15, 0x80, 0x3D),
        "box_colors": (RGBColor(0x15, 0x80, 0x3D), RGBColor(0x0D, 0x94, 0x88), RGBColor(0x65, 0xA3, 0x0D)),
    },
    "violet": {
        "accent": RGBColor(0x7C, 0x3A, 0xED),
        "accent_on_dark": RGBColor(0xDD, 0xD6, 0xFE),
        "bg_dark_from": RGBColor(0x2E, 0x10, 0x65),
        "bg_dark_to": RGBColor(0x6D, 0x28, 0xD9),
        "box_colors": (RGBColor(0x7C, 0x3A, 0xED), RGBColor(0xC0, 0x26, 0xD3), RGBColor(0x43, 0x38, 0xCA)),
    },
    "orange": {
        "accent": RGBColor(0xC2, 0x41, 0x0C),
        "accent_on_dark": RGBColor(0xFE, 0xD7, 0xAA),
        "bg_dark_from": RGBColor(0x43, 0x14, 0x07),
        "bg_dark_to": RGBColor(0xC2, 0x41, 0x0C),
        "box_colors": (RGBColor(0xC2, 0x41, 0x0C), RGBColor(0xD9, 0x77, 0x06), RGBColor(0xBE, 0x12, 0x3C)),
    },
    "slate": {
        "accent": RGBColor(0x33, 0x41, 0x55),
        "accent_on_dark": RGBColor(0xCB, 0xD5, 0xE1),
        "bg_dark_from": RGBColor(0x0F, 0x17, 0x2A),
        "bg_dark_to": RGBColor(0x33, 0x41, 0x55),
        "box_colors": (RGBColor(0x33, 0x41, 0x55), RGBColor(0x0F, 0x76, 0x6E), RGBColor(0xB4, 0x53, 0x09)),
    },
}


def blend_colors(rgb_a: RGBColor, rgb_b: RGBColor, fraction: float) -> RGBColor:
    """`fraction=1` → `rgb_a`, `fraction=0` → `rgb_b` — linearer Misch-Helfer für beide Richtungen."""
    r = round(rgb_a[0] * fraction + rgb_b[0] * (1 - fraction))
    g = round(rgb_a[1] * fraction + rgb_b[1] * (1 - fraction))
    b = round(rgb_a[2] * fraction + rgb_b[2] * (1 - fraction))
    return RGBColor(r, g, b)


def mix_with_white(rgb: RGBColor, accent_fraction: float) -> RGBColor:
    """Entspricht CSS `color-mix(in srgb, accent X%, white)` — X% Akzent, Rest weiss aufgehellt."""
    return blend_colors(rgb, COLOR_BG_WHITE, accent_fraction)


def parse_content_items(container) -> list[dict]:
    """`h1`/`h2`/`subtitle`/`p`/`ul`/`ol`/`table`/`callout` direkt unter `container` → typisierte Item-Liste."""
    items: list[dict] = []
    for child in container.find_all(
        ["h1", "h2", "subtitle", "p", "ul", "ol", "table", "callout"], recursive=False
    ):
        tag = child.name
        if tag == "callout":
            icon_el = child.find("icon", recursive=False)
            icon = validate_icon(icon_el.get_text(strip=True)) if icon_el else ""
            if icon_el:
                icon_el.extract()
            items.append({"type": tag, "text": child.get_text(strip=True), "icon": icon})
        elif tag in ("h1", "h2", "subtitle", "p"):
            items.append({"type": tag, "text": child.get_text(strip=True)})
        elif tag in ("ul", "ol"):
            ordered = tag == "ol"
            for i, li in enumerate(child.find_all("li", recursive=False), start=1):
                items.append(
                    {
                        "type": "li",
                        "text": li.get_text(strip=True),
                        "ordered": ordered,
                        "index": i,
                    }
                )
        elif tag == "table":
            header_row = [th.get_text(strip=True) for th in child.select("thead th")]
            body_rows = [
                [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
                for tr in child.select("tbody tr")
            ]
            items.append({"type": "table", "header": header_row, "rows": body_rows})
    return items


def parse_stats(section) -> list[dict]:
    stats_el = section.find("stats", recursive=False)
    if not stats_el:
        return []
    result = []
    for stat_el in stats_el.find_all("stat", recursive=False)[:3]:
        value_el = stat_el.find("statvalue", recursive=False)
        label_el = stat_el.find("statlabel", recursive=False)
        icon_el = stat_el.find("icon", recursive=False)
        value = value_el.get_text(strip=True) if value_el else ""
        label = label_el.get_text(strip=True) if label_el else ""
        icon = validate_icon(icon_el.get_text(strip=True)) if icon_el else ""
        if value or label:
            result.append({"value": value, "label": label, "icon": icon})
    return result


def parse_boxes(section) -> list[dict]:
    boxes_el = section.find("boxes", recursive=False)
    if not boxes_el:
        return []
    result = []
    for box_el in boxes_el.find_all("box", recursive=False)[:4]:
        icon_el = box_el.find("icon", recursive=False)
        title_el = box_el.find("boxtitle", recursive=False)
        text_el = box_el.find("boxtext", recursive=False)
        icon = validate_icon(icon_el.get_text(strip=True)) if icon_el else ""
        title = title_el.get_text(strip=True) if title_el else ""
        text = text_el.get_text(strip=True) if text_el else ""
        if title:
            result.append({"icon": icon, "title": title, "text": text})
    return result


def parse_columns(section) -> list[list[dict]]:
    columns_el = section.find("columns", recursive=False)
    if not columns_el:
        return []
    return [parse_content_items(col) for col in columns_el.find_all("column", recursive=False)[:2]]


def parse_agenda(section) -> list[dict]:
    agenda_el = section.find("agenda", recursive=False)
    if not agenda_el:
        return []
    result = []
    for item_el in agenda_el.find_all("agendaitem", recursive=False)[:6]:
        num_el = item_el.find("agendanum", recursive=False)
        title_el = item_el.find("agendatitle", recursive=False)
        num = num_el.get_text(strip=True) if num_el else ""
        title = title_el.get_text(strip=True) if title_el else ""
        if title:
            result.append({"num": num, "title": title})
    return result


def parse_theme(soup) -> str:
    theme_el = soup.find(attrs={"data-theme": True})
    theme = (theme_el.get("data-theme") or "").strip().lower() if theme_el else ""
    return theme if theme in THEME_PALETTES else DEFAULT_THEME


def parse_slides(html: str) -> list[dict]:
    """`<div data-theme="…"><section class="slide" data-layout="…">…</section>…</div>` → Folien-Liste."""
    soup = BeautifulSoup(f"<div>{html}</div>", "html.parser")
    theme = parse_theme(soup)
    slides = []
    for section in soup.select("section"):
        layout = (section.get("data-layout") or "").strip().lower()
        if layout not in ALLOWED_LAYOUTS:
            layout = "content"

        items = parse_content_items(section)
        slide = {"layout": layout, "theme": theme, "items": items}

        if layout == "stats":
            stats = parse_stats(section)
            if not stats:
                slide["layout"] = "content"
            else:
                slide["stats"] = stats
        elif layout == "twocol":
            columns = parse_columns(section)
            if len(columns) < 2:
                slide["layout"] = "content"
            else:
                slide["columns"] = columns
        elif layout == "agenda":
            agenda_items = parse_agenda(section)
            if not agenda_items:
                slide["layout"] = "content"
            else:
                slide["agenda"] = agenda_items
        elif layout == "boxes":
            boxes = parse_boxes(section)
            if len(boxes) < 2:
                slide["layout"] = "content"
            else:
                slide["boxes"] = boxes

        if slide["items"] or slide.get("stats") or slide.get("columns") or slide.get("agenda") or slide.get("boxes"):
            slides.append(slide)
    return slides


def add_background(slide, prs, dark: bool, palette: dict) -> None:
    if not dark:
        slide.background.fill.solid()
        slide.background.fill.fore_color.rgb = COLOR_BG_WHITE
        return
    rect = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    rect.line.fill.background()
    rect.shadow.inherit = False
    rect.fill.gradient()
    stops = rect.fill.gradient_stops
    stops[0].color.rgb = palette["bg_dark_from"]
    stops[0].position = 0.0
    stops[1].color.rgb = palette["bg_dark_to"]
    stops[1].position = 1.0
    rect.fill.gradient_angle = 135


def add_accent_spine(slide, prs, palette: dict) -> None:
    """Dünne farbige Kante am linken Folienrand — gibt hellen Layouts einen Marken-Akzent."""
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(0.14), prs.slide_height)
    bar.line.fill.background()
    bar.shadow.inherit = False
    bar.fill.solid()
    bar.fill.fore_color.rgb = palette["accent"]


def add_paragraph(text_frame, text: str, *, first: bool, size, bold: bool, color, alignment=None) -> None:
    paragraph = text_frame.paragraphs[0] if first else text_frame.add_paragraph()
    paragraph.space_after = Pt(10)
    if alignment is not None:
        paragraph.alignment = alignment
    run = paragraph.add_run()
    run.text = text
    run.font.size = size
    run.font.bold = bold
    run.font.name = FONT_FAMILY
    run.font.color.rgb = color


def add_bullet_paragraph(text_frame, text: str, *, first: bool, bullet: str, accent: RGBColor, text_color: RGBColor) -> None:
    """Bullet-Glyphe farbig (Akzent), Text in normaler Textfarbe — Pendant zu CSS `li::marker{color:accent}`."""
    paragraph = text_frame.paragraphs[0] if first else text_frame.add_paragraph()
    paragraph.space_after = Pt(10)
    bullet_run = paragraph.add_run()
    bullet_run.text = bullet
    bullet_run.font.size = PT_BODY
    bullet_run.font.bold = True
    bullet_run.font.name = FONT_FAMILY
    bullet_run.font.color.rgb = accent
    text_run = paragraph.add_run()
    text_run.text = text
    text_run.font.size = PT_BODY
    text_run.font.bold = False
    text_run.font.name = FONT_FAMILY
    text_run.font.color.rgb = text_color


def render_title_slide(slide, items: list[dict], palette: dict) -> None:
    """`title` — die einzige verbleibende Cover-Folie: Gradient + dezentes Deko-Rondell, Text
    linksbündig in einer schmaleren Box statt voller Breite (Editorial-/Poster-Look)."""
    decoration_color = blend_colors(palette["accent_on_dark"], palette["bg_dark_to"], 0.3)
    deco_size_in = 4.4
    decoration = slide.shapes.add_shape(
        MSO_SHAPE.OVAL,
        Inches(SLIDE_WIDTH_IN - 3.1),
        Inches(SLIDE_HEIGHT_IN - 3.1),
        Inches(deco_size_in),
        Inches(deco_size_in),
    )
    decoration.line.fill.background()
    decoration.shadow.inherit = False
    decoration.fill.solid()
    decoration.fill.fore_color.rgb = decoration_color

    box_width = CONTENT_WIDTH_IN * 0.62
    box = slide.shapes.add_textbox(
        Inches(MARGIN_X_IN), Inches(MARGIN_Y_IN), Inches(box_width), Inches(CONTENT_HEIGHT_IN)
    )
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE

    first = True
    for item in items:
        kind = item["type"]
        if not item.get("text"):
            continue
        if kind == "h1":
            add_paragraph(tf, item["text"], first=first, size=PT_H1, bold=False, color=COLOR_TEXT_LIGHT)
        elif kind == "h2":
            add_paragraph(tf, item["text"], first=first, size=PT_H2, bold=True, color=palette["accent_on_dark"])
        elif kind == "subtitle":
            add_paragraph(tf, item["text"], first=first, size=PT_SUBTITLE, bold=False, color=COLOR_SUBTITLE_LIGHT)
        elif kind == "p":
            add_paragraph(tf, item["text"], first=first, size=PT_BODY, bold=False, color=COLOR_TEXT_LIGHT)
        elif kind == "li":
            bullet = f"{item['index']}. " if item.get("ordered") else "•  "
            add_bullet_paragraph(
                tf, item["text"], first=first, bullet=bullet, accent=palette["accent_on_dark"], text_color=COLOR_TEXT_LIGHT
            )
        else:
            continue
        first = False


def render_section_slide(slide, items: list[dict], palette: dict) -> None:
    """`section` — heller Hintergrund wie alle Nicht-Cover-Layouts, Titel als zentrierte flache Akzent-Box (kein Gradient mehr)."""
    heading = next((i for i in items if i["type"] == "h1" and i.get("text")), None)
    if not heading:
        return
    box_width = CONTENT_WIDTH_IN * 0.7
    box_height = 2.2
    box = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        Inches((SLIDE_WIDTH_IN - box_width) / 2),
        Inches((SLIDE_HEIGHT_IN - box_height) / 2),
        Inches(box_width),
        Inches(box_height),
    )
    box.line.fill.background()
    box.shadow.inherit = False
    box.fill.solid()
    box.fill.fore_color.rgb = palette["accent"]
    box.adjustments[0] = 0.12
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = Inches(0.4)
    tf.margin_right = Inches(0.4)
    add_paragraph(tf, heading["text"], first=True, size=PT_H1, bold=True, color=COLOR_TEXT_LIGHT, alignment=PP_ALIGN.CENTER)


def render_content_slide(slide, items: list[dict], palette: dict) -> None:
    """`content` — Titel oben/fix, Inhalt darunter oben ausgerichtet (nicht vertikal zentriert)."""
    heading = next((i for i in items if i["type"] in ("h1", "h2")), None)
    callout = next((i for i in items if i["type"] == "callout" and i.get("text")), None)
    body_items = [i for i in items if i["type"] not in ("h1", "h2", "callout")]

    top = MARGIN_Y_IN
    if heading:
        heading_box = slide.shapes.add_textbox(
            Inches(MARGIN_X_IN), Inches(top), Inches(CONTENT_WIDTH_IN), Inches(0.9)
        )
        tf = heading_box.text_frame
        tf.word_wrap = True
        size = PT_H1 if heading["type"] == "h1" else PT_H2
        add_paragraph(tf, heading["text"], first=True, size=size, bold=True, color=palette["accent"])
        top += 1.1

    callout_height = 1.3 if callout else 0.0
    body_bottom_gap = (callout_height + 0.3) if callout else 0.0
    body_height = max(SLIDE_HEIGHT_IN - MARGIN_Y_IN - top - body_bottom_gap, 0.8)

    if body_items:
        box = slide.shapes.add_textbox(Inches(MARGIN_X_IN), Inches(top), Inches(CONTENT_WIDTH_IN), Inches(body_height))
        tf = box.text_frame
        tf.word_wrap = True
        tf.vertical_anchor = MSO_ANCHOR.TOP
        first = True
        for item in body_items:
            kind = item["type"]
            if not item.get("text"):
                continue
            if kind == "subtitle":
                add_paragraph(tf, item["text"], first=first, size=PT_SUBTITLE, bold=False, color=COLOR_TEXT_DARK)
            elif kind == "p":
                add_paragraph(tf, item["text"], first=first, size=PT_BODY, bold=False, color=COLOR_TEXT_DARK)
            elif kind == "li":
                bullet = f"{item['index']}. " if item.get("ordered") else "•  "
                add_bullet_paragraph(
                    tf, item["text"], first=first, bullet=bullet, accent=palette["accent"], text_color=COLOR_TEXT_DARK
                )
            else:
                continue
            first = False

    if callout:
        callout_top = SLIDE_HEIGHT_IN - MARGIN_Y_IN - callout_height
        box = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE, Inches(MARGIN_X_IN), Inches(callout_top), Inches(CONTENT_WIDTH_IN), Inches(callout_height)
        )
        box.shadow.inherit = False
        box.line.fill.background()
        box.fill.solid()
        box.fill.fore_color.rgb = palette["accent"]
        box.adjustments[0] = 0.08
        tf = box.text_frame
        tf.word_wrap = True
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf.margin_left = Inches(0.3)
        tf.margin_right = Inches(0.3)
        callout_text = f"{callout['icon']}  {callout['text']}" if callout.get("icon") else callout["text"]
        add_paragraph(tf, callout_text, first=True, size=PT_BODY, bold=True, color=COLOR_TEXT_LIGHT)


def render_agenda_slide(slide, items: list[dict], agenda_items: list[dict], palette: dict) -> None:
    heading = next((i for i in items if i["type"] == "h2"), None)
    top = MARGIN_Y_IN
    if heading:
        heading_box = slide.shapes.add_textbox(
            Inches(MARGIN_X_IN), Inches(top), Inches(CONTENT_WIDTH_IN), Inches(0.9)
        )
        tf = heading_box.text_frame
        tf.word_wrap = True
        add_paragraph(tf, heading["text"], first=True, size=PT_H2, bold=True, color=palette["accent"])
        top += 1.1

    badge_size = 0.7
    pad = 0.18
    gap = 0.2
    row_height = badge_size + 2 * pad
    available_height = max(SLIDE_HEIGHT_IN - MARGIN_Y_IN - top, row_height)
    max_rows = max(int((available_height + gap) // (row_height + gap)), 1)

    for i, entry in enumerate(agenda_items[:max_rows]):
        row_top = top + i * (row_height + gap)
        badge_top = row_top + pad
        badge_left = MARGIN_X_IN + pad

        panel = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE, Inches(MARGIN_X_IN), Inches(row_top), Inches(CONTENT_WIDTH_IN), Inches(row_height)
        )
        panel.line.fill.background()
        panel.shadow.inherit = False
        panel.fill.solid()
        panel.fill.fore_color.rgb = mix_with_white(palette["accent"], 0.05)
        panel.adjustments[0] = 0.12

        badge = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE, Inches(badge_left), Inches(badge_top), Inches(badge_size), Inches(badge_size)
        )
        badge.line.fill.background()
        badge.shadow.inherit = False
        badge.fill.solid()
        badge.fill.fore_color.rgb = palette["accent"]
        badge.adjustments[0] = 0.2
        tf = badge.text_frame
        tf.word_wrap = False
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        add_paragraph(tf, entry["num"], first=True, size=Pt(20), bold=True, color=COLOR_TEXT_LIGHT, alignment=PP_ALIGN.CENTER)

        title_left = badge_left + badge_size + 0.3
        title_box = slide.shapes.add_textbox(
            Inches(title_left), Inches(badge_top), Inches(MARGIN_X_IN + CONTENT_WIDTH_IN - pad - title_left), Inches(badge_size)
        )
        tf2 = title_box.text_frame
        tf2.word_wrap = True
        tf2.vertical_anchor = MSO_ANCHOR.MIDDLE
        add_paragraph(tf2, entry["title"], first=True, size=Pt(20), bold=False, color=COLOR_TEXT_DARK)


def render_table_slide(slide, items: list[dict], palette: dict) -> None:
    heading = next((i for i in items if i["type"] == "h2"), None)
    table_item = next((i for i in items if i["type"] == "table"), None)

    heading_box = slide.shapes.add_textbox(
        Inches(MARGIN_X_IN), Inches(MARGIN_Y_IN), Inches(CONTENT_WIDTH_IN), Inches(0.8)
    )
    tf = heading_box.text_frame
    tf.word_wrap = True
    if heading:
        add_paragraph(tf, heading["text"], first=True, size=PT_H2, bold=True, color=palette["accent"])

    if not table_item:
        return
    header = table_item.get("header") or []
    rows = table_item.get("rows") or []
    col_count = max([len(header)] + [len(r) for r in rows], default=1) or 1
    row_count = len(rows) + (1 if header else 0)
    if row_count == 0:
        return

    table_top = MARGIN_Y_IN + 1.0
    table_height = max(SLIDE_HEIGHT_IN - MARGIN_Y_IN - table_top, 0.5)
    graphic_frame = slide.shapes.add_table(
        row_count, col_count, Inches(MARGIN_X_IN), Inches(table_top), Inches(CONTENT_WIDTH_IN), Inches(table_height)
    )
    table = graphic_frame.table
    header_tint = mix_with_white(palette["accent"], 0.16)
    band_tint = mix_with_white(palette["accent"], 0.06)

    def style_cell(cell, text: str, *, header_row: bool, banded: bool) -> None:
        cell.text = text
        cell.fill.solid()
        cell.fill.fore_color.rgb = header_tint if header_row else (band_tint if banded else COLOR_BG_WHITE)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        for paragraph in cell.text_frame.paragraphs:
            for run in paragraph.runs:
                run.font.size = PT_TABLE
                run.font.bold = header_row
                run.font.name = FONT_FAMILY
                run.font.color.rgb = COLOR_TEXT_DARK

    row_offset = 0
    if header:
        for col, text in enumerate(header):
            if col < col_count:
                style_cell(table.cell(0, col), text, header_row=True, banded=False)
        row_offset = 1
    for r, row in enumerate(rows):
        for col, text in enumerate(row):
            if col < col_count:
                style_cell(table.cell(r + row_offset, col), text, header_row=False, banded=r % 2 == 1)


def render_stats_slide(slide, items: list[dict], stats: list[dict], palette: dict) -> None:
    heading = next((i for i in items if i["type"] == "h2"), None)
    top = MARGIN_Y_IN
    if heading:
        heading_box = slide.shapes.add_textbox(
            Inches(MARGIN_X_IN), Inches(top), Inches(CONTENT_WIDTH_IN), Inches(0.9)
        )
        tf = heading_box.text_frame
        tf.word_wrap = True
        add_paragraph(tf, heading["text"], first=True, size=PT_H2, bold=True, color=palette["accent"])
        top += 1.1

    count = max(len(stats), 1)
    gap = 0.4
    box_width = (CONTENT_WIDTH_IN - gap * (count - 1)) / count
    available_height = max(SLIDE_HEIGHT_IN - MARGIN_Y_IN - top, 1.0)
    box_height = min(available_height, 3.2)
    box_top = top + max((available_height - box_height) / 2, 0)

    for i, stat in enumerate(stats):
        left = MARGIN_X_IN + i * (box_width + gap)
        box = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(box_top), Inches(box_width), Inches(box_height)
        )
        box.line.fill.background()
        box.shadow.inherit = False
        box.fill.solid()
        box.fill.fore_color.rgb = mix_with_white(palette["accent"], 0.12)
        box.adjustments[0] = 0.08

        tf = box.text_frame
        tf.word_wrap = True
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf.margin_left = Inches(0.15)
        tf.margin_right = Inches(0.15)
        first = True
        if stat.get("icon"):
            add_paragraph(tf, stat["icon"], first=first, size=Pt(32), bold=False, color=palette["accent"], alignment=PP_ALIGN.CENTER)
            first = False
        add_paragraph(
            tf, stat["value"], first=first, size=PT_STAT_VALUE, bold=True, color=palette["accent"], alignment=PP_ALIGN.CENTER
        )
        add_paragraph(
            tf, stat["label"], first=False, size=PT_STAT_LABEL, bold=False, color=COLOR_STAT_LABEL, alignment=PP_ALIGN.CENTER
        )


def render_twocol_slide(slide, items: list[dict], columns: list[list[dict]], palette: dict) -> None:
    heading = next((i for i in items if i["type"] == "h2"), None)
    top = MARGIN_Y_IN
    if heading:
        heading_box = slide.shapes.add_textbox(
            Inches(MARGIN_X_IN), Inches(top), Inches(CONTENT_WIDTH_IN), Inches(0.9)
        )
        tf = heading_box.text_frame
        tf.word_wrap = True
        add_paragraph(tf, heading["text"], first=True, size=PT_H2, bold=True, color=palette["accent"])
        top += 1.1

    gap = 0.6
    col_width = (CONTENT_WIDTH_IN - gap) / 2
    col_height = max(SLIDE_HEIGHT_IN - MARGIN_Y_IN - top, 1.0)

    for i, col_items in enumerate(columns[:2]):
        left = MARGIN_X_IN + i * (col_width + gap)

        panel = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(col_width), Inches(col_height))
        panel.line.fill.background()
        panel.shadow.inherit = False
        panel.fill.solid()
        panel.fill.fore_color.rgb = mix_with_white(palette["accent"], 0.06)
        panel.adjustments[0] = 0.06

        pad = 0.35
        box = slide.shapes.add_textbox(
            Inches(left + pad), Inches(top + pad), Inches(col_width - 2 * pad), Inches(col_height - 2 * pad)
        )
        tf = box.text_frame
        tf.word_wrap = True
        first = True
        for item in col_items:
            kind = item["type"]
            if not item.get("text"):
                continue
            if kind == "h2":
                add_paragraph(tf, item["text"], first=first, size=PT_COL_H2, bold=True, color=palette["accent"])
            elif kind == "p":
                add_paragraph(tf, item["text"], first=first, size=PT_BODY, bold=False, color=COLOR_TEXT_DARK)
            elif kind == "li":
                bullet = f"{item['index']}. " if item.get("ordered") else "•  "
                add_bullet_paragraph(
                    tf, item["text"], first=first, bullet=bullet, accent=palette["accent"], text_color=COLOR_TEXT_DARK
                )
            else:
                continue
            first = False


def render_boxes_slide(slide, items: list[dict], boxes: list[dict], palette: dict) -> None:
    """`boxes` — Vorteile/Schritte/Features als flache, randlose Karten mit zyklisch wechselnden Farben."""
    heading = next((i for i in items if i["type"] == "h2"), None)
    top = MARGIN_Y_IN
    if heading:
        heading_box = slide.shapes.add_textbox(
            Inches(MARGIN_X_IN), Inches(top), Inches(CONTENT_WIDTH_IN), Inches(0.9)
        )
        tf = heading_box.text_frame
        tf.word_wrap = True
        add_paragraph(tf, heading["text"], first=True, size=PT_H2, bold=True, color=palette["accent"])
        top += 1.1

    count = max(len(boxes), 1)
    gap = 0.4
    box_width = (CONTENT_WIDTH_IN - gap * (count - 1)) / count
    box_height = max(SLIDE_HEIGHT_IN - MARGIN_Y_IN - top, 1.0)
    box_colors = palette["box_colors"]

    for i, item in enumerate(boxes):
        left = MARGIN_X_IN + i * (box_width + gap)
        box = slide.shapes.add_shape(
            MSO_SHAPE.ROUNDED_RECTANGLE, Inches(left), Inches(top), Inches(box_width), Inches(box_height)
        )
        box.line.fill.background()
        box.shadow.inherit = False
        box.fill.solid()
        box.fill.fore_color.rgb = box_colors[i % len(box_colors)]
        box.adjustments[0] = 0.08

        tf = box.text_frame
        tf.word_wrap = True
        tf.vertical_anchor = MSO_ANCHOR.TOP
        tf.margin_left = Inches(0.25)
        tf.margin_right = Inches(0.25)
        tf.margin_top = Inches(0.3)
        first = True
        if item.get("icon"):
            add_paragraph(tf, item["icon"], first=first, size=PT_BOX_ICON, bold=False, color=COLOR_TEXT_LIGHT)
            first = False
        add_paragraph(tf, item["title"], first=first, size=PT_BOX_TITLE, bold=True, color=COLOR_TEXT_LIGHT)
        if item.get("text"):
            add_paragraph(tf, item["text"], first=False, size=PT_BOX_TEXT, bold=False, color=COLOR_TEXT_LIGHT)


def build_presentation(slides: list[dict]) -> bytes:
    prs = Presentation()
    prs.slide_width = Inches(SLIDE_WIDTH_IN)
    prs.slide_height = Inches(SLIDE_HEIGHT_IN)
    blank_layout = prs.slide_layouts[6]

    for slide_data in slides:
        slide = prs.slides.add_slide(blank_layout)
        layout = slide_data["layout"]
        palette = THEME_PALETTES.get(slide_data.get("theme", DEFAULT_THEME), THEME_PALETTES[DEFAULT_THEME])
        # Nur die Titelfolie behält den grossflächigen Gradient-Cover-Look — alle anderen Layouts
        # inkl. `section` sind hell und bekommen den linken Akzent-Rand.
        dark = layout == "title"
        add_background(slide, prs, dark, palette)
        if not dark:
            add_accent_spine(slide, prs, palette)

        if layout == "table":
            render_table_slide(slide, slide_data["items"], palette)
        elif layout == "stats":
            render_stats_slide(slide, slide_data["items"], slide_data.get("stats", []), palette)
        elif layout == "twocol":
            render_twocol_slide(slide, slide_data["items"], slide_data.get("columns", []), palette)
        elif layout == "agenda":
            render_agenda_slide(slide, slide_data["items"], slide_data.get("agenda", []), palette)
        elif layout == "boxes":
            render_boxes_slide(slide, slide_data["items"], slide_data.get("boxes", []), palette)
        elif layout == "content":
            render_content_slide(slide, slide_data["items"], palette)
        elif layout == "section":
            render_section_slide(slide, slide_data["items"], palette)
        else:
            render_title_slide(slide, slide_data["items"], palette)

    buffer = BytesIO()
    prs.save(buffer)
    return buffer.getvalue()


class RenderRequest(BaseModel):
    html: str


app = FastAPI(title="Straton PPTX Renderer")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/render")
def render(payload: RenderRequest, x_internal_token: str = Header(default="")) -> Response:
    if not INTERNAL_TOKEN or x_internal_token != INTERNAL_TOKEN:
        raise HTTPException(status_code=401, detail="Ungültiges Internal-Token.")

    slides = parse_slides(payload.html)
    if not slides:
        raise HTTPException(status_code=400, detail="Kein gültiges Folien-HTML gefunden.")
    if len(slides) > MAX_SLIDES:
        raise HTTPException(status_code=400, detail=f"Zu viele Folien (max. {MAX_SLIDES}).")

    pptx_bytes = build_presentation(slides)
    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )
