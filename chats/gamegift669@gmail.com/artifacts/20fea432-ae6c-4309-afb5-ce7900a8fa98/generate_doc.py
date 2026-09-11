from openpyxl import Workbook
from openpyxl.styles import (Font, PatternFill, Alignment, Border, Side,
                              GradientFill)
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import FormulaRule, ColorScaleRule
from openpyxl.chart import BarChart, Reference
from datetime import datetime, timedelta
import random

wb = Workbook()

# ── Color Palette ──────────────────────────────────────────────
DARK_BG       = "1A1A2E"
MID_BG        = "16213E"
ACCENT_BLUE   = "0F3460"
ACCENT_TEAL   = "00B4D8"
ACCENT_GREEN  = "00C897"
ACCENT_ORANGE = "F77F00"
ACCENT_RED    = "E94560"
WHITE         = "FFFFFF"
LIGHT_GRAY    = "E8E8E8"
TABLE_HEADER  = "2D4059"
CARD_BG       = "1E2736"
INPUT_BG      = "F0F4F8"
GOLD          = "FFD700"

def fill(hex_color):
    return PatternFill("solid", fgColor=hex_color)

def font(bold=False, color=WHITE, size=11, name="Calibri"):
    return Font(bold=bold, color=color, size=size, name=name)

def border(style="thin"):
    s = Side(style=style)
    return Border(left=s, right=s, top=s, bottom=s)

def center():
    return Alignment(horizontal="center", vertical="center", wrap_text=True)

def left_align():
    return Alignment(horizontal="left", vertical="center", wrap_text=True)

# ═══════════════════════════════════════════════════════════════
# SHEET 1: DASHBOARD
# ═══════════════════════════════════════════════════════════════
ws_dash = wb.active
ws_dash.title = "📊 Dashboard"
ws_dash.sheet_view.showGridLines = False

# Column widths
ws_dash.column_dimensions["A"].width = 4
ws_dash.column_dimensions["B"].width = 22
ws_dash.column_dimensions["C"].width = 18
ws_dash.column_dimensions["D"].width = 18
ws_dash.column_dimensions["E"].width = 18
ws_dash.column_dimensions["F"].width = 18
ws_dash.column_dimensions["G"].width = 18
ws_dash.column_dimensions["H"].width = 28

row = 1

# Title Banner
for c in range(1, 8):
    cell = ws_dash.cell(row=row, column=c, value="")
    cell.fill = fill(DARK_BG)
row += 1

cell = ws_dash.cell(row=row, column=2, value="💰 BUDGET TRACKER")
cell.font = Font(bold=True, color=ACCENT_TEAL, size=22, name="Calibri")
cell.alignment = center()
ws_dash.merge_cells(f"B{row}:G{row}")
row += 1

cell = ws_dash.cell(row=row, column=2, value=f"Personal Finance Manager  •  {datetime.now().strftime('%B %Y')}")
cell.font = Font(color="AAAAAA", size=10, name="Calibri")
cell.alignment = center()
ws_dash.merge_cells(f"B{row}:G{row}")
ws_dash.row_dimensions[row].height = 12
row += 2

# ── Summary Cards Row 1 ───────────────────────────────────────
card_labels = [
    ("TOTAL INCOME", "+"),
    ("TOTAL EXPENSES", "−"),
    ("BALANCE", "="),
    ("SAVINGS RATE", "%"),
]
card_colors = [ACCENT_GREEN, ACCENT_RED, ACCENT_TEAL, GOLD]
card_formulas = [
    f"=SUM(Income!C:C)",
    f"=SUM(Expenses!D:D)",
    f"=C4-D4",
    f"=IF(C4=0,0,C4/C4*100)",
]
card_refs = ["C4","D4","E4","F4"]

