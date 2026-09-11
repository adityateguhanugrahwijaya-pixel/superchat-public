from openpyxl import Workbook
from openpyxl.styles import (
    Font, PatternFill, Alignment, Border, Side, numbers
)
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import FormulaRule, ColorScaleRule
from copy import copy

wb = Workbook()
ws = wb.active
ws.title = "Film Budget"

# ── Colour Palette ──────────────────────────────────────────────
DARK      = "1A1A2E"
MID       = "16213E"
ACCENT    = "0F3460"
HIGHLIGHT = "E94560"
GOLD      = "FFD700"
WHITE     = "FFFFFF"
LIGHT_BG  = "F0F4F8"
GREEN_OK  = "92D050"
RED_OVR   = "FF6B6B"
YELLOW    = "FFE66D"
GRAY_TEXT  = "555555"
BORDER_C   = "BFBFBF"

thin_side = Side(style="thin", color=BORDER_C)
thick_side = Side(style="medium", color=ACCENT)
THIN_BORDER = Border(
    left=thin_side, right=thin_side,
    top=thin_side, bottom=thin_side
)
MEDIUM_BORDER = Border(
    left=thin_side, right=thin_side,
    top=thick_side, bottom=thick_side
)

def hdr_fill(hex_color):
    return PatternFill(start_color=hex_color, end_color=hex_color, fill_type="solid")

CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT   = Alignment(horizontal="left",   vertical="center", wrap_text=True)
RIGHT  = Alignment(horizontal="right",  vertical="center")

# ── Column widths ───────────────────────────────────────────────
col_widths = {
    "A": 5,   "B": 22, "C": 38, "D": 16,
    "E": 16, "F": 16, "G": 16, "H": 16,
}
for col, w in col_widths.items():
    ws.column_dimensions[col].width = w

# ═══════════════════════════════════════════════════════════════
#  SECTION 1 — PROJECT INFO & TOTAL BUDGET
# ═══════════════════════════════════════════════════════════════
ws.merge_cells("A1:H1")
c = ws["A1"]
c.value = "🎬  FILM BUDGET TRACKER  &  CALCULATOR"
c.font = Font(name="Calibri", size=18, bold=True, color=WHITE)
c.fill = hdr_fill(DARK)
c.alignment = CENTER
ws.row_dimensions[1].height = 40

ws.merge_cells("A2:H2")
c = ws["A2"]
c.value = "Track every dollar — see at a glance whether you're over or under budget."
c.font = Font(name="Calibri", size=10, italic=True, color="AAAAAA")
c.fill = hdr_fill(MID)
c.alignment = LEFT
ws.row_dimensions[2].height = 22

# Row 4 — project meta
labels_meta = [
    ("A4", "Project Title:",   "C4"),
    ("E4", "Director:",        "G4"),
    ("A5", "Production Co.:",  "C5"),
    ("E5", "Producer:",        "G5"),
    ("A6", "Shoot Date:",      "C6"),
    ("E6", "Status:",          "G6"),
]
for left_col, label, right_col in labels_meta:
    ws[left_col] = label
    ws[left_col].font = Font(name="Calibri", size=10, bold=True, color=GRAY_TEXT)
    ws[left_col].alignment = RIGHT
    ws[right_col].border = Border(bottom=Side(style="thin", color=ACCENT))
ws["C4"].value = ""   # ← type your title here
ws["G4"].value = ""
ws["C5"].value = ""
ws["G5"].value = ""
ws["C6"].value = ""
ws["G6"].value = "Pre-Production"

# Row 8 — TOTAL BUDGET INPUT
ws.merge_cells("A8:B8")
c = ws["A8"]
c.value = "TOTAL BUDGET ($)"
c.font = Font(name="Calibri", size=12, bold=True, color=WHITE)
c.fill = hdr_fill(ACCENT)
c.alignment = CENTER

c = ws["C8"]
c.value = 0
c.number_format = '$#,##0.00'
c.font = Font(name="Calibri", size=16, bold=True, color=HIGHLIGHT)
c.fill = PatternFill(start_color="FFF8E1", end_color="FFF8E1", fill_type="solid")
c.alignment = CENTER
c.border = MEDIUM_BORDER
# Put a note that user should change this value
ws["D8"] = "← Change this number to your total budget"
ws["D8"].font = Font(name="Calibri", size=9, italic=True, color="AAAAAA")
ws.merge_cells("D8:H8")

