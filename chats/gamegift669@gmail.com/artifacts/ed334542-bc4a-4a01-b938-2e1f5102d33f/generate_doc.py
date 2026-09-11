import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, GradientFill
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import FormulaRule, CellIsRule
from openpyxl.worksheet.datavalidation import DataValidation
from datetime import datetime, date
import os

wb = openpyxl.Workbook()

# ════════════════════════════════════════════════════════════════
#  STYLES & PALETTE
# ════════════════════════════════════════════════════════════════
C = {
    "navy":    "1B3A5C",
    "blue":    "2E75B6",
    "light":   "DDEBF7",
    "white":   "FFFFFF",
    "green":   "C6EFCE",
    "red":     "FFC7CE",
    "yellow":  "FFEB9C",
    "orange":  "FCE4D6",
    "purple":  "EAD8F8",
    "teal":    "D9F0F0",
    "gray":    "F2F2F2",
    "dark_txt":"1B3A5C",
    "mid_txt":  "404040",
    "lt_txt":   "808080",
}

def F(color, bold=False, size=11, italic=False):
    return Font(name="Calibri", color=color, bold=bold, size=size, italic=italic)

def Fill(color):
    return PatternFill("solid", fgColor=color)

def Bdr(thick=False):
    s = 'thick' if thick else 'thin'
    return Border(
        left=Side(style=s), right=Side(style=s),
        top=Side(style=s), bottom=Side(style=s)
    )

def thin():
    return Bdr(thick=False)

def thin_center():
    return Alignment(horizontal="center", vertical="center")

def thin_left():
    return Alignment(horizontal="left", vertical="center")

def thin_right():
    return Alignment(horizontal="right", vertical="center")

def sc(ws, r, c, val=None, font=None, fill=None, align=None, border=None, nf=None):
    cell = ws.cell(row=r, column=c, value=val)
    if font:  cell.font  = font
    if fill:  cell.fill  = fill
    if align: cell.alignment = align
    if border: cell.border = border
    if nf:    cell.number_format = nf
    return cell

def merge_and_set(ws, start_col, end_col, row, value, font=None, fill=None, align=None, border=True):
    ws.merge_cells(start_row=row, start_column=start_col, end_row=row, end_column=end_col)
    cell = ws[f"{get_column_letter(start_col)}{row}"]
    cell.value = value
    if font:  cell.font  = font
    if fill:  cell.fill  = fill
    if align: cell.alignment = align
    if border: cell.border = thin()
    return cell

# ════════════════════════════════════════════════════════════════
#  SHEET 1 — DASHBOARD
# ════════════════════════════════════════════════════════════════
ws = wb.active
ws.title = "🏠 Dashboard"
ws.sheet_view.showGridLines = False

# Column widths
for i, w in enumerate([5, 24, 14, 14, 14, 10, 12, 22], 1):
    ws.column_dimensions[get_column_letter(i)].width = w

# ── HEADER BANNER ──
merge_and_set(ws, 1, 8, 1, "💰  PERSONAL BUDGET TRACKER",
              font=F(C["navy"], bold=True, size=22),
              fill=Fill(C["navy"]), align=thin_center())
ws.row_dimensions[1].height = 48

merge_and_set(ws, 1, 8, 2,
              f"📅 {datetime.now().strftime('%B %Y')}  •  Income ≠ Expenses?  Adjust your budgeted amounts to match!",
              font=F(C["lt_txt"], italic=True, size=10),
              fill=Fill(C["light"]), align=thin_center())
ws.row_dimensions[2].height = 20