for i, (label, sym) in enumerate(card_labels):
    col_idx = i + 2
    # Card background
    for r in range(row, row + 3):
        for cc in range(col_idx, col_idx + 2):
            cell = ws_dash.cell(row=r, column=cc)
            cell.fill = fill(card_colors[i])
            cell.border = border()
    # Label
    cell = ws_dash.cell(row=row, column=col_idx, value=label)
    cell.font = Font(bold=True, color=DARK_BG, size=9, name="Calibri")
    cell.alignment = center()
    ws_dash.merge_cells(start_row=row, start_column=col_idx,
                        end_row=row, end_column=col_idx+1)
    row += 1
    # Value
    cell = ws_dash.cell(row=row, column=col_idx, value=card_formulas[i])
    cell.font = Font(bold=True, color=WHITE, size=18, name="Calibri")
    cell.alignment = center()
    ws_dash.merge_cells(start_row=row, start_column=col_idx,
                        end_row=row, end_column=col_idx+1)
    row += 1
    # Sub-row
    if sym in ("+", "−"):
        cell = ws_dash.cell(row=row, column=col_idx, value=f"vs last month ▸")
        cell.font = Font(color="CCCCCC", size=8, name="Calibri")
        cell.alignment = center()
        ws_dash.merge_cells(start_row=row, start_column=col_idx,
                            end_row=row, end_column=col_idx+1)
    row += 2

# ── Budget vs Actual Section ──────────────────────────────────
row += 1
cell = ws_dash.cell(row=row, column=2, value="📈 BUDGET VS ACTUAL")
cell.font = Font(bold=True, color=ACCENT_TEAL, size=14, name="Calibri")
ws_dash.merge_cells(f"B{row}:H{row}")
row += 1

headers = ["Category", "Budgeted", "Actual Spent", "Difference", "% Used", "", "Status"]
for ci, h in enumerate(headers):
    cell = ws_dash.cell(row=row, column=ci+1, value=h)
    cell.fill = fill(TABLE_HEADER)
    cell.font = Font(bold=True, color=WHITE, size=10, name="Calibri")
    cell.alignment = center()
    cell.border = border()
row += 1

categories = ["Housing", "Utilities", "Groceries", "Transportation",
              "Dining Out", "Entertainment", "Shopping", "Healthcare",
              "Insurance", "Savings", "Other"]
budget_amounts = [1500, 200, 600, 300, 200, 150, 250, 150, 400, 500, 100]
actual_formulas_rows = []

for ci, cat in enumerate(categories):
    act_col = get_column_letter(ci + 5)  # E onwards
    budget_cell = f"${cat}!B{ci+2}"
    actual_cell = f"=VLOOKUP(\"{cat}\",Expenses!$B$2:$D$100,3,FALSE)"

    for cc, val in enumerate([cat, budget_amounts[ci], actual_cell,
                               f"{act_col}{row}", f"{act_col}{row}/B{row}",
                               "",
                               f'=IF({act_col}{row}>B{row},"⚠ OVER",IF({act_col}{row}>B{row}*0.9,"⚡ Watch","✅ OK"))']):
        cell = ws_dash.cell(row=row, column=cc+1, value=val)
        cell.border = border()
        if cc == 0:
            cell.font = Font(size=10, name="Calibri")
            cell.alignment = left_align()
        elif cc in (1, 2, 3):
            cell.font = Font(size=10, name="Calibri")
            cell.alignment = center()
            if cc == 1:
                cell.number_format = '$#,##0'
            elif cc == 2 and isinstance(val, str) and val.startswith("="):
                cell.number_format = '$#,##0'
            elif cc == 3:
                cell.number_format = '$#,##0.00'
        elif cc == 4:
            cell.number_format = '0%'
            cell.font = Font(size=10, name="Calibri")
            cell.alignment = center()
        else:
            cell.alignment = center()
            cell.font = Font(size=10, name="Calibri")
    row += 1

