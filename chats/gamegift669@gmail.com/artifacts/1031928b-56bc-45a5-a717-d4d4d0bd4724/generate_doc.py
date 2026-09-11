from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import CellIsRule
import datetime

wb = Workbook()

# ── Colors & styles ──
C_DARK    = "1F4E79"
C_BLUE    = "2E75B6"
C_GREEN   = "70AD47"
C_RED     = "FF6B6B"
C_YELLOW  = "FFEB9C"
C_WHITE   = "FFFFFF"
C_LIGHT   = "DDEBF7"
C_ALTHE   = "F2F7FB"
C_GRAY    = "808080"
C_ORANGE  = "ED7D31"

hdr_fill = PatternFill("solid", fgColor=C_DARK)
inc_fill = PatternFill("solid", fgColor="C6EFCE")
exp_fill = PatternFill("solid", fgColor="FFC7CE")
fix_fill = PatternFill("solid", fgColor=C_YELLOW)
tot_fill = PatternFill("solid", fgColor=C_LIGHT)
alt_fill = PatternFill("solid", fgColor=C_ALTHE)
card_ok  = PatternFill("solid", fgColor=C_GREEN)
card_bad = PatternFill("solid", fgColor=C_RED)
card_mid = PatternFill("solid", fgColor="FFC000")

thin = Border(
    left=Side(style='thin'), right=Side(style='thin'),
    top=Side(style='thin'), bottom=Side(style='thin')
)
med  = Border(
    left=Side(style='medium'), right=Side(style='medium'),
    top=Side(style='medium'), bottom=Side(style='medium')
)

f_title = Font(bold=True, size=20, color=C_DARK)
f_sub   = Font(italic=True, size=10, color=C_GRAY)
f_hdr   = Font(bold=True, size=11, color=C_WHITE)
f_bold  = Font(bold=True, size=12, color=C_DARK)
f_big   = Font(bold=True, size=16, color=C_DARK)
f_cur   = Font(size=11)
f_ok    = Font(bold=True, size=13, color="FFFFFF")
f_red   = Font(bold=True, size=13, color=C_RED)
c_ctr   = Alignment(horizontal='center', vertical='center')
c_lft   = Alignment(horizontal='left',   vertical='center')