# ═══════════════════════════════════════════════════════════════
#  SECTION 2 — EXPENSE CATEGORIES WITH SUBTOTALS
# ═══════════════════════════════════════════════════════════════
header_row = 10
cat_headers = ["#", "Category", "Description / Notes",
               "Qty", "Unit Cost ($)", "Line Total ($)",
               "Approved?", "Over / Under"]
for i, h in enumerate(cat_headers, 1):
    c = ws.cell(row=header_row, column=i, value=h)
    c.font = Font(name="Calibri", size=10, bold=True, color=WHITE)
    c.fill = hdr_fill(HIGHLIGHT)
    c.alignment = CENTER
    c.border = THIN_BORDER
ws.row_dimensions[header_row].height = 28

# ── Category definitions (rows 11-50) ──────────────────────────
categories = [
    # (category_name, approved_default)
    ("PRE-PRODUCTION",            True),
    ("Script & Development",      True),
    ("Casting",                   True),
    ("Location Scouting",         True),
    ("Storyboard & Pre-Vis",      False),
    ("PRODUCTION — CREW",         True),
    ("Director",                  True),
    ("Producer",                  True),
    (" Cinematographer / DP",     True),
    ("Grip & Electric Dept.",     True),
    ("Sound Department",          True),
    ("Production Office",         True),
    ("Production Assistants",     True),
    ("PRODUCTION — CAST",         True),
    ("Lead Actors",               True),
    ("Supporting Actors",         True),
    ("Extras / Background",      True),
    ("STUDIO / SET",              True),
    ("Set Construction",          True),
    ("Painting & Dressing",       True),
    ("Props & Wardrobe",          True),
    ("Makeup & Hair (MUA)",      True),
    ("PRODUCTION — VEHICLES",     True),
    ("Vehicle Rentals",           True),
    ("Transportation / Trailers", True),
    ("Permits & Insurance",       True),
    ("MEAL & CRAFT SERVICES",     True),
    ("Craft Services",            True),
    ("Catering / Meals",          True),
    ("POST-PRODUCTION",           True),
    ("Editing",                   True),
    ("Color Grading",             True),
    ("Sound Design / Mixing",     True),
    ("Visual Effects (VFX)",     True),
    ("Music & Score",             True),
    ("Titles & Credits",          False),
    ("MARKETING & DISTRIBUTION",  False),
    ("Poster & Key Art",          False),
    ("Trailer Production",        False),
    ("Social Media / Ads",        False),
    ("Festival Submissions",      False),
    ("PRINT & CONTINGENCY",       True),
    ("Film Stock / Digital Media",True),
    ("Hard Drive & Storage",      True),
    ("Contingency Fund (10%)",    True),
    ("Miscellaneous / OOH",       True),
]

START_ROW = 11
NUM_ROWS  = len(categories)

# Helper to apply per-row styles
def style_cell(cell, bg="FFFFFF", fg="1A1A2E", bold=False, size=10,
               align=CENTER, num_fmt=None, border=THIN_BORDER):
    cell.fill = PatternFill(start_color=bg, end_color=bg, fill_type="solid")
    cell.font = Font(name="Calibri", size=size, bold=bold, color=fg)
    cell.alignment = align
    cell.border = border
    if num_fmt:
        cell.number_format = num_fmt

# ── Row-by-row build ───────────────────────────────────────────
current_cat = None
row_offset = 0