# Totals row
cell = ws_dash.cell(row=row, column=1, value="TOTAL")
cell.font = Font(bold=True, size=11, name="Calibri")
cell.alignment = left_align()
cell.fill = fill(TABLE_HEADER)
cell.border = border()
for cc in range(2, 8):
    cell = ws_dash.cell(row=row, column=cc,
                         value=f"=SUM({get_column_letter(cc)}{row-11}:{get_column_letter(cc)}{row-1})")
    cell.font = Font(bold=True, size=11, name="Calibri")
    cell.alignment = center()
    cell.fill = fill(TABLE_HEADER)
    cell.border = border()
    if cc in (2, 3, 4):
        cell.number_format = '$#,##0'
row += 2

# ── Quick Tips Section ────────────────────────────────────────
cell = ws_dash.cell(row=row, column=2, value="💡 QUICK TIPS")
cell.font = Font(bold=True, color=ACCENT_TEAL, size=12, name="Calibri")
row += 1
tips = [
    "• Keep your savings rate above 20% for financial health",
    "• The 50/30/20 rule: 50% needs, 30% wants, 20% savings",
    "• Review your budget monthly and adjust as needed",
    "• Emergency fund should cover 3–6 months of expenses",
]
for tip in tips:
    cell = ws_dash.cell(row=row, column=2, value=tip)
    cell.font = Font(color="AAAAAA", size=10, name="Calibri")
    ws_dash.merge_cells(f"B{row}:H{row}")
    row += 1

# ═══════════════════════════════════════════════════════════════
# SHEET 2: INCOME
# ═══════════════════════════════════════════════════════════════
ws_inc = wb.create_sheet("💵 Income")
ws_inc.sheet_view.showGridLines = False

ws_inc.column_dimensions["A"].width = 4
ws_inc.column_dimensions["B"].width = 22
ws_inc.column_dimensions["C"].width = 20
ws_inc.column_dimensions["D"].width = 16
ws_inc.column_dimensions["E"].width = 16
ws_inc.column_dimensions["F"].width = 28

row = 1
# Title
for c in range(1, 7):
    cell = ws_inc.cell(row=row, column=c)
    cell.fill = fill(ACCENT_BLUE)
row += 1
cell = ws_inc.cell(row=row, column=2, value="💵 Income Tracker")
cell.font = Font(bold=True, color=WHITE, size=18, name="Calibri")
ws_inc.merge_cells(f"B{row}:F{row}")
row += 2

# Headers
inc_headers = ["Source", "Amount ($)", "Frequency", "Type", "Notes"]
for ci, h in enumerate(inc_headers):
    cell = ws_inc.cell(row=row, column=ci+1, value=h)
    cell.fill = fill(MID_BG)
    cell.font = Font(bold=True, color=WHITE, size=11, name="Calibri")
    cell.alignment = center()
    cell.border = border()
row += 1

inc_data = [
    ("Salary / Wages", 4500, "Monthly", "Recurring", "Primary job"),
    ("Freelance Work", 800,  "Monthly", "Variable",   "Side project"),
    ("Investment Dividends", 120, "Quarterly", "Passive", "Stock dividends"),
    ("Rental Income", 1200,  "Monthly", "Passive",   "Apartment"),
    ("Side Business", 350,   "Monthly", "Variable",   "Small ventures"),
    ("Gifts / Bonuses", 0,   "Rare",    "Windfall",   ""),
]
for data in inc_data:
    for ci, val in enumerate(data):
        cell = ws_inc.cell(row=row, column=ci+1, value=val)
        cell.fill = fill(INPUT_BG)
        cell.border = border()
        cell.alignment = center() if ci > 0 else left_align()
        if ci == 1:
            cell.number_format = '$#,##0'
    row += 1

# Total row
total_row = row
cell = ws_inc.cell(row=row, column=1, value="TOTAL INCOME")
cell.font = Font(bold=True, color=DARK_BG, size=12, name="Calibri")
cell.fill = fill(ACCENT_GREEN)
cell.border = border()
cell.alignment = center()
for cc in range(2, 6):
    col = get_column_letter(cc)
    cell = ws_inc.cell(row=row, column=cc,
                       value=f"=SUM({col}2:{col}7)")
    cell.font = Font(bold=True, color=DARK_BG, size=12, name="Calibri")
    cell.fill = fill(ACCENT_GREEN)
    cell.border = border()
    cell.alignment = center()
    cell.number_format = '$#,##0'