# ── KEY METRICS CARDS (Row 4–6) ──
metrics = [
    ("TOTAL INCOME", "=SUM(Income!B6:B12)", "$#,##0.00", C["green"]),
    ("TOTAL EXPENSES", "=SUM(Expense!B5:B20)", "$#,##0.00", C["red"]),
    ("NET BALANCE", "=B5-B6", "$#,##0.00", C["yellow"]),
    ("SAVINGS RATE", '=IF(B5=0,"—",ROUND((B5-B6)/B5,2))', "0.0%", C["blue"]),
]
metric_labels = ["💵 Income", "🛒 Expenses", "📊 Balance", "🎯 Savings"]
for i, (label, formula, fmt, accent) in enumerate(metrics):
    col = i + 1
    row = 5
    # Card background
    ws.merge_cells(start_row=row, start_column=col, end_row=row, end_column=col)
    cell = ws.cell(row=row, column=col)
    cell.value = formula
    cell.font = F(C["navy"], bold=True, size=20)
    cell.fill = Fill(C["white"])
    cell.border = thin()
    cell.alignment = thin_center()
    cell.number_format = fmt
    # Accent bar at top
    ws.row_dimensions[row].height = 52
    # Label below
    sc(ws, row+1, col, label, F(C["lt_txt"], size=9, italic=True),
       fill=Fill(C["light"]), align=thin_center())
    # Color indicator dot
    sc(ws, row-1, col, "●", F(accent, bold=True, size=18),
       fill=Fill(C["white"]), align=thin_center(), border=thin())
    ws.row_dimensions[row-1].height = 12

# Separator line
for c in range(1, 9):
    sc(ws, 4, c, None, fill=Fill(C["navy"]), border=thin())

# ── QUICK REFERENCE TABLE ──
sc(ws, 7, 1, "📋  QUICK BUDGET REFERENCE", F(C["navy"], bold=True, size=12),
   fill=Fill(C["light"]), align=thin_left())
ws.row_dimensions[7].height = 22

quick_headers = ["Category", "Budgeted", "Actual", "Diff", "% Used", "Status", "", ""]
for ci, h in enumerate(quick_headers, 1):
    sc(ws, 8, ci, h, F(C["white"], bold=True, size=10),
       fill=Fill(C["navy"]), align=thin_center())
ws.row_dimensions[8].height = 20

quick_items = [
    ("Housing / Rent",   "Income", True),
    ("Groceries",        "Expense", False),
    ("Transportation",   "Expense", False),
    ("Entertainment",    "Expense", False),
    ("Savings",          "Income", True),
]
for i, (cat, typ, highlight) in enumerate(quick_items):
    r = 9 + i
    base = C["green"] if typ == "Income" else (C["yellow"] if highlight else C["red"])
    alt  = C["gray"] if i % 2 == 0 else C["white"]
    sc(ws, r, 1, cat, F(C["mid_txt"]), fill=Fill(alt), align=thin_left())
    sc(ws, r, 2, 0, F(C["mid_txt"]), fill=Fill(alt), align=thin_right(), nf='$#,##0')
    sc(ws, r, 3, 0, F(C["mid_txt"]), fill=Fill(alt), align=thin_right(), nf='$#,##0')
    sc(ws, r, 4, f"=B{r}-C{r}", F(C["mid_txt"]), fill=Fill(alt), align=thin_right(), nf='$#,##0')
    sc(ws, r, 5, f'=IF(B{r}=0,"—",ROUND(C{r}/B{r},2))', F(C["mid_txt"]),
       fill=Fill(alt), align=thin_center(), nf='0%')
    sc(ws, r, 6, f'=IF(D{r}<0,"🔴 Over","🟢 OK")', F(C["mid_txt"]),
       fill=Fill(alt), align=thin_center())
    for c in [7, 8]:
        sc(ws, r, c, None, fill=Fill(alt), border=thin())

# Footer note
footer_r = 15
merge_and_set(ws, 1, 8, footer_r,
              "💡 Tip: Use the 'Budget', 'Log', and 'Goals' sheets for full tracking. Edit values in the green cells!",
              font=F(C["lt_txt"], italic=True, size=9),
              fill=Fill(C["yellow"]), align=thin_center())


# ════════════════════════════════════════════════════════════════
#  SHEET 2 — INCOME
# ════════════════════════════════════════════════════════════════
ws_inc = wb.create_sheet("Income")
ws_inc.sheet_view.showGridLines = False

for i, w in enumerate([5, 26, 14, 14, 12, 14, 20], 1):
    ws_inc.column_dimensions[get_column_letter(i)].width = w

merge_and_set(ws_inc, 1, 7, 1, "✅  INCOME SOURCES",
              font=F(C["white"], bold=True, size=16),
              fill=Fill(C["green"]), align=thin_center())
ws_inc.row_dimensions[1].height = 36

