#!/usr/bin/env python3
"""Generate sample SRN (shipping release) PDFs for the BOM parser tests.

    python3 packages/shared/test-fixtures/make_fixtures.py
    for f in packages/shared/test-fixtures/*.pdf; do pdftotext -layout "$f" "${f%.pdf}.txt"; done

Three fixtures:
  srn_clean.pdf     one page, a tidy table with a header row
  srn_messy.pdf     one page, wrapped descriptions, blank lines, a TOTAL row, footer
  srn_twopage.pdf   two pages, header row repeated on each page, page numbers

The expected rows for each are in the *.expected.json files next to the PDFs
(written by this script too) so the tests and the generator can't drift.
"""
import json
import os

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))

CLEAN_ROWS = [
    # line, piece_mark, description, qty, uom
    (1, "B-101", "W12x26 BEAM, 24'-6\" LG, A992", 4, "EA"),
    (2, "B-102", "W12x26 BEAM, 18'-0\" LG, A992", 2, "EA"),
    (3, "C12", "HSS6x6x3/8 COLUMN 14'-2\"", 6, "EA"),
    (4, "SP-2201-A", "STAIR STRINGER C12x20.7 LEFT", 1, "EA"),
    (5, "SP-2201-B", "STAIR STRINGER C12x20.7 RIGHT", 1, "EA"),
    (6, "1B7", "L3x3x1/4 BRACE ANGLE", 12, "PCS"),
    (7, "PL-3", "PL 1/2\" x 12\" x 1'-0\" BASE PLATE", 8, "EA"),
    (8, "AB-1", "ANCHOR BOLT 3/4\" x 18\" GALV", 32, "EA"),
    (9, "GR-4", "GRATING 1\" x 3/16\" SERRATED", 45.5, "FT"),
    (10, "HR-2", "HANDRAIL 1-1/2\" SCH 40 PIPE", 120, "FT"),
]

MESSY_ROWS = [
    (1, "B-201", "W16x36 BEAM 28'-4\" LG A992 W/ SHEAR TABS BOTH ENDS, PRIMED GREY", 3, "EA"),
    (2, "B-202", "W10x19 BEAM 12'-6\" LG", 5, "EA"),
    (3, "C-7", "HSS8x8x1/2 COLUMN 22'-0\" W/ CAP PL 3/4\" x 12\" x 12\" AND BASE PL 1\" x 16\" x 16\"", 2, "EA"),
    (4, "1B12", "L4x4x3/8 BRACE 9'-3\" LG", 8, "PCS"),
    (5, "PL-9", "PL 3/8\" GUSSET, TYP.", 16, "EA"),
    (6, "MISC-1", "LOOSE BOLTS A325 3/4\" x 2-1/2\" W/ NUTS AND WASHERS", 240, "EA"),
    (7, "GR-11", "BAR GRATING 19-W-4 GALV", 62.25, "FT"),
    (8, "WELD-1", "WELD STUDS 3/4\" x 4\"", 18.5, "KG"),
]

TWOPAGE_ROWS = [
    (1, "B-301", "W14x30 BEAM 20'-0\" LG", 4, "EA"),
    (2, "B-302", "W14x30 BEAM 16'-8\" LG", 4, "EA"),
    (3, "B-303", "W8x18 BEAM 10'-0\" LG", 6, "EA"),
    (4, "C21", "HSS6x6x1/4 COLUMN 12'-0\"", 8, "EA"),
    (5, "C22", "HSS6x6x1/4 COLUMN 14'-0\"", 4, "EA"),
    (6, "SP-3101-A", "STAIR STRINGER MC12x31 LEFT", 2, "EA"),
    (7, "SP-3101-B", "STAIR STRINGER MC12x31 RIGHT", 2, "EA"),
    (8, "1B9", "L3x3x5/16 BRACE ANGLE", 20, "PCS"),
    (9, "PL-5", "PL 5/8\" x 14\" x 1'-2\" BASE PLATE", 12, "EA"),
    (10, "AB-2", "ANCHOR BOLT 1\" x 24\" GALV", 48, "EA"),
    (11, "GR-6", "GRATING 1-1/4\" x 3/16\" SERRATED", 88, "FT"),
    (12, "HR-3", "HANDRAIL 1-1/2\" SCH 40 PIPE GALV", 240.5, "FT"),
    (13, "KP-1", "KICK PLATE 4\" x 1/4\" FLAT BAR", 240, "FT"),
    (14, "LD-1", "SHIP LADDER W/ CAGE", 1, "EA"),
    (15, "MISC-2", "TOUCH-UP PAINT, GREY", 4, "L"),
]


def header(c, title, release, page, pages):
    c.setFont("Helvetica-Bold", 14)
    c.drawString(72, 740, "NORTHERN STEEL FABRICATORS LTD.")
    c.setFont("Helvetica", 10)
    c.drawString(72, 726, "1200 Industrial Way, Edmonton AB   Tel 780-555-0100")
    c.drawString(72, 706, f"SHIPPING RELEASE NOTICE   SRN No: {release}   Date: 2026-09-10")
    c.drawString(72, 692, "PO No: PO-44871   Project: Site A - Kleerform   Ship To: Gate 3, Site A")
    c.drawRightString(540, 692, f"Page {page} of {pages}")
    c.setFont("Helvetica", 9)