ws_inc.row_dimensions[row].height = 28

# ═══════════════════════════════════════════════════════════════
# SHEET 3: EXPENSES
# ═══════════════════════════════════════════════════════════════
ws_exp = wb.create_sheet("💸 Expenses")
ws_exp.sheet_view.showGridLines = False

ws_exp.column_dimensions["A"].width = 4
ws_exp.column_dimensions["B"].width = 20
ws_exp.column_dimensions["C"].width = 14
ws_exp.column_dimensions["D"].width = 14
ws_exp.column_dimensions["E"].width = 16
ws_exp.column_dimensions["F"].width = 14
ws_exp.column_dimensions["G"].width = 24

row = 1
for c in range(1, 8):
    cell = ws_exp.cell(row=row, column=c)
    cell.fill = fill(ACCENT_BLUE)
row += 1
cell = ws_exp.cell(row=row, column=2, value="💸 Expense Log")
cell.font = Font(bold=True, color=WHITE, size=18, name="Calibri")
ws_exp.merge_cells(f"B{row}:G{row}")
row += 2

exp_headers = ["Date", "Category", "Description", "Amount ($)", "Payment Method", "Recurring?", "Notes"]
for ci, h in enumerate(exp_headers):
    cell = ws_exp.cell(row=row, column=ci+1, value=h)
    cell.fill = fill(MID_BG)
    cell.font = Font(bold=True, color=WHITE, size=11, name="Calibri")
    cell.alignment = center()
    cell.border = border()
row += 1

sample_expenses = [
    ("2025-01-01", "Housing",       "Rent Payment",           1500, "Bank Transfer", "Yes", "Monthly rent"),
    ("2025-01-03", "Utilities",     "Electric Bill",            85,  "Credit Card",   "No",  ""),
    ("2025-01-05", "Groceries",     "Whole Foods Market",       142, "Debit Card",    "No",  "Weekly shop"),
    ("2025-01-07", "Transportation","Gas Fill-up",              55,  "Credit Card",   "No",  ""),
    ("2025-01-08", "Dining Out",    "Italian Restaurant",       78,  "Credit Card",   "No",  "Anniversary"),
    ("2025-01-10", "Entertainment", "Netflix Subscription",     15,  "Credit Card",   "Yes", "Monthly"),
    ("2025-01-12", "Shopping",      "New Shoes",               120,  "Credit Card",   "No",  ""),
    ("2025-01-14", "Healthcare",    "Doctor Co-pay",            30,  "Insurance",     "No",  ""),
    ("2025-01-15", "Insurance",     "Car Insurance",           180,  "Bank Transfer", "Yes", "Monthly"),
    ("2025-01-18", "Groceries",     "Trader Joe's",             89,  "Debit Card",    "No",  ""),
    ("2025-01-20", "Transportation","Uber Ride",                24,  "Credit Card",   "No",  ""),
    ("2025-01-22", "Dining Out",    "Sushi Place",              65,  "Credit Card",   "No",  ""),
    ("2025-01-25", "Entertainment", "Spotify Premium",          11,  "Credit Card",   "Yes", "Monthly"),
    ("2025-01-27", "Savings",       "Emergency Fund Deposit",  500,  "Bank Transfer", "Yes", "Monthly savings"),
    ("2025-01-28", "Utilities",     "Internet Bill",            70,  "Bank Transfer", "Yes", "Monthly"),
    ("2025-01-30", "Other",         "Random Purchase",          35,  "Cash",          "No",  ""),
]

payment_methods = ["Cash", "Credit Card", "Debit Card", "Bank Transfer", "Insurance"]
categories_exp = ["Housing","Utilities","Groceries","Transportation",
                  "Dining Out","Entertainment","Shopping","Healthcare",
                  "Insurance","Savings","Other"]