inc_hdrs = ["#", "Income Source", "Monthly Budgeted", "Actual This Month", "Annual Total", "Priority", "Notes"]
for ci, h in enumerate(inc_hdrs, 1):
    sc(ws_inc, 3, ci, h, F(C["white"], bold=True, size=10), fill=Fill(C["navy"]), align=thin_center())
ws_inc.row_dimensions[3].height = 22

income_sources = [
    ("Primary Salary",       "High",   ""),
    ("Secondary Job",         "Medium", ""),
    ("Freelance / Gig Work",  "Medium", "Ongoing projects"),
    ("Investment Returns",    "Low",    "Dividends, stocks"),
    ("Rental Income",         "Medium", ""),
    ("Side Business",         "Low",    ""),
    ("Gifts & Bonuses",       "Low",    "Irregular income"),
]
for i, (name, prio, note) in enumerate(income_sources):
    r = 4 + i
    alt = C["gray"] if i % 2 == 0 else C["white"]
    sc(ws_inc, r, 1, i+1, F(C["lt_txt"], size=10), fill=Fill(alt), align=thin_center())
    sc(ws_inc, r, 2, name, F(C["mid_txt"]), fill=Fill(alt), align=thin_left())
    sc(ws_inc, r, 3, 0, F(C["mid_txt"]), fill=Fill(alt), align=thin_right(), nf='$#,##0.00')
    sc(ws_inc, r, 4, 0, F(C["mid_txt"]), fill=Fill(alt), align=thin_right(), nf='$#,##0.00')
    sc(ws_inc, r, 5, f"=C{r}*12", F(C["mid_txt"]), fill=Fill(alt), align=thin_right(), nf='$#,##0.00')
    sc(ws_inc, r, 6, prio, F(C["mid_txt"]), fill=Fill(alt), align=thin_center())
    sc(ws_inc, r, 7, note, F(C["mid_txt"]), fill=Fill(alt), align=thin_left())

# Total row
tr = 4 + len(income_sources)
sc(ws_inc, tr, 1, None, fill=Fill(C["yellow"]), border=thin())
sc(ws_inc, tr, 2, "TOTAL INCOME", F(C["navy"], bold=True), fill=Fill(C["yellow"]), align=thin_left())
sc(ws_inc, tr, 3, f"=SUM(C4:C{tr-1})", F(C["navy"], bold=True), fill=Fill(C["yellow"]), align=thin_right(), nf='$#,##0.00')
sc(ws_inc, tr, 4, f"=SUM(D4:D{tr-1})", F(C["navy"], bold=True), fill=Fill(C["yellow"]), align=thin_right(), nf='$#,##0.00')
sc(ws_inc, tr, 5, f"=SUM(E4:E{tr-1})", F(C["navy"], bold=True), fill=Fill(C["yellow"]), align=thin_right(), nf='$#,##0.00')
for c in [1, 6, 7]:
    sc(ws_inc, tr, c, None, fill=Fill(C["yellow"]), border=thin())
ws_inc.row_dimensions[tr].height = 24


# ════════════════════════════════════════════════════════════════
#  SHEET 3 — EXPENSES
# ════════════════════════════════════════════════════════════════
ws_exp = wb.create_sheet("Expenses")
ws_exp.sheet_view.showGridLines = False

for i, w in enumerate([5, 26, 14, 14, 14, 12, 12, 20], 1):
    ws_exp.column_dimensions[get_column_letter(i)].width = w

merge_and_set(ws_exp, 1, 8, 1, "❌  MONTHLY EXPENSES",
              font=F(C["white"], bold=True, size=16),
              fill=Fill(C["red"]), align=thin_center())
ws_exp.row_dimensions[1].height = 36

exp_hdrs = ["#", "Expense Category", "Budgeted", "Actual Spent", "Difference", "% of Income", "Priority", "Notes"]
for ci, h in enumerate(exp_hdrs, 1):
    sc(ws_exp, 3, ci, h, F(C["white"], bold=True, size=10), fill=Fill(C["navy"]), align=thin_center())
ws_exp.row_dimensions[3].height = 22