def set_hdr(ws, row, cols):
    for c in range(1, cols + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = hdr_fill; cell.font = f_hdr; cell.border = thin
        cell.alignment = c_ctr; cell.wrap_text = True


def set_row(ws, row, cols, alt=False):
    for c in range(1, cols + 1):
        cell = ws.cell(row=row, column=c)
        cell.border = thin; cell.alignment = c_ctr; cell.font = f_cur
        if alt: cell.fill = alt_fill


def num_fmt(cell):
    cell.number_format = '$#,##0.00'


# ═══════════════════════════════════════════════════════════════
# SHEET 1 — MONTHLY BUDGET
# ═══════════════════════════════════════════════════════════════
ws1 = wb.active
ws1.title = "Monthly Budget"
ws1.sheet_view.showGridLines = False

for w, col in zip([28, 12, 14, 14, 14, 12, 12, 22], range(1, 9)):
    ws1.column_dimensions[get_column_letter(col)].width = w

# Title block
ws1.merge_cells('A1:H1')
ws1['A1'] = "💰 Personal Budget Tracker"
ws1['A1'].font = f_title; ws1['A1'].alignment = c_ctr
ws1.row_dimensions[1].height = 34

ws1.merge_cells('A2:H2')
today = datetime.date.today().strftime('%B %Y')
ws1['A2'] = f"Budget Period: {today}  |  Green ✅ = on track  •  Red 🔴 = over budget"
ws1['A2'].font = f_sub; ws1['A2'].alignment = c_ctr

# Headers
headers = ['Category', 'Type', 'Planned', 'Actual Spent', 'Difference', 'Status', '% Used', 'Notes']
for i, h in enumerate(headers, 1):
    ws1.cell(row=4, column=i, value=h)
set_hdr(ws1, 4, len(headers))

# ── INCOME rows ───────────────────────────────────────────────
income = [
    ("Salary / Wages",       "Income"),
    ("Freelance / Side Hustle","Income"),
    ("Investment Returns",    "Income"),
    ("Gifts / Bonuses",       "Income"),
    ("Other Income",          "Income"),
]
r = 5; inc_start = r
for name, typ in income:
    ws1.cell(row=r, column=1, value=name)
    ws1.cell(row=r, column=2, value=typ); ws1.cell(row=r, column=2).fill = inc_fill
    ws1.cell(row=r, column=3, value=0); num_fmt(ws1.cell(row=r, column=3))
    ws1.cell(row=r, column=4, value=0); num_fmt(ws1.cell(row=r, column=4))
    ws1.cell(row=r, column=5, value=f'=C{r}-D{r}'); num_fmt(ws1.cell(row=r, column=5))
    ws1.cell(row=r, column=6, value=f'=IF(D{r}=0,"—",IF(C{r}>=D{r},"✅ OK","🔴 OVER"))')
    ws1.cell(row=r, column=7, value=f'=IF(C{r}=0,0,D{r}/C{r})'); ws1.cell(row=r, column=7).number_format = '0%'
    ws1.cell(row=r, column=8, value="")
    set_row(ws1, r, 8, alt=(r % 2 == 0))
    r += 1
inc_end = r - 1

# Income total
ws1.cell(row=r, column=1, value="TOTAL INCOME").font = f_bold
ws1.merge_cells(f'A{r}:B{r}')
ws1.cell(row=r, column=3, value=f'=SUM(C{inc_start}:C{inc_end})'); num_fmt(ws1.cell(row=r, column=3))
ws1.cell(row=r, column=4, value=f'=SUM(D{inc_start}:D{inc_end})'); num_fmt(ws1.cell(row=r, column=4))
ws1.cell(row=r, column=5, value=f'=C{r}-D{r}'); num_fmt(ws1.cell(row=r, column=5))
ws1.cell(row=r, column=6, value="Total"); ws1.cell(row=r, column=7, value=f'=IF(C{r}=0,0,D{r}/C{r})'); ws1.cell(row=r, column=7).number_format = '0%'
for c in range(1, 9):
    ws1.cell(row=r, column=c).border = med; ws1.cell(row=r, column=c).fill = tot_fill
    ws1.cell(row=r, column=c).font = f_bold
inc_tot = r
r += 2

# ── EXPENSE rows ──────────────────────────────────────────────
expenses = [
    # Fixed
    ("🏠 Rent / Mortgage",       "Fixed"),
    ("⚡ Electricity",            "Fixed"),
    ("💧 Water / Trash",         "Fixed"),
    ("🌐 Internet / Phone",      "Fixed"),
    ("🚗 Car Payment",           "Fixed"),
    ("🚗 Gas / Fuel",            "Fixed"),
    ("📦 Subscriptions",         "Fixed"),
    # Variable
    ("🛒 Groceries",             "Variable"),
    ("🍔 Dining Out",            "Variable"),
    ("🎬 Entertainment",         "Variable"),
    ("👕 Shopping",              "Variable"),
    ("💊 Healthcare",            "Variable"),
    ("📚 Education",             "Variable"),
    ("✈️ Travel",                "Variable"),
    ("🎁 Gifts / Donations",     "Variable"),
    ("🔧 Miscellaneous",         "Variable"),
]
r_exp_start = r
for name, typ in expenses:
    ws1.cell(row=r, column=1, value=name)
    ws1.cell(row=r, column=2, value=typ)
    if typ == "Fixed":
        ws1.cell(row=r, column=2).fill = fix_fill
    else:
        ws1.cell(row=r, column=2).fill = exp_fill
    ws1.cell(row=r, column=3, value=0); num_fmt(ws1.cell(row=r, column=3))
    ws1.cell(row=r, column=4, value=0); num_fmt(ws1.cell(row=r, column=4))
    ws1.cell(row=r, column=5, value=f'=C{r}-D{r}'); num_fmt(ws1.cell(row=r, column=5))
    ws1.cell(row=r, column=6, value=f'=IF(C{r}=0,"⚠️ No Plan",IF(D{r}>C{r},"🔴 OVER",IF(D{r}>0,"✅ OK","—")))')
    ws1.cell(row=r, column=7, value=f'=IF(C{r}=0,0,D{r}/C{r})'); ws1.cell(row=r, column=7).number_format = '0%'
    ws1.cell(row=r, column=8, value="")
    set_row(ws1, r, 8, alt=(r % 2 == 0))
    r += 1
r_exp_end = r - 1

# Expense total
ws1.cell(row=r, column=1, value="TOTAL EXPENSES").font = f_bold
ws1.merge_cells(f'A{r}:B{r}')
ws1.cell(row=r, column=3, value=f'=SUM(C{r_exp_start}:C{r_exp_end})'); num_fmt(ws1.cell(row=r, column=3))
ws1.cell(row=r, column=4, value=f'=SUM(D{r_exp_start}:D{r_exp_end})'); num_fmt(ws1.cell(row=r, column=4))
ws1.cell(row=r, column=5, value=f'=C{r}-D{r}'); num_fmt(ws1.cell(row=r, column=5))
ws1.cell(row=r, column=6, value="Total")
ws1.cell(row=r, column=7, value=f'=IF(C{inc_tot}=0,0,D{r}/C{inc_tot})'); ws1.cell(row=r, column=7).number_format = '0%'
for c in range(1, 9):
    ws1.cell(row=r, column=c).border = med; ws1.cell(row=r, column=c).fill = tot_fill
    ws1.cell(row=r, column=c).font = f_bold
exp_tot = r
r += 2

# ── SUMMARY BLOCK ─────────────────────────────────────────────
summary_items = [
    ("NET SAVINGS",
     f'=C{inc_tot}-D{exp_tot}',
     '$#,##0.00', card_ok),
    ("SAVINGS RATE",
     f'=IF(C{inc_tot}=0,0,(C{inc_tot}-D{exp_tot})/C{inc_tot})',
     '0.0%', card_mid),
    ("FIXED COSTS",
     f'=SUMIF(B{r_exp_start}:B{exp_tot-1},"Fixed",C{r_exp_start}:C{exp_tot-1})',
     '$#,##0.00', fix_fill),
    ("VARIABLE COSTS",
     f'=SUMIF(B{r_exp_start}:B{exp_tot-1},"Variable",C{r_exp_start}:C{exp_tot-1})',
     '$#,##0.00', exp_fill),
]
for label, formula, fmt, fill in summary_items:
    ws1.cell(row=r, column=1, value=label).font = f_bold
    ws1.merge_cells(f'A{r}:B{r}')
    c = ws1.cell(row=r, column=3, value=formula)
    c.number_format = fmt; c.font = Font(bold=True, size=14)
    c.fill = fill; c.border = med
    for col in range(1, 9):
        ws1.cell(row=r, column=col).border = thin
        if col not in (1, 2, 3): ws1.cell(row=r, column=col).fill = PatternFill("solid", fgColor="FFFFFF")
    r += 1

# Conditional formatting on Difference column
ws1.conditional_formatting.add(f'E{inc_start}:E{exp_tot}',
    CellIsRule(operator='lessThan', formula=['0'], fill=PatternFill("solid", fgColor=C_RED)))
ws1.conditional_formatting.add(f'E{inc_start}:E{exp_tot}',
    CellIsRule(operator='greaterThanOrEqual', formula=['0'], fill=PatternFill("solid", fgColor=C_GREEN)))


# ═══════════════════════════════════════════════════════════════
# SHEET 2 — TRANSACTION LOG
# ═══════════════════════════════════════════════════════════════
ws2 = wb.create_sheet("Transaction Log")
ws2.sheet_view.showGridLines = False

for w, col in zip([14, 26, 22, 10, 14, 16, 24], range(1, 8)):
    ws2.column_dimensions[get_column_letter(col)].width = w

ws2.merge_cells('A1:G1')
ws2['A1'] = "📋 Transaction Log — Log every purchase here"
ws2['A1'].font = f_title; ws2['A1'].alignment = c_ctr
ws2.row_dimensions[1].height = 30

txn_hdrs = ['Date', 'Description', 'Category', 'Type', 'Amount', 'Payment Method', 'Notes']
for i, h in enumerate(txn_hdrs, 1):
    ws2.cell(row=3, column=i, value=h)
set_hdr(ws2, 3, 7)

# Sample transactions
samples = [
    ("01/03/2026","Paycheck",             "Salary",     "Income",   4500.00, "Direct Deposit", ""),
    ("01/05/2026","Rent Payment",          "Rent / Mortgage","Expense",-1400.00,"Bank Transfer",  ""),
    ("01/07/2026","Whole Foods Market",    "Groceries",  "Expense",  -187.43, "Credit Card",    "Weekly grocery"),
    ("01/08/2026","Starbucks",             "Dining Out", "Expense",   -12.50, "Credit Card",    ""),
    ("01/10/2026","Netflix + Spotify",     "Subscriptions","Expense",  -27.97, "Credit Card",    ""),
    ("01/12/2026","Logo Design Project",   "Freelance",  "Income",    600.00, "PayPal",         ""),
    ("01/14/2026","Target — Clothes",      "Shopping",   "Expense",   -64.99, "Credit Card",    ""),
    ("01/15/2026","Electric Bill",         "Electricity","Expense", -123.00, "Auto-Pay",       ""),
    ("01/18/2026","Gas Station",           "Gas / Fuel", "Expense",   -55.00, "Debit Card",     ""),
    ("01/20/2026","Uber to Airport",       "Travel",     "Expense",   -34.50, "Credit Card",    ""),
]
last_r = 3
for s in samples:
    last_r += 1
    for col, val in enumerate(s, 1):
        cell = ws2.cell(row=last_r, column=col, value=val)
        cell.border = thin
        cell.alignment = c_ctr if col != 2 and col != 7 else c_lft
        if col == 5: num_fmt(cell); cell.font = f_cur
        if col == 1: cell.number_format = 'MM/DD/YYYY'
    if last_r % 2 == 0:
        for col in range(1, 8): ws2.cell(row=last_r, column=col).fill = alt_fill

# Blank entry rows
blank_start = last_r + 1
for i in range(30):
    rr = blank_start + i
    for col in range(1, 8):
        cell = ws2.cell(row=rr, column=col)
        cell.border = thin; cell.alignment = c_ctr
        if col == 5: num_fmt(cell); cell.font = f_cur
        if col == 1: cell.number_format = 'MM/DD/YYYY'
    if rr % 2 == 0:
        for col in range(1, 8): ws2.cell(row=rr, column=col).fill = alt_fill
data_end = blank_start + 29

# ── Transaction Summary ──
sr = data_end + 2
ws2.merge_cells(f'A{sr}:G{sr}')
ws2[f'A{sr}'] = "📊 Transaction Summary"
ws2[f'A{sr}'].font = f_bold; ws2[f'A{sr}'].alignment = c_ctr

summaries = [
    ("Total Income",     f'=SUMIF(D{blank_start}:D{data_end},"Income",E{blank_start}:E{data_end})'),
    ("Total Expenses",   f'=SUMIF(D{blank_start}:D{data_end},"Expense",E{blank_start}:E{data_end})'),
    ("Net Cash Flow",    f'=B{sr+1}+B{sr+2}'),
    ("Transactions",     f'=COUNTA(E{blank_start}:E{data_end})'),
]
for label, formula in summaries:
    ws2.cell(row=sr, column=1, value=label).font = f_bold
    ws2.merge_cells(f'A{sr}:D{sr}')
    c = ws2.cell(row=sr, column=5, value=formula)
    c.number_format = '$#,##0.00'; c.font = f_big; c.fill = tot_fill; c.border = med
    for col in range(1, 8):
        ws2.cell(row=sr, column=col).border = thin
        if col > 5: ws2.cell(row=sr, column=col).fill = PatternFill("solid", fgColor="FFFFFF")
    sr += 1


# ═══════════════════════════════════════════════════════════════
# SHEET 3 — DASHBOARD
# ═══════════════════════════════════════════════════════════════
ws3 = wb.create_sheet("Dashboard")
ws3.sheet_view.showGridLines = False

for w, col in zip([24, 18, 14, 24, 18, 14], range(1, 7)):
    ws3.column_dimensions[get_column_letter(col)].width = w

ws3.merge_cells('A1:F1')
ws3['A1'] = "📊 Budget Dashboard"
ws3['A1'].font = f_title; ws3['A1'].alignment = c_ctr
ws3.row_dimensions[1].height = 34

ws3.merge_cells('A2:F2')
ws3['A2'] = "Live data pulled from Monthly Budget & Transaction Log"
ws3['A2'].font = f_sub; ws3['A2'].alignment = c_ctr

# ── KPI CARDS ──
kpis = [
    ("Total\nIncome",       f"=Monthly Budget!C{inc_tot}",   '$#,##0.00',  "C6EFCE"),
    ("Total\nExpenses",     f"=Monthly Budget!C{exp_tot}",   '$#,##0.00',  "FFC7CE"),
    ("Net\nSavings",        f"=Monthly Budget!C{inc_tot+2}", '$#,##0.00',  "DDEBF7"),
    ("Savings\nRate",       f"=Monthly Budget!C{inc_tot+3}", '0.0%',      "70AD47"),
]
kr = 4
for label, formula, fmt, bg in kpis:
    ws3.merge_cells(f'A{kr}:C{kr}')
    c = ws3.cell(row=kr, column=1, value=label)
    c.font = Font(bold=True, size=11); c.fill = PatternFill("solid", fgColor=bg)
    c.alignment = c_ctr; c.border = thin
    for col in range(2, 4): ws3.cell(row=kr, column=col).fill = PatternFill("solid", fgColor=bg)
        ws3.cell(row=kr, column=col).border = thin
    v = ws3.cell(row=kr, column=4, value=formula)
    v.number_format = fmt; v.font = f_big; v.alignment = c_ctr
    v.fill = PatternFill("solid", fgColor="FFFFFF"); v.border = thin
    for col in [5, 6]:
        ws3.cell(row=kr, column=col).fill = PatternFill("solid", fgColor="FFFFFF")
        ws3.cell(row=kr, column=col).border = thin
    kr += 1

# ── BUDGET HEALTH ──
kr += 1
ws3.merge_cells(f'A{kr}:F{kr}')
ws3[f'A{kr}'] = "💡 Budget Health"
ws3[f'A{kr}'].font = f_bold; ws3[f'A{kr}'].alignment = c_ctr
kr += 1

health_items = [
    ("Fixed Costs vs Income", f'=Monthly Budget!C{inc_tot+4}/Monthly Budget!C{inc_tot}',  '0%'),
    ("Variable Costs",        f'=Monthly Budget!C{inc_tot+5}',                               '$#,##0.00'),
    ("Remaining Budget",      f'=Monthly Budget!C{inc_tot+2}',                               '$#,##0.00'),
]
for label, formula, fmt in health_items:
    ws3.cell(row=kr, column=1, value=label).font = Font(bold=True, size=11)
    ws3.merge_cells(f'A{kr}:C{kr}')
    c = ws3.cell(row=kr, column=4, value=formula)
    c.number_format = fmt; c.font = Font(bold=True, size=13)
    c.fill = tot_fill; c.border = thin
    for col in range(1, 7):
        ws3.cell(row=kr, column=col).border = thin
        if col not in (1, 4): ws3.cell(row=kr, column=col).fill = PatternFill("solid", fgColor="FFFFFF")
    kr += 1

# ── CATEGORY BREAKDOWN (from transaction log) ──
kr += 1
ws3.merge_cells(f'A{kr}:F{kr}')
ws3[f'A{kr}'] = "📈 Spending by Category (from Transactions)"
ws3[f'A{kr}'].font = f_bold; ws3[f'A{kr}'].alignment = c_ctr
kr += 1

cat_hdrs = ['Category', 'Spent', 'of Total', '', 'Avg/Day', 'Trend']
for i, h in enumerate(cat_hdrs, 1):
    c = ws3.cell(row=kr, column=i, value=h)
    c.fill = hdr_fill; c.font = f_hdr; c.border = thin; c.alignment = c_ctr
kr += 1

cats = ["Rent / Mortgage", "Groceries", "Dining Out", "Subscriptions",
        "Gas / Fuel", "Entertainment", "Shopping", "Healthcare"]
cat_s = kr
for cat in cats:
    ws3.cell(row=kr, column=1, value=cat).border = thin
    ws3.cell(row=kr, column=1).alignment = c_lft
    ws3.cell(row=kr, column=2, value=f'=IFERROR(SUMIFS(\'Transaction Log\'!E{blank_start}:E{data_end},\'Transaction Log\'!C{blank_start}:C{data_end},A{kr},\'Transaction Log\'!D{blank_start}:D{data_end},"Expense"),0)')
    ws3.cell(row=kr, column=2).number_format = '$#,##0.00'; ws3.cell(row=kr, column=2).border = thin
    ws3.cell(row=kr, column=3, value=f'=IF($B$15=0,0,B{kr}/-$B$15)')
    ws3.cell(row=kr, column=3).number_format = '0%'; ws3.cell(row=kr, column=3).border = thin
    ws3.cell(row=kr, column=4, value="")
    ws3.cell(row=kr, column=5, value=f'=IF(B{kr}=0,0,B{kr}/30)')
    ws3.cell(row=kr, column=5).number_format = '$#,##0.00'; ws3.cell(row=kr, column=5).border = thin
    ws3.cell(row=kr, column=6, value=f'=IF(B{kr}=0,"—",IF(B{kr}/30>50,"🔺 High",IF(B{kr}/30>20,"➡️ Medium","🔻 Low")))')
    ws3.cell(row=kr, column=6).border = thin
    if kr % 2 == 0:
        for col in range(1, 7): ws3.cell(row=kr, column=col).fill = alt_fill
    kr += 1

# Totals row
ws3.cell(row=kr, column=1, value="TOTAL").font = f_bold
ws3.cell(row=kr, column=2, value=f'=SUM(B{cat_s}:B{kr-1})').number_format = '$#,##0.00'; ws3.cell(row=kr, column=2).font = f_bold
ws3.cell(row=kr, column=3, value='100%').number_format = '0%'; ws3.cell(row=kr, column=3).font = f_bold
ws3.cell(row=kr, column=5, value=f'=SUM(E{cat_s}:E{kr-1})').number_format = '$#,##0.00'; ws3.cell(row=kr, column=5).font = f_bold
for col in range(1, 7):
    ws3.cell(row=kr, column=col).border = med; ws3.cell(row=kr, column=col).fill = tot_fill
kr += 2

# Tips box
ws3.merge_cells(f'A{kr}:F{kr}')
ws3[f'A{kr}'] = "💡 Tips: Set your Planned amounts in the Monthly Budget sheet → Track spending in Transaction Log → Watch your Dashboard update automatically!"
ws3[f'A{kr}'].font = Font(italic=True, size=10, color=C_GRAY)
ws3[f'A{kr}'].alignment = c_ctr

# ═══════════════════════════════════════════════════════════════
# Save
# ═══════════════════════════════════════════════════════════════
wb.save("budget_tracker.xlsx")
print("✅ budget_tracker.xlsx created successfully!")