for exp in sample_expenses:
    for ci, val in enumerate(exp):
        cell = ws_exp.cell(row=row, column=ci+1, value=val)
        cell.fill = fill(INPUT_BG)
        cell.border = border()
        if ci == 0:
            cell.number_format = "YYYY-MM-DD"
            cell.alignment = center()
        elif ci == 3:
            cell.number_format = '$#,##0'
            cell.alignment = center()
        elif ci in (1, 4, 5):
            cell.alignment = center()
        else:
            cell.alignment = left_align()
    row += 1

# Category subtotal section
row += 1
cell = ws_exp.cell(row=row, column=2, value="CATEGORY SUBTOTALS")
cell.font = Font(bold=True, color=WHITE, size=13, name="Calibri")
cell.fill = fill(TABLE_HEADER)
ws_exp.merge_cells(f"B{row}:G{row}")
row += 1

sub_headers = ["Category", "Total Spent", "Avg per Month", "", "Of Total", "", "Visual"]
for ci, h in enumerate(sub_headers):
    cell = ws_exp.cell(row=row, column=ci+1, value=h)
    cell.fill = fill(MID_BG)
    cell.font = Font(bold=True, color=WHITE, size=10, name="Calibri")
    cell.alignment = center()
    cell.border = border()
row += 1

last_data_row = row - 2  # row after the header was incremented
data_start = 2
data_end = last_data_row

for ci, cat in enumerate(categories_exp):
    col = get_column_letter(ci + 2)
    total_formula = f"=SUMIF(B{data_start}:B{data_end},A{row},D{data_start}:D{data_end})"
    avg_formula = f"=IFERROR({total_formula}/1,0)"
    pct_formula = f"=IFERROR({total_formula}/$D${data_end+1},0)"

    vals = [cat, total_formula, avg_formula, "", pct_formula, "", ""]
    for cc, val in enumerate(vals):
        cell = ws_exp.cell(row=row, column=cc+1, value=val)
        cell.border = border()
        if cc == 0:
            cell.font = Font(size=10, name="Calibri")
            cell.alignment = left_align()
            cell.fill = fill(INPUT_BG)
        elif cc in (1, 2):
            cell.number_format = '$#,##0'
            cell.font = Font(size=10, name="Calibri")
            cell.alignment = center()
            cell.fill = fill(INPUT_BG)
        elif cc == 4:
            cell.number_format = '0%'
            cell.font = Font(size=10, name="Calibri")
            cell.alignment = center()
            cell.fill = fill(INPUT_BG)
        else:
            cell.fill = fill(INPUT_BG)
    row += 1

# Grand total
grand_total_row = row
cell = ws_exp.cell(row=row, column=2, value="GRAND TOTAL")
cell.font = Font(bold=True, size=11, name="Calibri")
cell.fill = fill(ACCENT_RED)
cell.border = border()
cell.alignment = center()
for cc in range(3, 7):
    col = get_column_letter(cc)
    cell = ws_exp.cell(row=row, column=cc,
                       value=f"=SUM({col}{data_start}:{col}{last_data_row})")
    cell.font = Font(bold=True, size=11, name="Calibri")
    cell.fill = fill(ACCENT_RED)
    cell.border = border()
    cell.alignment = center()
    if cc in (3, 5):
        cell.number_format = '$#,##0'

# ═══════════════════════════════════════════════════════════════
# SHEET 4: BUDGET PLANNER
# ═══════════════════════════════════════════════════════════════
ws_budget = wb.create_sheet("🎯 Budget Planner")
ws_budget.sheet_view.showGridLines = False

ws_budget.column_dimensions["A"].width = 4
ws_budget.column_dimensions["B"].width = 20
ws_budget.column_dimensions["C"].width = 16
ws_budget.column_dimensions["D"].width = 16
ws_budget.column_dimensions["E"].width = 16
ws_budget.column_dimensions["F"].width = 16
ws_budget.column_dimensions["G"].width = 24

row = 1
for c in range(1, 8):
    cell = ws_budget.cell(row=row, column=c)
    cell.fill = fill(ACCENT_BLUE)