expenses = [
    ("🏠 Rent / Mortgage",       "High",   "≤ 30%",  "Fixed cost"),
    ("⚡ Electricity",            "Medium", "", "Check bill"),
    ("💧 Water / Sewer",          "Medium", "", ""),
    ("🔥 Gas / Heating",          "Medium", "", ""),
    ("📱 Phone & Internet",       "Medium", "", "Bundle deals"),
    ("🛒 Groceries",              "High",   "≤ 15%", "Plan meals"),
    ("🍔 Dining Out",             "Low",    "≤ 5%",  "Limit频次"),
    ("🚗 Car Payment",            "High",   "", ""),
    ("⛽ Fuel / Transit",         "Medium", "", ""),
    ("🛡️ Insurance",              "High",   "", "Health/auto/renter's"),
    ("🏥 Medical",                 "Medium", "", ""),
    ("🎬 Entertainment",          "Low",    "≤ 5%", "Free activities"),
    ("👕 Shopping",               "Low",    "≤ 5%", "Wait 48hr rule"),
    ("📺 Subscriptions",          "Low",    "≤ 3%",  "Audit quarterly"),
    ("💰 Savings / Investments",  "High",   "≥ 20%","Pay yourself first"),
    ("💳 Debt Payments",          "High",   "", "Highest rate first"),
    ("🎁 Gifts / Donations",      "Low",    "", "Set annual limit"),
    ("📦 Miscellaneous",          "Low",    "", ""),
]

expense_colors = {
    "High": C["red"], "Medium": C["yellow"], "Low": C["green"]
}

for i, (name, prio, target, note) in enumerate(expenses):
    r = 4 + i
    alt = C["gray"] if i % 2 == 0 else C["white"]
    sc(ws_exp, r, 1, i+1, F(C["lt_txt"], size=10), fill=Fill(alt), align=thin_center())
    sc(ws_exp, r, 2, name, F(C["mid_txt"]), fill=Fill(alt), align=thin_left())
    sc(ws_exp, r, 3, 0, F(C["mid_txt"]), fill=Fill(alt), align=thin_right(), nf='$#,##0.00')
    sc(ws_exp, r, 4, 0, F(C["mid_txt"]), fill=Fill(alt), align=thin_right(), nf='$#,##0.00')
    sc(ws_exp, r, 5, f"=C{r}-D{r}", F(C["mid_txt"]), fill=Fill(alt), align=thin_right(), nf='$#,##0.00')
    sc(ws_exp, r, 6, f'=IF(Income!C{tr}=0,"—",ROUND(D{r}/Income!C{tr},2))',
       F(C["mid_txt"]), fill=Fill(alt), align=thin_center(), nf='0%')
    sc(ws_exp, r, 7, prio, F(C["mid_txt"]), fill=Fill(alt), align=thin_center())
    sc(ws_exp, r, 8, note, F(C["mid_txt"]), fill=Fill(alt), align=thin_left())

# Expense total
etr = 4 + len(expenses)
sc(ws_exp, etr, 1, None, fill=Fill(C["yellow"]), border=thin())
sc(ws_exp, etr, 2, "TOTAL EXPENSES", F(C["navy"], bold=True), fill=Fill(C["yellow"]), align=thin_left())
sc(ws_exp, etr, 3, f"=SUM(C4:C{etr-1})", F(C["navy"], bold=True), fill=Fill(C["yellow"]), align=thin_right(), nf='$#,##0.00')
sc(ws_exp, etr, 4, f"=SUM(D4:D{etr-1})", F(C["navy"], bold=True), fill=Fill(C["yellow"]), align=thin_right(), nf='$#,##0.00')
sc(ws_exp, etr, 5, f"=C{etr}-D{etr}", F(C["navy"], bold=True), fill=Fill(C["yellow"]), align=thin_right(), nf='$#,##0.00')
sc(ws_exp, etr, 6, f'=IF(Income!C{tr}=0,"—",ROUND(D{etr}/Income!C{tr},2))',
   F(C["navy"], bold=True), fill=Fill(C["yellow"]), align=thin_center(), nf='0%')
for c in [1, 7, 8]:
    sc(ws_exp, etr, c, None, fill=Fill(C["yellow"]), border=thin())
ws_exp.row_dimensions[etr].height = 24

# Conditional formatting on Difference column
diff_range = f"E4:E{etr-1}"
ws_exp.conditional_formatting.add(diff_range,
    FormulaRule(formula=[f'E{4}<0'], fill=Fill(C["red"]), font=F(C["white"], bold=True)))