for idx, (cat_name, approved_def) in enumerate(categories):
    r = START_ROW + idx

    # Detect category header (all-caps name)
    is_cat_header = cat_name == cat_name.upper() and "_" not in cat_name and len(cat_name) > 3

    if is_cat_header:
        # Blank line spacer before major category
        if row_offset > 0:
            spacer_r = START_ROW + (idx - 1)
            # we handle spacers below
        pass

    bg = LIGHT_BG if (idx % 2 == 0) else WHITE
    fg = DARK

    # ── Col A : # ──
    c = ws.cell(row=r, column=1, value=idx + 1)
    style_cell(c, bg=bg, fg="AAAAAA" if is_cat_header else GRAY_TEXT,
               bold=is_cat_header, size=9 if is_cat_header else 10)

    # ── Col B : Category ──
    c = ws.cell(row=r, column=2, value=cat_name)
    style_cell(c, bg=bg, fg=DARK if not is_cat_header else WHITE,
               bold=True, size=11 if is_cat_header else 10,
               align=LEFT)
    if is_cat_header:
        c.fill = hdr_fill(ACCENT)

    # ── Col C : Description (user fills) ──
    c = ws.cell(row=r, column=3, value="")
    style_cell(c, bg=bg, fg=GRAY_TEXT, size=10, align=LEFT)
    if is_cat_header:
        c.fill = hdr_fill(ACCENT)

    # ── Col D : Qty ──
    c = ws.cell(row=r, column=4, value="")
    style_cell(c, bg=bg, fg=GRAY_TEXT, size=10, align=CENTER)
    if is_cat_header:
        c.fill = hdr_fill(ACCENT)

    # ── Col E : Unit Cost ──
    c = ws.cell(row=r, column=5, value="")
    c.number_format = '$#,##0.00'
    style_cell(c, bg=bg, fg=GRAY_TEXT, size=10, align=RIGHT)
    if is_cat_header:
        c.fill = hdr_fill(ACCENT)

    # ── Col F : Line Total formula ──
    c = ws.cell(row=r, column=6)
    if is_cat_header:
        c.value = None
        c.fill = hdr_fill(ACCENT)
        style_cell(c, bg=hdr_fill(ACCENT), fg=WHITE, bold=True, size=10, align=CENTER)
    else:
        c.value = f'=IF(AND(D{r}<>"",E{r}<>""),D{r}*E{r},"")'
        c.number_format = '$#,##0.00'
        style_cell(c, bg=bg, fg=DARK, bold=True, size=10, align=RIGHT)

    # ── Col G : Approved? ──
    c = ws.cell(row=r, column=7, value="✓" if approved_def else "")
    style_cell(c, bg=bg, fg=GRAY_TEXT, size=10, align=CENTER)
    if is_cat_header:
        c.fill = hdr_fill(ACCENT)

    # ── Col H : Variance (line-level — optional hint) ──
    c = ws.cell(row=r, column=8, value="")
    style_cell(c, bg=bg, fg=GRAY_TEXT, size=10, align=CENTER)
    if is_cat_header:
        c.fill = hdr_fill(ACCENT)

    row_offset += 1

# Add a blank spacer row after categories
spacer_idx = START_ROW + NUM_ROWS
ws.row_dimensions[spacer_idx].height = 10

# ═══════════════════════════════════════════════════════════════
#  SECTION 3 — CATEGORY SUBTOTALS
# ═══════════════════════════════════════════════════════════════
sub_start = spacer_idx + 2
ws.merge_cells(f"A{sub_start}:C{sub_start}")
c = ws.cell(row=sub_start, column=1, value="CATEGORY SUBTOTALS")
c.font = Font(name="Calibri", size=12, bold=True, color=WHITE)
c.fill = hdr_fill(MID)
c.alignment = CENTER
ws.merge_cells(f"D{sub_start}:H{sub_start}")
ws.row_dimensions[sub_start].height = 28

# Subtotal rows — one per major category block
sub_cats = [
    ("Total Pre-Production",       START_ROW + 0,  START_ROW + 3),
    ("Total Crew",                 START_ROW + 4,  START_ROW + 10),
    ("Total Cast",                 START_ROW + 11, START_ROW + 13),
    ("Total Studio / Set",         START_ROW + 14, START_ROW + 18),
    ("Total Vehicles",             START_ROW + 19, START_ROW + 22),
    ("Total Meal & CraftSvc",      START_ROW + 23, START_ROW + 25),
    ("Total Post-Production",      START_ROW + 26, START_ROW + 31),
    ("Total Marketing",            START_ROW + 32, START_ROW + 35),
    ("Total Print & Contingency",  START_ROW + 36, START_ROW + 39),
]