row += 1
cell = ws_budget.cell(row=row, column=2, value="🎯 Monthly Budget Planner")
cell.font = Font(bold=True, color=WHITE, size=18, name="Calibri")
ws_budget.merge_cells(f"B{row}:G{row}")
row += 2

bp_headers = ["Category", "Budgeted ($)", "Actual ($)", "Difference ($)", "% Budget", "", "Action"]
for ci, h in enumerate(bp_headers):
    cell = ws_budget.cell(row=row, column=ci+1, value=h)
    cell.fill = fill(MID_BG)
    cell.font = Font(bold=True, color=WHITE, size=11, name="Calibri")
    cell.alignment = center()
    cell.border = border()
row += 1

budget_cats = [
    ("Housing",         1500),
    ("Utilities",       200),
    ("Groceries",       600),
    ("Transportation",  300),
    ("Dining Out",      200),
    ("Entertainment",   150),
    ("Shopping",        250),
    ("Healthcare",      150),
    ("Insurance",       400),
    ("Savings",         500),
    ("Other",           100),
]

for cat, budgeted in budget_cats:
    act_formula = f"=VLOOKUP(\"{cat}\",Expenses!$B$2:$D$100,3,FALSE)"
    diff_formula = f"C{row}-B{row}"
    pct_formula = f"=IF(B{row}=0,0,B{row}/C{row})"
    action_formula = f'=IF(C{row}>B{row},"⚠ Over Budget",IF(C{row}>B{row}*0.9,"⚡ Close","✅ On Track"))'

    vals = [cat, budgeted, act_formula, diff_formula, pct_formula, "", action_formula]
    for cc, val in enumerate(vals):
        cell = ws_budget.cell(row=row, column=cc+1, value=val)
        cell.border = border()
        cell.fill = fill(INPUT_BG)
        if cc == 0:
            cell.font = Font(size=10, name="Calibri")
            cell.alignment = left_align()
        elif cc in (1, 2, 3):
            cell.number_format = '$#,##0'
            cell.font = Font(size=10, name="Calibri")
            cell.alignment = center()
        elif cc == 4:
            cell.number_format = '0%'
            cell.alignment = center()
        else:
            cell.alignment = center()
    row += 1

# Budget total
bt_row = row
cell = ws_budget.cell(row=row, column=1, value="TOTAL BUDGET")
cell.font = Font(bold=True, size=11, name="Calibri")
cell.fill = fill(TABLE_HEADER)
cell.border = border()
cell.alignment = center()
for cc in range(2, 7):
    col = get_column_letter(cc)
    cell = ws_budget.cell(row=row, column=cc,
                           value=f"=SUM({col}2:{col}{bt_row-1})")
    cell.font = Font(bold=True, size=11, name="Calibri")
    cell.fill = fill(TABLE_HEADER)
    cell.border = border()
    cell.alignment = center()
    if cc in (2, 3, 4):
        cell.number_format = '$#,##0'

# ═══════════════════════════════════════════════════════════════
# SHEET 5: SAVINGS GOAL
# ═══════════════════════════════════════════════════════════════
ws_save = wb.create_sheet("🎯 Savings Goal")
ws_save.sheet_view.showGridLines = False

ws_save.column_dimensions["A"].width = 4
ws_save.column_dimensions["B"].width = 22
ws_save.column_dimensions["C"].width = 18
ws_save.column_dimensions["D"].width = 18
ws_save.column_dimensions["E"].width = 18
ws_save.column_dimensions["F"].width = 28

row = 1
for c in range(1, 7):
    cell = ws_save.cell(row=row, column=c)
    cell.fill = fill(ACCENT_GREEN)
row += 1
cell = ws_save.cell(row=row, column=2, value="🎯 Savings & Goals Tracker")
cell.font = Font(bold=True, color=WHITE, size=18, name="Calibri")
ws_save.merge_cells(f"B{row}:F{row}")
row += 2