ws_exp.conditional_formatting.add(diff_range,
    FormulaRule(formula=[f'E{4}>0'], fill=Fill(C["green"])))
ws_exp.conditional_formatting.add(diff_range,
    FormulaRule(formula=[f'E{4}=0'], fill=Fill(C["yellow"])))


# ════════════════════════════════════════════════════════════════
#  SHEET 4 — SPENDING LOG
# ════════════════════════════════════════════════════════════════
ws_log = wb.create_sheet("Spending Log")
ws_log.sheet_view.showGridLines = False

for i, w in enumerate([5, 14, 28, 16, 12, 14, 14, 10, 18], 1):
    ws_log.column_dimensions[get_column_letter(i)].width = w

merge_and_set(ws_log, 1, 9, 1, "📝  DAILY SPENDING LOG",
              font=F(C["white"], bold=True, size=16),
              fill=Fill(C["blue"]), align=thin_center())
ws_log.row_dimensions[1].height = 36

log_hdrs = ["#", "Date", "Description", "Category", "Amount ($)", "Payment", "Month", "Receipt?", "Notes"]
for ci, h in enumerate(log_hdrs, 1):
    sc(ws_log, 3, ci, h, F(C["white"], bold=True, size=10), fill=Fill(C["navy"]), align=thin_center())
ws_log.row_dimensions[3].height = 22

categories_list = ("Housing,Utilities,Groceries,Dining Out,Transportation,Insurance,Healthcare,Entertainment,Shopping,Subscriptions,Savings,Debt,Other")
dv_cat = DataValidation(type="list", formula1=f'"{categories_list}"', allow_blank=True)
dv_cat.error = "Select from list"; dv_cat.errorTitle = "Invalid Category"
ws_log.add_data_validation(dv_cat)

payment_list = '"Cash,Credit Card,Debit Card,Bank Transfer,Digital Wallet,Check,Other"'
dv_pay = DataValidation(type="list", formula1=payment_list, allow_blank=True)
ws_log.add_data_validation(dv_pay)

receipt_list = '"Yes,No,Pending"'
dv_rec = DataValidation(type="list", formula1=receipt_list, allow_blank=True)
ws_log.add_data_validation(dv_rec)

for r in range(4, 104):
    alt = C["gray"] if (r - 4) % 2 == 0 else C["white"]
    for c in range(1, 10):
        sc(ws_log, r, c, None, fill=Fill(alt), border=thin())
    ws_log[f'A{r}'] = r - 3
    sc(ws_log, r, 1, r-3, F(C["lt_txt"], size=10), fill=Fill(alt), align=thin_center())
    ws_log[f'B{r}'].number_format = 'MM/DD/YYYY'
    ws_log[f'E{r}'].number_format = '$#,##0.00'
    ws_log[f'G{r}'].number_format = 'MMMM YYYY'
    dv_cat.add(f'D{r}:D{103}')
    dv_pay.add(f'F{r}:F{103}')
    dv_rec.add(f'H{r}:H{103}')

# Summary row
lr = 104
merge_and_set(ws_log, 1, 9, lr,
              "TOTAL SPENT THIS YEAR: $0.00",
              font=F(C["white"], bold=True, size=12),
              fill=Fill(C["navy"]), align=thin_center())
ws_log.row_dimensions[lr].height = 26

ws_log['E104'] = "=SUM(E4:E103)"
ws_log['E104'].font = F(C["white"], bold=True, size=12)
ws_log['E104'].number_format = '$#,##0.00'
ws_log['E104'].alignment = thin_right()


# ════════════════════════════════════════════════════════════════
#  SHEET 5 — MONTHLY COMPARISON
# ════════════════════════════════════════════════════════════════
ws_mc = wb.create_sheet("Monthly Comparison")
ws_mc.sheet_view.showGridLines = False

months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

for i, w in enumerate([18] + [12]*13, 1):
    ws_mc.column_dimensions[get_column_letter(i)].width = w

merge_and_set(ws_mc, 1, 14, 1, "📅  12-MONTH BUDGET COMPARISON",
              font=F(C["white"], bold=True, size=16),
              fill=Fill(C["navy"]), align=thin_center())
ws_mc.row_dimensions[1].height = 36