def table_header(c, y, cols):
    c.setFont("Helvetica-Bold", 9)
    for x, label, align in cols:
        if align == "r":
            c.drawRightString(x, y, label)
        else:
            c.drawString(x, y, label)
    c.line(72, y - 3, 540, y - 3)
    c.setFont("Helvetica", 9)
    return y - 16


def qty_str(q):
    return str(int(q)) if float(q).is_integer() else str(q)


def clean():
    path = os.path.join(HERE, "srn_clean.pdf")
    c = canvas.Canvas(path, pagesize=letter)
    header(c, "clean", "SRN-2026-0412", 1, 1)
    cols = [(72, "Line", "l"), (105, "Piece Mark", "l"), (185, "Description", "l"),
            (440, "Qty", "r"), (470, "UOM", "l"), (540, "Weight (kg)", "r")]
    y = table_header(c, 660, cols)
    for i, (ln, pm, desc, qty, uom) in enumerate(CLEAN_ROWS):
        c.drawString(72, y, str(ln))
        c.drawString(105, y, pm)
        c.drawString(185, y, desc)
        c.drawRightString(440, y, qty_str(qty))
        c.drawString(470, y, uom)
        c.drawRightString(540, y, f"{(i + 1) * 137.4:.1f}")
        y -= 14
    c.setFont("Helvetica", 8)
    c.drawString(72, 100, "Carrier: Haulit Transport   Trailer: FLATBED 53'   Driver to call ahead 30 min.")
    c.showPage()
    c.save()
    return [dict(line_no=ln, piece_mark=pm, qty=qty, uom=uom) for ln, pm, _, qty, uom in CLEAN_ROWS]


def wrap(text, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width and cur:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return lines


def messy():
    path = os.path.join(HERE, "srn_messy.pdf")
    c = canvas.Canvas(path, pagesize=letter)
    header(c, "messy", "SRN-2026-0419", 1, 1)
    # Different column order and labels than the clean one, no rule line, no header underline.
    cols = [(72, "ITEM", "l"), (105, "MARK", "l"), (175, "DESCRIPTION", "l"),
            (445, "QTY", "r"), (465, "UNIT", "l"), (540, "DWG", "r")]
    y = table_header(c, 660, cols)
    total_qty = 0
    for ln, pm, desc, qty, uom in MESSY_ROWS:
        lines = wrap(desc, 44)
        c.drawString(72, y, str(ln))
        c.drawString(105, y, pm)
        c.drawString(175, y, lines[0])
        c.drawRightString(445, y, qty_str(qty))
        c.drawString(465, y, uom)
        c.drawRightString(540, y, f"S-{100 + ln}")
        y -= 12
        for extra in lines[1:]:
            c.drawString(175, y, extra)
            y -= 12
        y -= 4  # ragged spacing
        total_qty += qty
    y -= 6
    c.line(72, y + 8, 540, y + 8)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(72, y, "TOTAL")
    c.drawRightString(445, y, qty_str(total_qty))
    c.drawString(465, y, "8 LINES")
    y -= 20
    c.setFont("Helvetica", 8)
    c.drawString(72, y, "Subtotal weight: 4,812 kg   Bundles: 3   Skids: 2")
    c.drawString(72, 120, "NOTES: All material primed unless noted. Grating shipped loose on skid 2.")
    c.drawString(72, 108, "Received by: ______________________   Date: ____________")
    c.drawString(72, 80, "Northern Steel Fabricators Ltd.  -  Form SRN-01 rev C")
    c.showPage()
    c.save()
    return [dict(line_no=ln, piece_mark=pm, qty=qty, uom=uom) for ln, pm, _, qty, uom in MESSY_ROWS]


def twopage():
    path = os.path.join(HERE, "srn_twopage.pdf")
    c = canvas.Canvas(path, pagesize=letter)
    cols = [(72, "Item", "l"), (105, "Tag", "l"), (185, "Description", "l"),
            (430, "Qty", "r"), (450, "UOM", "l"), (500, "PO Line", "r")]
    split = 8
    pages = [TWOPAGE_ROWS[:split], TWOPAGE_ROWS[split:]]
    for pno, rows in enumerate(pages, start=1):
        header(c, "twopage", "SRN-2026-0433", pno, len(pages))
        y = table_header(c, 660, cols)
        for ln, pm, desc, qty, uom in rows:
            c.drawString(72, y, str(ln))
            c.drawString(105, y, pm)
            c.drawString(185, y, desc)
            c.drawRightString(430, y, qty_str(qty))
            c.drawString(450, y, uom)
            c.drawRightString(500, y, str(ln))
            y -= 14
        if pno < len(pages):
            c.setFont("Helvetica-Oblique", 8)
            c.drawString(72, y - 10, "continued on next page...")
        else:
            c.setFont("Helvetica", 8)
            c.drawString(72, y - 10, "END OF RELEASE")
        c.drawString(72, 60, f"Page {pno} / {len(pages)}")
        c.showPage()
    c.save()
    return [dict(line_no=ln, piece_mark=pm, qty=qty, uom=uom) for ln, pm, _, qty, uom in TWOPAGE_ROWS]


if __name__ == "__main__":
    expected = {"srn_clean": clean(), "srn_messy": messy(), "srn_twopage": twopage()}
    for name, rows in expected.items():
        with open(os.path.join(HERE, f"{name}.expected.json"), "w") as fh:
            json.dump(rows, fh, indent=2)
    print("wrote", ", ".join(f"{n}.pdf" for n in expected))