sg_headers = ["Goal", "Target ($)", "Current ($)", "Remaining ($)", "% Done", ""]
for ci, h in enumerate(sg_headers):
    cell = ws_save.cell(row=row, column=ci+1, value=h)
    cell.fill = fill(MID_BG)
    cell.font = Font(bold=True, color=WHITE, size=11, name="Calibri")
    cell.alignment = center()
    cell.border = border()
row += 1

savings_goals = [
    ("Emergency Fund",       10000,  4500),
    ("Vacation Fund",        3000,   1200),
    ("New Car",             25000,   8000),
    ("Down Payment",       50000,  15000),
    ("Retirement (401k)", 100000,  42000),
    ("Side Business",       5000,    800),
]

for goal_name, target, current in savings_goals:
    remaining = f"B{row}-C{row}"
    pct = f"=IF(B{row}=0,0,C{row}/B{row})"

    vals = [goal_name, target, current, remaining, pct, ""]
    for cc, val in enumerate(vals):
        cell = ws_save.cell(row=row, column=cc+1, value=val)
        cell.border = border()
        cell.fill = fill(INPUT_BG)
        if cc == 0:
            cell.font = Font(size=10, name="Calibri")
            cell.alignment = left_align()
        elif cc in (1, 2, 3):
            cell.number_format = '$#,##0'
            cell.font = Font(size=10, name="Calibri")
            cell.alignment = center()
        elif cc == 4:
            cell.number_format = '0%'
            cell.alignment = center()
    row += 1

# Progress bar visual using conditional formatting hint
cell = ws_save.cell(row=row, column=2,
                     value="💡 Tip: Edit 'Current' amount as you save towards each goal!")
cell.font = Font(italic=True, color="888888", size=9, name="Calibri")
ws_save.merge_cells(f"B{row}:F{row}")
row += 2

# ═══════════════════════════════════════════════════════════════
# CONDITIONAL FORMATTING
# ═══════════════════════════════════════════════════════════════
# Color scale on expense amounts
expense_data = ws_exp.range(f"D2:D{len(sample_expenses)+1}")
color_scale = ColorScaleRule(
    start_type='min', start_color='00C897',
    mid_type='percentile', mid_value=50, mid_color='F77F00',
    end_type='max', end_color='E94560'
)

# Apply to the dashboard income/expense cards
# Highlight negative balances
dash_range = ws_dash.range(f"E4:E5")

# ═══════════════════════════════════════════════════════════════
# CHART — Expense Breakdown
# ═══════════════════════════════════════════════════════════════
ws_chart = wb.create_sheet("📊 Chart")
ws_chart.sheet_view.showGridLines = False
ws_chart.column_dimensions["A"].width = 3
ws_chart.column_dimensions["B"].width = 18

# Pull category data for chart
chart_data = Reference(ws_exp, min_col=3, min_row=12,
                        max_row=12+len(categories_exp)-1)
chart_cats = Reference(ws_exp, min_col=2, min_row=12,
                        max_row=12+len(categories_exp)-1)

pie = BarChart()
pie.type = "col"
pie.style = 10
pie.title = "Expense Breakdown by Category"
pie.y_axis.title = "Amount ($)"
pie.x_axis.title = "Category"
pie.width = 14
pie.height = 10

data_ref = Reference(ws_exp, min_col=3,
                      min_row=12, max_row=12+len(categories_exp)-1,
                      max_col=3)
cats_ref = Reference(ws_exp, min_col=2,
                      min_row=12, max_row=12+len(categories_exp)-1)
pie.add_data(data_ref, titles_from_data=True)
pie.set_categories(cats_ref)
ws_chart.add_chart(pie, "B3")

# ═══════════════════════════════════════════════════════════════
# SAVE
# ═══════════════════════════════════════════════════════════════
output_path = "/mnt/data/Budget_Tracker.xlsx"
wb.save(output_path)
print(f"✅ Budget Tracker saved to {output_path}")
print(f"   Sheets: {[s.title for s in wb.worksheets]}")