sub_row = sub_start + 1
for name, first, last in sub_cats:
    c = ws.cell(row=sub_row, column=1, value=name)
    c.font = Font(name="Calibri", size=10, bold=True, color=DARK)
    c.fill = PatternFill(start_color="E8EEF7", end_color="E8EEF7", fill_type="solid")
    c.alignment = LEFT
    c.border = THIN_BORDER

    ws.merge_cells(f"B{sub_row}:D{sub_row}")
    c2 = ws.cell(row=sub_row, column=2)
    c2.fill = PatternFill(start_color="E8EEF7", end_color="E8EEF7", fill_type="solid")
    c2.border = THIN_BORDER

    c3 = ws.cell(row=sub_row, column=5, value=f"=SUM(F{first}:F{last})")
    c3.number_format = '$#,##0.00'
    c3.font = Font(name="Calibri", size=10, bold=True, color=ACCENT)
    c3.alignment = RIGHT
    c3.border = THIN_BORDER
    c3.fill = PatternFill(start_color="E8EEF7", end_color="E8EEF7", fill_type="solid")

    c4 = ws.cell(row=sub_row, column=6, value=f"=SUM(F{first}:F{last})")
    c4.number_format = '$#,##0.00'
    c4.font = Font(name="Calibri", size=10, bold=True, color=DARK)
    c4.alignment = RIGHT
    c4.border = THIN_BORDER
    c4.fill = PatternFill(start_color="E8EEF7", end_color="E8EEF7", fill_type="solid")

    # Over/Under for this category
    c5 = ws.cell(row=sub_row, column=8)
    c5.value = f'=IF(SUM(F{first}:F{last})>$C$8,"OVER BUDGET","Under")'
    c5.font = Font(name="Calibri", size=9, bold=True, color=WHITE)
    c5.fill = PatternFill(start_color=ACCENT, end_color=ACCENT, fill_type="solid")
    c5.alignment = CENTER
    c5.border = THIN_BORDER

    sub_row += 1

# ═══════════════════════════════════════════════════════════════
#  SECTION 4 — GRAND TOTALS
# ═══════════════════════════════════════════════════════════════
grand_row = sub_row + 1

# Grand Total Expenses
ws.merge_cells(f"A{grand_row}:F{grand_row}")
c = ws.cell(row=grand_row, column=1, value="GRAND TOTAL EXPENSES")
c.font = Font(name="Calibri", size=13, bold=True, color=WHITE)
c.fill = hdr_fill(HIGHLIGHT)
c.alignment = CENTER
for col in range(2, 7):
    ws.cell(row=grand_row, column=col).fill = hdr_fill(HIGHLIGHT)
ws.row_dimensions[grand_row].height = 30

c = ws.cell(row=grand_row, column=7, value=f'=SUM(F{START_ROW}:F{START_ROW + NUM_ROWS - 1})')
c.number_format = '$#,##0.00'
c.font = Font(name="Calibri", size=16, bold=True, color=WHITE)
c.fill = PatternFill(start_color=HIGHLIGHT, end_color=HIGHLIGHT, fill_type="solid")
c.alignment = CENTER
c.border = THIN_BORDER

c = ws.cell(row=grand_row, column=8, value='=IF(G12>$C$8,"🔴 OVER BUDGET","✅ UNDER BUDGET")')
c.font = Font(name="Calibri", size=12, bold=True, color=WHITE)
c.fill = PatternFill(start_color=MID, end_color=MID, fill_type="solid")
c.alignment = CENTER
c.border = THIN_BORDER

# Variance row
var_row = grand_row + 1
ws.merge_cells(f"A{var_row}:F{var_row}")
c = ws.cell(row=var_row, column=1, value="VARIANCE (Budget − Actual)")
c.font = Font(name="Calibri", size=11, bold=True, color=DARK)
c.fill = PatternFill(start_color="FFF8E1", end_color="FFF8E1", fill_type="solid")
c.alignment = CENTER

c = ws.cell(row=var_row, column=7, value=f'=$C$8-G12')
c.number_format = '$#,##0.00'
c.font = Font(name="Calibri", size=13, bold=True, color=DARK)
c.fill = PatternFill(start_color="FFF8E1", end_color="FFF8E1", fill_type="solid")
c.alignment = RIGHT

c = ws.cell(row=var_row, column=8, value='=IF(G13>0,"✅ Under Budget","🔴 Over Budget")')
c.font = Font(name="Calibri", size=11, bold=True, color=WHITE)
c.fill = PatternFill(start_color=ACCENT, end_color=ACCENT, fill_type="solid")
c.alignment = CENTER