mc_hdrs = ["Metric"] + months + ["Annual Total"]
for ci, h in enumerate(mc_hdrs, 1):
    sc(ws_mc, 3, ci, h, F(C["white"], bold=True, size=10), fill=Fill(C["navy"]), align=thin_center())
ws_mc.row_dimensions[3].height = 22

mc_rows = [
    ("Total Income",     "B",    inc_fill,    "$#,##0.00"),
    ("Total Expenses",   "C",    exp_fill,    "$#,##0.00"),
    ("Net Balance",      "D",    Fill(C["yellow"]), "$#,##0.00"),
    ("Savings Rate",     "E",    Fill(C["light"]), "0%"),
]
mc_formulas = [
    "=SUM(INCOME!C4:C10)",
    "=SUM(EXPENSES!C4:C19)",
    "=B{r}-C{r}",
    '=IF(B{r}=0,"—",ROUND((B{r}-C{r})/B{r},2))',
]

for mi, (mname, col_letter, mfill, fmt) in enumerate(mc_rows):
    r = 4 + mi
    ws_mc[f'A{r}'] = mname
    sc(ws_mc, r, 1, mname, F(C["navy"], bold=True), mfill, align=thin_left())
    for j in range(12):
        cl = get_column_letter(j + 2)
        if mi == 0:
            val = 0
        elif mi == 1:
            val = 0
        elif mi == 2:
            val = f"={cl}4-{cl}5"
        else:
            val = f'=IF({cl}4=0,"—",ROUND(({cl}4-{cl}5)/{cl}4,2))'
        sc(ws_mc, r, j+2, val, F(C["mid_txt"]), Fill(C["white"] if j%2==0 else C["gray"]),
           align=thin_right(), nf=fmt)
    # Annual total
    cl = get_column_letter(14)
    if mi == 0: at = f"=SUM(B4:L4)"
    elif mi == 1: at = f"=SUM(B5:L5)"
    elif mi == 2: at = f"=SUM(B6:L6)"
    else: at = f"=AVERAGE(B7:L7)"
    sc(ws_mc, r, 14, at, F(C["navy"], bold=True), Fill(C["yellow"]), align=thin_right(), nf=fmt)


# ════════════════════════════════════════════════════════════════
#  SHEET 6 — GOALS
# ════════════════════════════════════════════════════════════════
ws_goals = wb.create_sheet("Goals")
ws_goals.sheet_view.showGridLines = False

for i, w in enumerate([24, 14, 14, 14, 12, 12, 14, 24], 1):
    ws_goals.column_dimensions[get_column_letter(i)].width = w

merge_and_set(ws_goals, 1, 8, 1, "🎯  FINANCIAL GOALS",
              font=F(C["white"], bold=True, size=16),
              fill=Fill(C["purple"]), align=thin_center())
ws_goals.row_dimensions[1].height = 36

goal_hdrs = ["Goal Name", "Target Amount", "Current Savings", "Monthly Contribution",
             "Months to Goal", "% Complete", "Status", "Notes"]
for ci, h in enumerate(goal_hdrs, 1):
    sc(ws_goals, 3, ci, h, F(C["white"], bold=True, size=10), fill=Fill(C["navy"]), align=thin_center())
ws_goals.row_dimensions[3].height = 22

goals = [
    ("Emergency Fund (3-6 mo expenses)", 15000, 2000,  500, ""),
    ("Vacation Fund",                     5000,  800,  200, ""),
    ("New Car Down Payment",             10000, 3000,  400, ""),
    ("Home Down Payment",                80000, 15000, 2000, ""),
    ("Retirement (Roth IRA)",           150000, 25000, 3000, ""),
    ("Debt Freedom (all debts)",          50000,  5000, 1000, ""),
]
for i, (name, target, current, monthly, note) in enumerate(goals):
    r = 4 + i
    alt = C["gray"] if i % 2 == 0 else C["white"]
    sc(ws_goals, r, 1, name, F(C["mid_txt"]), fill=Fill(alt), align=thin_left())
    sc(ws_goals, r, 2, target, F(C["mid_txt"]), fill=Fill(alt), align=thin_right(), nf='$#,##0')
    sc(ws_goals, r, 3, current, F(C["mid_txt"]), fill=Fill(alt), align=thin_right(), nf='$#,##0')
    sc(ws_goals, r, 4, monthly, F(C["mid_txt"]), fill=Fill(alt), align=thin_right(), nf='$#,##0')
    sc(ws_goals, r, 5, f'=IF(D{r}=0,"—",ROUND(B{r}/D{r},1))', F(C["mid_txt"]),
       fill=Fill(alt), align=thin_center(), nf='0.0 mo')
    sc(ws_goals, r, 6, f'=IF(B{r}=0,"—",ROUND(C{r}/B{r},2))', F(C["mid_txt"]),
       fill=Fill(alt), align=thin_center(), nf='0%')
    sc(ws_goals, r, 7, f'=IF(C{r}>=B{r},"✅ Achieved","🔄 In Progress")',
       F(C["mid_txt"]), fill=Fill(alt), align=thin_center())
    sc(ws_goals, r, 8, note, F(C["mid_txt"]), fill=Fill(alt), align=thin_left())

