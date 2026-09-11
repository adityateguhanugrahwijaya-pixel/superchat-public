from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = Workbook()

# ── COLORS & STYLES ──────────────────────────────────────
header_fill   = PatternFill("solid", fgColor="1a1a2e")
header_font   = Font(bold=True, color="ffffff", size=11)
section_fill  = PatternFill("solid", fgColor="16213e")
section_font  = Font(bold=True, color="e2e2e2", size=10)
money_color   = PatternFill("solid", fgColor="0f3460")
highlight     = PatternFill("solid", fgColor="e94560")
highlight_font = Font(bold=True, color="ffffff")
thin_border   = Border(
    left=Side(style="thin", color="cccccc"),
    right=Side(style="thin", color="cccccc"),
    top=Side(style="thin", color="cccccc"),
    bottom=Side(style="thin", color="cccccc"),
)
center = Alignment(horizontal="center", vertical="center")
left_align = Alignment(horizontal="left", vertical="center")

def style_range(ws, row, col_start, col_end, fill=None, font=None, border=None, alignment=None):
    for c in range(col_start, col_end + 1):
        cell = ws.cell(row=row, column=c)
        if fill:   cell.fill = fill
        if font:   cell.font = font
        if border: cell.border = border
        if alignment: cell.alignment = alignment


# ════════════════════════════════════════════════════════
#  SHEET 1 — BUDGET TRACKER
# ════════════════════════════════════════════════════════
ws1 = wb.active
ws1.title = "🎬 Budget Tracker"

headers = ["#", "Description", "Priority", "Type", "Amount ($)", "Notes"]
for i, h in enumerate(headers, 1):
    ws1.cell(row=1, column=i, value=h)
style_range(ws1, 1, 1, 6, header_fill, header_font, thin_border, center)

# 30 blank rows for entry
for r in range(2, 32):
    ws1.cell(row=r, column=1, value=r - 1)
    for c in range(2, 7):
        ws1.cell(row=r, column=c, value="")
    style_range(ws1, r, 1, 6, money_color, None, thin_border, center if c == 1 else left_align)
    ws1.cell(row=r, column=1).font = Font(color="aaaaaa")

# Totals row
total_row = 32
ws1.cell(row=total_row, column=1, value="")
ws1.cell(row=total_row, column=2, value="TOTAL SPENT")
ws1.cell(row=total_row, column=5, value=f"=SUM(E2:E31)")
style_range(ws1, total_row, 1, 6, highlight, highlight_font, thin_border, center)
ws1.cell(row=total_row, column=5).number_format = "$#,##0.00"

# Subtotals by type
cash_row = 33
credit_row = 34
ws1.cell(row=cash_row, column=2, value="💵 Cash Total")
ws1.cell(row=cash_row, column=5, value="=SUMIF(D2:D31,\"Cash\",E2:E31)")
ws1.cell(row=credit_row, column=2, value="💳 Credit Total")
ws1.cell(row=credit_row, column=5, value="=SUMIF(D2:D31,\"Credit\",E2:E31)")
for r in [cash_row, credit_row]:
    style_range(ws1, r, 1, 6, PatternFill("solid", fgColor="16213e"), section_font, thin_border, left_align)
    ws1.cell(row=r, column=5).number_format = "$#,##0.00"

# Net Available line
net_row = 35
ws1.cell(row=net_row, column=2, value="🏦 Net Available")
ws1.cell(row=net_row, column=5, value='=IFERROR(B4-E32,"Enter budget above")')
ws1.cell(row=net_row, column=5).number_format = "$#,##0.00"
style_range(ws1, net_row, 1, 6, PatternFill("solid", fgColor="e94560"), highlight_font, thin_border, left_align)

# Column widths
ws1.column_dimensions["A"].width = 5
ws1.column_dimensions["B"].width = 28
ws1.column_dimensions["C"].width = 14
ws1.column_dimensions["D"].width = 12
ws1.column_dimensions["E"].width = 16
ws1.column_dimensions["F"].width = 24

# Dropdown helper (Data Validation)
from openpyxl.worksheet.datavalidation import DataValidation
dv_type = DataValidation(type="list", formula1='"Cash,Credit"', allow_blank=True)
dv_type.error = "Pick Cash or Credit"
dv_type.errorTitle = "Invalid Type"
ws1.add_data_validation(dv_type)
dv_type.add(f"D2:D31")