# Percentage row
pct_row = var_row + 1
ws.merge_cells(f"A{pct_row}:F{pct_row}")
c = ws.cell(row=pct_row, column=1, value="SPEND % OF BUDGET")
c.font = Font(name="Calibri", size=11, bold=True, color=DARK)
c.fill = PatternFill(start_color=LIGHT_BG, end_color=LIGHT_BG, fill_type="solid")
c.alignment = CENTER

c = ws.cell(row=pct_row, column=7, value=f'=IF($C$8>0,G12/$C$8,0)')
c.number_format = '0.0%'
c.font = Font(name="Calibri", size=13, bold=True, color=DARK)
c.fill = PatternFill(start_color=LIGHT_BG, end_color=LIGHT_BG, fill_type="solid")
c.alignment = RIGHT

c = ws.cell(row=pct_row, column=8, value='=IF(G14>=1,"🚨 ALL SPIRIT!","On Track")')
c.font = Font(name="Calibri", size=11, bold=True, color=WHITE)
c.fill = PatternFill(start_color=ACCENT, end_color=ACCENT, fill_type="solid")
c.alignment = CENTER

# ═══════════════════════════════════════════════════════════════
#  SECTION 5 — CONDITIONAL FORMATTING (color scale on totals)
# ═══════════════════════════════════════════════════════════════
# Apply conditional formatting to Line Total column so red > budget share
budget_val_cell = "C8"

from openpyxl.formatting.rule import CellIsRule

red_fill   = PatternFill(start_color="FF6B6B", end_color="FF6B6B", fill_type="solid")
green_fill = PatternFill(start_color="92D050", end_color="92D050", fill_type="solid")
yellow_fill= PatternFill(start_color="FFE66D", end_color="FFE66D", fill_type="solid")

# Green if line total <= 0 or empty; yellow if 25-50% of budget; red if > 50%
# We can't reference a cell in color scale easily, so let's do icon set on the variance column instead.

# Icon set on variance column (H)
from openpyxl.formatting.rule import IconSetRule
ws.conditional_formatting.add(
    f'H{sub_start+1}:H{sub_start+len(sub_cats)}',
    IconSetRule(
        icons='signs',
        count=[3, 3, 3],
        type=['number','number','number'],
        reverse=False
    )
)

# Also color the Grand Total variance cell dynamically
ws.conditional_formatting.add(
    f'H{var_row}',
    IconSetRule(
        icons='signs',
        count=[3, 3, 3],
        type=['number','number','number'],
        reverse=False
    )
)

# ═══════════════════════════════════════════════════════════════
#  SECTION 6 — QUICK LEGEND / HELP
# ═══════════════════════════════════════════════════════════════
legend_row = pct_row + 2
ws.merge_cells(f"A{legend_row}:H{legend_row}")
c = ws.cell(row=legend_row, column=1,
            value="💡 HOW TO USE:  ① Set your TOTAL BUDGET in C8  →  ② Fill in Qty & Unit Cost for each expense  →  ③ Line Totals auto-calculate  →  ④ Check Over/Under in column H")
c.font = Font(name="Calibri", size=10, italic=True, color=GRAY_TEXT)
c.fill = PatternFill(start_color=LIGHT_BG, end_color=LIGHT_BG, fill_type="solid")
c.alignment = LEFT
ws.row_dimensions[legend_row].height = 22

ws.merge_cells(f"A{legend_row+1}:H{legend_row+1}")
c = ws.cell(row=legend_row+1, column=1,
            value="⚠  The Contingency Fund (row ~40) is pre-set as 10% of your budget as a guide — adjust if needed.  ✅ = Under | 🔴 = Over")
c.font = Font(name="Calibri", size=10, italic=True, color=GRAY_TEXT)
c.fill = PatternFill(start_color=LIGHT_BG, end_color=LIGHT_BG, fill_type="solid")
c.alignment = LEFT

# Freeze panes at the header
ws.freeze_panes = "C11"

# ── Save ───────────────────────────────────────────────────────
output_path = "Film_Budget_Tracker.xlsx"
wb.save(output_path)
print(f"✅ Saved → {output_path}")