# Conditional formatting for status
ws_goals.conditional_formatting.add('G4:G9',
    FormulaRule(formula=['G4="✅ Achieved"'], fill=Fill(C["green"])))
ws_goals.conditional_formatting.add('G4:G9',
    FormulaRule(formula=['G4="🔄 In Progress"'], fill=Fill(C["yellow"])))


# ════════════════════════════════════════════════════════════════
#  SHEET 7 — ANNUAL OVERVIEW (PIVOT-STYLE)
# ════════════════════════════════════════════════════════════════
ws_ann = wb.create_sheet("Annual Overview")
ws_ann.sheet_view.showGridLines = False

for i, w in enumerate([22, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14], 1):
    ws_ann.column_dimensions[get_column_letter(i)].width = w

merge_and_set(ws_ann, 1, 15, 1, "📊  ANNUAL BUDGET OVERVIEW",
              font=F(C["white"], bold=True, size=16),
              fill=Fill(C["navy"]), align=thin_center())
ws_ann.row_dimensions[1].height = 36

# Row labels
ann_labels = [
    "Income",
    "  Primary Salary",
    "  Freelance / Side Hustle",
    "  Investment Income",
    "  Other Income",
    "Total Income",
    "Expenses",
    "  Housing",
    "  Utilities",
    "  Groceries",
    "  Transportation",
    "  Entertainment",
    "  Savings",
    "  Debt Payments",
    "  Miscellaneous",
    "Total Expenses",
    "Net Balance",
    "Savings Rate",
]
for ci, h in enumerate(["Category"] + months + ["Annual", "Avg/Mo"], 1):
    sc(ws_ann, 3, ci, h, F(C["white"], bold=True, size=10), fill=Fill(C["navy"]), align=thin_center())
ws_ann.row_dimensions[3].height = 22

for i, label in enumerate(ann_labels):
    r = 4 + i
    is_total = label.startswith("Total") or label == "Net Balance" or label == "Savings Rate"
    is_section = label in ("Income", "Expenses")
    is_sub = label.startswith("  ")

    if is_total:
        bg = Fill(C["yellow"])
        fn = F(C["navy"], bold=True, size=11)
    elif is_section:
        bg = Fill(C["light"])
        fn = F(C["navy"], bold=True, size=11)
    elif is_sub:
        bg = Fill(C["gray"] if i % 2 == 0 else C["white"])
        fn = F(C["mid_txt"], size=10)
    else:
        bg = Fill(C["white"] if i % 2 == 0 else C["gray"])
        fn = F(C["mid_txt"], size=10)

    sc(ws_ann, r, 1, label.strip(), fn, bg, align=thin_left())
    for j in range(12):
        cl = get_column_letter(j + 2)
        sc(ws_ann, r, j+2, 0, fn, bg, align=thin_right(), nf='$#,##0')
    # Annual sum
    cl_sum = get_column_letter(14)
    cl_avg = get_column_letter(15)
    if label == "Total Income":
        sc(ws_ann, r, 14, f"=SUM(B4:N4)", fn, bg, align=thin_right(), nf='$#,##0')
        sc(ws_ann, r, 15, f"=O4/12", fn, bg, align=thin_right(), nf='$#,##0')
    elif label == "Total Expenses":
        sc(ws_ann, r, 14, f"=SUM(B9:N9)", fn, bg, align=thin_right(), nf='$#,##0')
        sc(ws_ann, r, 15, f"=O9/12", fn, bg, align=thin_right(), nf='$#,##0')
    elif label == "Net Balance":
        sc(ws_ann, r, 14, f"=O4-O9", fn, bg, align=thin_right(), nf='$#,##0')
        sc(ws_ann, r, 15, f"=(O4-O9)/12", fn, bg, align=thin_right(), nf='$#,##0')
    elif label == "Savings Rate":
        sc(ws_ann, r, 14, '=IF(O4=0,"—",ROUND((O4-O9)/O4,2))', fn, bg, align=thin_center(), nf='0%')
        sc(ws_ann, r, 15, '', fn, bg, align=thin_center())
    else:
        sc(ws_ann, r, 14, None, fn, bg, align=thin_right())
        sc(ws_ann, r, 15, None, fn, bg, align=thin_right())

    for c in range(1, 16):
        ws_ann.cell(row=r, column=c).border = thin()