dv_pri = DataValidation(type="list", formula1='"High,Medium,Low,Optional"', allow_blank=True)
ws1.add_data_validation(dv_pri)
dv_pri.add(f"C2:C31")

print("✅ Sheet 1 done: Budget Tracker")


# ════════════════════════════════════════════════════════
#  SHEET 2 — SUMMARY DASHBOARD
# ════════════════════════════════════════════════════════
ws2 = wb.create_sheet("📊 Dashboard")

# Title
ws2.merge_cells("A1:F1")
ws2.cell(row=1, column=1, value="🎬 FILM BUDGET DASHBOARD").font = Font(bold=True, size=18, color="1a1a2e")
ws2.cell(row=1, column=1).alignment = center

# Key metrics block
metrics = [
    ("Total Budget Allocated",     "=$'🎬 Budget Tracker'.$B$36",      "$#,##0.00"),
    ("Total Spent",                "=$'🎬 Budget Tracker'.$E$32",     "$#,##0.00"),
    ("Cash Spent",                 "=$'🎬 Budget Tracker'.$E$33",     "$#,##0.00"),
    ("Credit Spent",               "=$'🎬 Budget Tracker'.$E$34",     "$#,##0.00"),
    ("Remaining / Over Budget",    "=$'🎬 Budget Tracker'.$E$35",     "$#,##0.00"),
    ("Total Items",                "=COUNTA($'🎬 Budget Tracker'.$B$2:$B$31)", "0"),
]
for i, (label, frm, fmt) in enumerate(metrics, 3):
    ws2.cell(row=i, column=1, value=label).font = Font(bold=True)
    ws2.merge_cells(start_row=i, start_column=2, end_row=i, end_column=3)
    cell = ws2.cell(row=i, column=2, value=frm)
    cell.number_format = fmt
    cell.font = Font(size=14, color="e94560" if "Remaining" in label else "1a1a2e")
    cell.alignment = center
    ws2.cell(row=i, column=4).fill = PatternFill("solid", fgColor="f0f0f0")
    ws2.merge_cells(start_row=i, start_column=4, end_row=i, end_column=6)
    ws2.cell(row=i, column=4, value="").fill = PatternFill("solid", fgColor="f0f0f0")

ws2.column_dimensions["A"].width = 28
ws2.column_dimensions["B"].width = 18
ws2.column_dimensions["C"].width = 18
ws2.column_dimensions["D"].width = 6
ws2.column_dimensions["E"].width = 6
ws2.column_dimensions["F"].width = 6

# MOST EXPENSIVE section
ws2.merge_cells("A8:F8")
ws2.cell(row=8, column=1, value="🔥 TOP 5 MOST CONSUMING ITEMS").font = Font(bold=True, size=14, color="e94560")

for i in range(5):
    r = 9 + i
    ws2.cell(row=r, column=1, value=f"{i+1}.").font = Font(bold=True, size=12, color="e94560")
    ws2.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
    ws2.cell(row=r, column=2, value=f"=INDEX($'🎬 Budget Tracker'.$B$2:$B$31,MATCH(LARGE($'🎬 Budget Tracker'.$E$2:$E$31,{i+1}),$'🎬 Budget Tracker'.$E$2:$E$31,0))")
    ws2.merge_cells(start_row=r, column=4, end_row=r, end_column=5)
    ws2.cell(row=r, column=4, value=f"=LARGE($'🎬 Budget Tracker'.$E$2:$E$31,{i+1})")
    ws2.cell(row=r, column=4).number_format = "$#,##0.00"
    ws2.cell(row=r, column=4).font = Font(bold=True, size=12)
    for c in range(1, 6):
        ws2.cell(row=r, column=c).border = thin_border
        ws2.cell(row=r, column=c).alignment = center

# CHEAPEST section
ws2.merge_cells("A16:F16")
ws2.cell(row=16, column=1, value="🌿 TOP 5 CHEAPEST ITEMS").font = Font(bold=True, size=14, color="0f3460")