# ════════════════════════════════════════════════════════════════
#  SHEET 8 — GUIDE
# ════════════════════════════════════════════════════════════════
ws_guide = wb.create_sheet("Guide")
ws_guide.sheet_view.showGridLines = False

merge_and_set(ws_guide, 1, 4, 1, "📘  HOW TO USE THIS BUDGET TRACKER",
              font=F(C["white"], bold=True, size=16),
              fill=Fill(C["navy"]), align=thin_center())
ws_guide.row_dimensions[1].height = 36

guide_content = [
    ("STEP 1:", "Go to the  Income  sheet and enter your monthly income sources.", C["green"]),
    ("STEP 2:", "Go to the  Expenses  sheet and set your budgeted amounts per category.", C["red"]),
    ("STEP 3:", "As you spend, log every transaction in the  Spending Log  sheet.", C["blue"]),
    ("STEP 4:", "Check the  Dashboard  for a real-time overview of your financial health.", C["yellow"]),
    ("STEP 5:", "Track your progress toward goals in the  Goals  sheet.", C["purple"]),
    ("", "", None),
    ("50/30/20 RULE:", "50% Needs · 30% Wants · 20% Savings & Debt Repayment", C["light"]),
    ("EMERGENCY FUND:", "Aim for 3–6 months of living expenses", C["light"]),
    ("SAVINGS RATE:", "At least 20% of take-home pay goes to savings/investing", C["light"]),
    ("DEBT PAYMENT:", "Use avalanche method: pay highest-interest debt first", C["light"]),
    ("", "", None),
    ("TIPS:", "", C["navy"]),
    ("•", "Review your budget weekly, not just monthly.", None),
    ("•", "Automate savings transfers on payday.", None),
    ("•", "Set up alerts for bills due dates.", None),
    ("•", "Use cash envelope system for discretionary spending.", None),
    ("•", "Celebrate small wins to stay motivated!", None),
]

for i, (label, desc, accent) in enumerate(guide_content):
    r = 3 + i
    if accent:
        bg = Fill(accent)
    else:
        bg = Fill(C["gray"] if i % 2 == 0 else C["white"])
    sc(ws_guide, r, 1, label, F(C["navy"], bold=True), bg, align=thin_left())
    sc(ws_guide, r, 2, desc, F(C["mid_txt"]), bg, align=thin_left())
    ws_guide.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
    for c in range(1, 5):
        ws_guide.cell(row=r, column=c).border = thin()
    ws_guide.row_dimensions[r].height = 20

ws_guide.column_dimensions['A'].width = 18
ws_guide.column_dimensions['B'].width = 60
ws_guide.column_dimensions['C'].width = 15
ws_guide.column_dimensions['D'].width = 15


# ════════════════════════════════════════════════════════════════
#  FREEZE PANES & PRINT SETTINGS
# ════════════════════════════════════════════════════════════════
ws.freeze_panes = 'A4'
ws_inc.freeze_panes = 'A4'
ws_exp.freeze_panes = 'A4'
ws_log.freeze_panes = 'A4'
ws_mc.freeze_panes = 'A4'
ws_goals.freeze_panes = 'A4'

out = "/mnt/data/Budget_Tracker.xlsx"
wb.save(out)
print(f"✅ Budget Tracker saved to {out}")
print("Sheets: Dashboard | Income | Expenses | Spending Log | Monthly Comparison | Goals | Annual Overview | Guide")