for i in range(5):
    r = 17 + i
    ws2.cell(row=r, column=1, value=f"{i+1}.").font = Font(bold=True, size=12, color="0f3460")
    ws2.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
    ws2.cell(row=r, column=2, value=f"=INDEX($'🎬 Budget Tracker'.$B$2:$B$31,MATCH(SMALL($'🎬 Budget Tracker'.$E$2:$E$31,{i+1}),$'🎬 Budget Tracker'.$E$2:$E$31,0))")
    ws2.merge_cells(start_row=r, start_column=4, end_row=r, end_column=5)
    ws2.cell(row=r, column=4, value=f"=SMALL($'🎬 Budget Tracker'.$E$2:$E$31,{i+1})")
    ws2.cell(row=r, column=4).number_format = "$#,##0.00"
    ws2.cell(row=r, column=4).font = Font(bold=True, size=12)
    for c in range(1, 6):
        ws2.cell(row=r, column=c).border = thin_border
        ws2.cell(row=r, column=c).alignment = center

# PRIORITY BREAKDOWN
ws2.merge_cells("A24:F24")
ws2.cell(row=24, column=1, value="📋 SPEND BY PRIORITY").font = Font(bold=True, size=14, color="16213e")

priority_labels = [("🟥 High",   "High"), ("🟧 Medium",  "Medium"), ("🟨 Low",     "Low"), ("⬜ Optional","Optional")]
for i, (label, val) in enumerate(priority_labels):
    r = 25 + i
    ws2.cell(row=r, column=1, value=label).font = Font(bold=True)
    ws2.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
    ws2.cell(row=r, column=2, value=f'=SUMIF($'"'"'🎬 Budget Tracker'"'"'.$C$2:$C$31,"{val}",$'"'"'🎬 Budget Tracker'"'"'.$E$2:$E$31)')
    ws2.cell(row=r, column=2).number_format = "$#,##0.00"
    ws2.cell(row=r, column=2).font = Font(size=12)

print("✅ Sheet 2 done: Dashboard")


# ════════════════════════════════════════════════════════
#  SHEET 3 — SETUP GUIDE
# ════════════════════════════════════════════════════════
ws3 = wb.create_sheet("📌 How To Use")
guide = [
    ("🎬 FILM BUDGET SYSTEM — HOW TO USE", ""),
    ("", ""),
    ("1️⃣  Go to the \"Budget Tracker\" sheet.", ""),
    ("2️⃣  In cell B4, enter your TOTAL BUDGET amount (e.g. 50000).", ""),
    ("3️⃣  Fill in each row with:", ""),
    ("   • Description — what you're buying (camera, meals, transport…)", ""),
    ("   • Priority — High / Medium / Low / Optional (use the dropdown)", ""),
    ("   • Type — Cash or Credit (use the dropdown)", ""),
    ("   • Amount — how much it costs", ""),
    ("   • Notes — any extra info", ""),
    ("4️⃣  Switch to the \"Dashboard\" sheet to see:", ""),
    ("   • Your total spent vs. budget remaining", ""),
    ("   • Top 5 most expensive items (auto-calculated)", ""),
    ("   • Top 5 cheapest items (auto-calculated)", ""),
    ("   • Spend breakdown by priority level", ""),
    ("", ""),
    ("💡 TIP: The dashboard formulas use LARGE() and SMALL()", ""),
    ("   which automatically rank your items from most → least expensive.", ""),
    ("   Just add/delete rows in the tracker and the summary updates!", ""),
]
for i, (col_a, col_b) in enumerate(guide, 1):
    ws3.cell(row=i, column=1, value=col_a)
    ws3.cell(row=i, column=2, value=col_b)
    if "HOW TO USE" in col_a:
        ws3.cell(row=i, column=1).font = Font(bold=True, size=16, color="e94560")
        ws3.merge_cells(start_row=i, start_column=1, end_row=i, end_column=3)
    elif col_a.startswith(("1️⃣","2️⃣","3️⃣","4️⃣")):
        ws3.cell(row=i, column=1).font = Font(bold=True, size=12)

ws3.column_dimensions["A"].width = 50
ws3.column_dimensions["B"].width = 40

print("✅ Sheet 3 done: How To Use")

# ── SAVE ──────────────────────────────────────────────────
out = "Film_Budget_System.xlsx"
wb.save(out)
print(f"\n🎉 Saved → {out}")