import openpyxl
from openpyxl import Workbook
from openpyxl.styles import (
    Font, PatternFill, Alignment, Border, Side, GradientFill
)
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import (
    CellIsRule, FormulaRule, ColorScaleRule, DataBarRule
)
from openpyxl.worksheet.datavalidation import DataValidation
from datetime import datetime

wb = Workbook()

# ── Color palette ──────────────────────────────────────────────
CLR_DARK      = "1A1A2E"
CLR_ACCENT    = "0F3460"
CLR_HIGHLIGHT = "E94560"
CLR_WHITE     = "FFFFFF"
CLR_LIGHT     = "F5F5F5"
CLR_SUCCESS   = "00B894"
CLR_WARNING   = "FDCB6E"
CLR_DANGER    = "E17055"
CLR_BLUE      = "0984E3"
CLR_PURPLE    = "6C5CE7"
CLR_GRAY      = "636E72"
CLR_BG_ALT    = "DFE6E9"
CLR_INPUT_BG  = "FEFEFE"

thin = Side(style="thin", color="CCCCCC")
medium = Side(style="medium", color="0F3460")
border_thin = Border(left=thin, right=thin, top=thin, bottom=thin)
border_medium = Border(left=medium, right=medium, top=medium, bottom=medium)

def hdr_font(size=11, bold=True, color=CLR_WHITE):
    return Font(name="Calibri", size=size, bold=bold, color=color)

def body_font(size=11, bold=False, color="000000"):
    return Font(name="Calibri", size=size, bold=bold, color=color)

def fill(hex_color):
    return PatternFill("solid", fgColor=hex_color)

def center(alignment="center"):
    return Alignment(horizontal=alignment, vertical="center", wrap_text=True)

def right_align():
    return Alignment(horizontal="right", vertical="center")

# ═══════════════════════════════════════════════════════════════
#  SHEET 1 – Dashboard
# ═══════════════════════════════════════════════════════════════
ws = wb.active
ws.title = "Dashboard"

# Column widths
ws.column_dimensions["A"].width = 3
ws.column_dimensions["B"].width = 28
ws.column_dimensions["C"].width = 18
ws.column_dimensions["D"].width = 18
ws.column_dimensions["E"].width = 18
ws.column_dimensions["F"].width = 18
ws.column_dimensions["G"].width = 18
ws.column_dimensions["H"].width = 30
ws.column_dimensions["I"].width = 18
ws.column_dimensions["J"].width = 18

# ── Title block ──
ws.merge_cells("B2:J2")
c = ws["B2"]
c.value = "💰  BUDGET TRACKER"
c.font = Font(name="Calibri", size=28, bold=True, color=CLR_WHITE)
c.fill = fill(CLR_DARK)
c.alignment = center()
c.border = border_medium
ws.row_dimensions[2].height = 50

ws.merge_cells("B3:J3")
c = ws["B3"]
c.value = f"Year: {datetime.now().year}  •  Powered by Agnes AI"
c.font = Font(name="Calibri", size=11, color="AAAAAA")
c.fill = fill(CLR_ACCENT)
c.alignment = center()
ws.row_dimensions[3].height = 20

# ── Section: Summary KPIs ──
section_fills = {
    "B": fill(CLR_ACCENT), "C": fill(CLR_SUCCESS),
    "D": fill(CLR_HIGHLIGHT), "E": fill(CLR_PURPLE),
    "F": fill(CLR_BLUE),  "G": fill(CLR_WARNING),
}
section_fonts = {
    "B": Font(name="Calibri", size=10, bold=True, color="AAAAAA"),
    "C": Font(name="Calibri", size=10, bold=True, color="FFFFFF"),
    "D": Font(name="Calibri", size=10, bold=True, color="FFFFFF"),
    "E": Font(name="Calibri", size=10, bold=True, color="FFFFFF"),
    "F": Font(name="Calibri", size=10, bold=True, color="FFFFFF"),
    "G": Font(name="Calibri", size=10, bold=True, color="000000"),
}
kpi_labels = {
    "B": "Total Income",   "C": "Total Expenses",
    "D": "Net Balance",    "E": "Savings Rate",
    "F": "Top Category",   "G": "⚠ Over Budget",
}
for col, label in kpi_labels.items():
    cell = ws[f"{col}4"]
    cell.value = label
    cell.font = section_fonts[col]
    cell.fill = section_fills[col]
    cell.alignment = center()
    cell.border = border_thin
    ws.row_dimensions[4].height = 22

# KPI values (formulas referencing Transactions sheet)
ws["B5"] = '=SUMIF(Transactions!$E:$E,"Income",Transactions!$H:$H)'
ws["C5"] = '=ABS(SUMIF(Transactions!$E:$E,"Expense",Transactions!$H:$H))'
ws["D5"] = '=B5-C5'
ws["E5"] = '=IF(B5>0,D5/B5,0)'
ws["F5"] = "=INDEX(Categories!$A$2:$A$15,MODE(INDEX(MATCH(Categories!$A$2:$A$15,Transactions!$F:$F,0),0)))"
ws["F5"].value = "=IFERROR(INDEX(Categories!$A$2:$A$15,MATCH(MAX(COUNTIF(Transactions!$F:$F,Categories!$A$2:$A$15)),COUNTIF(Transactions!$F:$F,Categories!$A$2:$A$15),0)),'N/A')"
ws["G5"] = '=COUNTIF(Transactions!$E:$E,"Over Budget")'
for col in ["B","C","D","E","F","G"]:
    cell = ws[f"{col}5"]
    cell.font = Font(name="Calibri", size=18, bold=True, color=CLR_WHITE if col != "G" else "000000")
    cell.fill = section_fills[col]
    cell.alignment = center()
    cell.border = border_thin
    if col in ("B","C","D","E"):
        cell.number_format = '#,##0.00'
    elif col == "E":
        cell.number_format = '0%'
ws.row_dimensions[5].height = 40

# ── Budget Overview Table ──
ws.merge_cells("B7:G7")
title_cell = ws["B7"]
title_cell.value = "📋  Budget vs Actuals"
title_cell.font = Font(name="Calibri", size=14, bold=True, color=CLR_DARK)
title_cell.fill = fill(CLR_LIGHT)
title_cell.alignment = center()
ws.row_dimensions[7].height = 28

headers_6 = ["Category", "Budgeted", "Actual", "Difference", "Status", "% Used"]
header_fills = [fill(CLR_ACCENT)]*6
header_fonts = [Font(name="Calibri", size=11, bold=True, color=CLR_WHITE)]*6
for i, h in enumerate(headers_6, start=2):
    cell = ws.cell(row=8, column=i, value=h)
    cell.font = header_fonts[i-2]
    cell.fill = header_fills[i-2]
    cell.alignment = center()
    cell.border = border_thin
ws.row_dimensions[8].height = 24

categories = ["Housing","Utilities","Groceries","Transportation","Dining Out",
              "Entertainment","Healthcare","Shopping","Savings","Subscriptions",
              "Insurance","Other"]
bg_colors = [
    fill(CLR_INPUT_BG), fill(CLR_BG_ALT), fill(CLR_INPUT_BG), fill(CLR_BG_ALT),
    fill(CLR_INPUT_BG), fill(CLR_BG_ALT), fill(CLR_INPUT_BG), fill(CLR_BG_ALT),
    fill(CLR_INPUT_BG), fill(CLR_BG_ALT), fill(CLR_INPUT_BG), fill(CLR_BG_ALT),
]
budget_values = [1500, 200, 600, 300, 250, 150, 200, 300, 500, 50, 150, 200]

for row_idx, (cat, bg, bv) in enumerate(zip(categories, bg_colors, budget_values), start=9):
    r = row_idx
    ws.cell(row=r, column=2, value=cat).font = body_font(bold=True)
    ws.cell(row=r, column=2).fill = bg
    ws.cell(row=r, column=2).alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.cell(row=r, column=2).border = border_thin

    # Budgeted (editable)
    c = ws.cell(row=r, column=3, value=bv)
    c.font = body_font()
    c.fill = bg
    c.alignment = right_align()
    c.border = border_thin
    c.number_format = '#,##0.00'

    # Actual (formula)
    c = ws.cell(row=r, column=4)
    c.value = f'=SUMIFS(Transactions!$H:$H,Transactions!$F:$F,A{r},Transactions!$E:$E,"Expense")'
    c.font = body_font()
    c.fill = bg
    c.alignment = right_align()
    c.border = border_thin
    c.number_format = '#,##0.00'

    # Difference
    c = ws.cell(row=r, column=5)
    c.value = f'=C{r}-D{r}'
    c.font = body_font(bold=True)
    c.fill = bg
    c.alignment = right_align()
    c.border = border_thin
    c.number_format = '#,##0.00'

    # Status (formula)
    c = ws.cell(row=r, column=6)
    c.value = f'=IF(D{r}=0,"✓ On Track",IF(E{r}<0,"⚠ Over Budget","✓ Good"))'
    c.font = body_font(bold=True)
    c.fill = bg
    c.alignment = center()
    c.border = border_thin

    # % Used
    c = ws.cell(row=r, column=7)
    c.value = f'=IF(C{r}=0,0,D{r}/C{r})'
    c.font = body_font()
    c.fill = bg
    c.alignment = center()
    c.border = border_thin
    c.number_format = '0%'

for r in range(9, 21):
    ws.row_dimensions[r].height = 22
    for col in range(2, 8):
        ws.cell(row=r, column=col).border = border_thin

# Conditional formatting for % Used column (color scale)
ws.conditional_formatting.add(
    f'G9:G20',
    ColorScaleRule(start_type='min', start_color='00B894',
                   mid_type='percentile', mid_value=50, mid_color='FDCB6E',
                   end_type='max', end_color='E17055')
)

# Data bars on difference column
ws.conditional_formatting.add(
    f'E9:E20',
    DataBarRule(start_type='num', start_value=-1000,
                end_type='num', end_value=1000,
                color="63B3ED")
)

# ── Spending Breakdown ──
ws.merge_cells("B23:G23")
t = ws["B23"]
t.value = "📊  Spending by Category"
t.font = Font(name="Calibri", size=14, bold=True, color=CLR_DARK)
t.fill = fill(CLR_LIGHT)
t.alignment = center()
ws.row_dimensions[23].height = 28

for i, h in enumerate(["Category", "Amount", "% of Total"], start=2):
    c = ws.cell(row=24, column=i, value=h)
    c.font = Font(name="Calibri", size=11, bold=True, color=CLR_WHITE)
    c.fill = fill(CLR_ACCENT)
    c.alignment = center()
    c.border = border_thin

start_row = 25
for i, cat in enumerate(categories):
    r = start_row + i
    bg = fill(CLR_INPUT_BG) if i % 2 == 0 else fill(CLR_BG_ALT)
    ws.cell(row=r, column=2, value=cat).font = body_font(bold=True)
    ws.cell(row=r, column=2).fill = bg
    ws.cell(row=r, column=2).alignment = Alignment(horizontal="left", indent=1)
    ws.cell(row=r, column=2).border = border_thin

    c = ws.cell(row=r, column=3)
    c.value = f'=SUMIFS(Transactions!$H:$H,Transactions!$F:$F,A{r},Transactions!$E:$E,"Expense")'
    c.font = body_font()
    c.fill = bg
    c.alignment = right_align()
    c.border = border_thin
    c.number_format = '#,##0.00'

    c = ws.cell(row=r, column=4)
    c.value = f'=IF($C$5=0,0,C{r}/-$C$5)'
    c.font = body_font()
    c.fill = bg
    c.alignment = center()
    c.border = border_thin
    c.number_format = '0%'
    ws.row_dimensions[r].height = 20

# Conditional formatting on spending breakdown %
ws.conditional_formatting.add(
    f'D25:D36',
    ColorScaleRule(start_type='min', start_color='00B894',
                   mid_type='percentile', mid_value=50, mid_color='FDCB6E',
                   end_type='max', end_color='E17055')
)

# ── Quick Add Form ──
ws.merge_cells("B38:G38")
t = ws["B38"]
t.value = "➕  Quick Add Transaction"
t.font = Font(name="Calibri", size=14, bold=True, color=CLR_DARK)
t.fill = fill(CLR_LIGHT)
t.alignment = center()
ws.row_dimensions[38].height = 28

form_headers = ["Date", "Description", "Type", "Category", "Amount", "Notes"]
form_bg = fill(CLR_ACCENT)
for i, h in enumerate(form_headers, start=2):
    c = ws.cell(row=39, column=i, value=h)
    c.font = Font(name="Calibri", size=10, bold=True, color=CLR_WHITE)
    c.fill = form_bg
    c.alignment = center()
    c.border = border_thin

# Example row
ex_row = 40
date_val = datetime.now().strftime("%Y-%m-%d")
examples = [
    (date_val, "Rent Payment", "Expense", "Housing", 1500, "Monthly rent"),
    (date_val, "Salary Deposit", "Income", "Salary", 4500, ""),
    (date_val, "Whole Foods", "Expense", "Groceries", 87.50, "Weekly groceries"),
    (date_val, "Netflix", "Expense", "Subscriptions", 15.99, "Monthly"),
]
for idx, (dt, desc, typ, cat, amt, notes) in enumerate(examples):
    r = ex_row + idx
    bg = fill(CLR_INPUT_BG) if idx % 2 == 0 else fill(CLR_BG_ALT)
    vals = [dt, desc, typ, cat, amt, notes]
    for ci, v in enumerate(vals, start=2):
        c = ws.cell(row=r, column=ci, value=v)
        c.fill = bg
        c.border = border_thin
        if ci == 5:
            c.number_format = '#,##0.00'
            c.alignment = right_align()
        elif ci == 2:
            c.alignment = center()
        else:
            c.alignment = Alignment(horizontal="left", indent=1)
    ws.row_dimensions[r].height = 20

# ── Navigation Hint ──
ws.merge_cells("B46:G46")
hint = ws["B46"]
hint.value = "💡  Go to the \"Transactions\" sheet to add your own transactions. Use the \"Categories\" sheet to manage categories."
hint.font = Font(name="Calibri", size=10, color=CLR_GRAY, italic=True)
hint.alignment = center()


# ═══════════════════════════════════════════════════════════════
#  SHEET 2 – Transactions
# ═══════════════════════════════════════════════════════════════
ws2 = wb.create_sheet("Transactions")

ws2.column_dimensions["A"].width = 3
ws2.column_dimensions["B"].width = 14
ws2.column_dimensions["C"].width = 30
ws2.column_dimensions["D"].width = 14
ws2.column_dimensions["E"].width = 16
ws2.column_dimensions["F"].width = 18
ws2.column_dimensions["G"].width = 18
ws2.column_dimensions["H"].width = 25
ws2.column_dimensions["I"].width = 3

# Title
ws2.merge_cells("B2:I2")
c = ws2["B2"]
c.value = "📒  All Transactions"
c.font = Font(name="Calibri", size=20, bold=True, color=CLR_WHITE)
c.fill = fill(CLR_DARK)
c.alignment = center()
c.border = border_medium
ws2.row_dimensions[2].height = 42

# Headers
tx_headers = ["#", "Date", "Description", "Type", "Category", "Amount", "Balance", "Notes"]
for i, h in enumerate(tx_headers, start=2):
    c = ws2.cell(row=3, column=i, value=h)
    c.font = Font(name="Calibri", size=11, bold=True, color=CLR_WHITE)
    c.fill = fill(CLR_ACCENT)
    c.alignment = center()
    c.border = border_thin
ws2.row_dimensions[3].height = 24

# Pre-populate some sample transactions
samples = [
    ("2025-01-02", "Salary Deposit",       "Income",   "Salary",       4500.00, ""),
    ("2025-01-03", "Rent Payment",          "Expense",  "Housing",    -1500.00,"Monthly"),
    ("2025-01-05", "Whole Foods Market",    "Expense",  "Groceries",   -87.50, "Weekly shop"),
    ("2025-01-07", "Electric Bill",         "Expense",  "Utilities",   -120.00,"Jan"),
    ("2025-01-10", "Uber Ride",             "Expense",  "Transportation",-24.50,""),
    ("2025-01-12", "Netflix Subscription",  "Expense",  "Subscriptions",-15.99,"Monthly"),
    ("2025-01-14", "Freelance Project",     "Income",   "Side Hustle",  800.00,"Logo design"),
    ("2025-01-15", "Target Purchase",       "Expense",  "Shopping",    -67.30,"Household"),
    ("2025-01-18", "Restaurant - Thai",     "Expense",  "Dining Out",  -45.00,"Date night"),
    ("2025-01-20", "Gym Membership",        "Expense",  "Healthcare",  -30.00,"Monthly"),
    ("2025-01-22", "Phone Bill",            "Expense",  "Utilities",   -65.00,""),
    ("2025-01-25", "Dividend Income",       "Income",   "Investments",  45.00,"AAPL"),
    ("2025-01-28", "Amazon Purchase",       "Expense",  "Shopping",    -129.99,"Headphones"),
    ("2025-02-01", "Salary Deposit",        "Income",   "Salary",       4500.00,""),
    ("2025-02-03", "Rent Payment",          "Expense",  "Housing",    -1500.00,"Monthly"),
    ("2025-02-05", "Trader Joe's",          "Expense",  "Groceries",   -94.20,""),
    ("2025-02-08", "Gas Station",           "Expense",  "Transportation",-42.00,""),
    ("2025-02-10", "Spotify",               "Expense",  "Subscriptions",-10.99,"Monthly"),
    ("2025-02-14", "Restaurant - Italian",  "Expense",  "Dining Out",  -89.00,"Valentine's"),
    ("2025-02-15", "Pharmacy",              "Expense",  "Healthcare",  -18.50,""),
]

prev_balance = 0
for i, (dt, desc, typ, cat, amt, notes) in enumerate(samples):
    r = 4 + i
    bg = fill(CLR_INPUT_BG) if i % 2 == 0 else fill(CLR_BG_ALT)

    ws2.cell(row=r, column=2, value=dt).font = body_font()
    ws2.cell(row=r, column=2).fill = bg
    ws2.cell(row=r, column=2).alignment = center()
    ws2.cell(row=r, column=2).border = border_thin
    ws2.cell(row=r, column=2).number_format = "YYYY-MM-DD"

    ws2.cell(row=r, column=3, value=desc).font = body_font()
    ws2.cell(row=r, column=3).fill = bg
    ws2.cell(row=r, column=3).alignment = Alignment(horizontal="left", indent=1)
    ws2.cell(row=r, column=3).border = border_thin

    c = ws2.cell(row=r, column=4, value=typ)
    c.font = body_font(bold=True)
    c.fill = bg
    c.alignment = center()
    c.border = border_thin
    if typ == "Income":
        c.font = Font(name="Calibri", size=11, bold=True, color=CLR_SUCCESS)
    else:
        c.font = Font(name="Calibri", size=11, bold=True, color=CLR_HIGHLIGHT)

    ws2.cell(row=r, column=5, value=cat).font = body_font()
    ws2.cell(row=r, column=5).fill = bg
    ws2.cell(row=r, column=5).alignment = center()
    ws2.cell(row=r, column=5).border = border_thin

    c = ws2.cell(row=r, column=6, value=amt)
    c.font = body_font(bold=True)
    c.fill = bg
    c.alignment = right_align()
    c.border = border_thin
    c.number_format = '#,##0.00;(#,##0.00)'
    if amt > 0:
        c.font = Font(name="Calibri", size=11, bold=True, color=CLR_SUCCESS)
    else:
        c.font = Font(name="Calibri", size=11, bold=True, color=CLR_HIGHLIGHT)

    # Running balance formula
    c = ws2.cell(row=r, column=7)
    if r == 4:
        c.value = amt
    else:
        c.value = f'=G{r-1}+F{r}'
    c.font = body_font(bold=True)
    c.fill = bg
    c.alignment = right_align()
    c.border = border_thin
    c.number_format = '#,##0.00;(#,##0.00)'
    if c.value > 0 or (isinstance(c.value, str) and c.value.startswith('=') and float(c.value.lstrip('=').split('+')[-1].replace(',','')) > 0):
        pass  # will be colored by conditional formatting
    prev_balance += amt

    ws2.cell(row=r, column=8, value=notes).font = body_font(color=CLR_GRAY)
    ws2.cell(row=r, column=8).fill = bg
    ws2.cell(row=r, column=8).alignment = Alignment(horizontal="left", indent=1)
    ws2.cell(row=r, column=8).border = border_thin

    ws2.row_dimensions[r].height = 20

# Conditional formatting: positive = green, negative = red
ws2.conditional_formatting.add(
    "F4:F103",
    CellIsRule(operator='greaterThan', formula=[0],
               fill=PatternFill("solid", fgColor="C8F7C5"), font=Font(color="00B894", bold=True))
)
ws2.conditional_formatting.add(
    "F4:F103",
    CellIsRule(operator='lessThan', formula=[0],
               fill=PatternFill("solid", fgColor="FFE0DD"), font=Font(color="E17055", bold=True))
)

# Running balance color
ws2.conditional_formatting.add(
    "G4:G103",
    CellIsRule(operator='lessThan', formula=[0],
               fill=PatternFill("solid", fgColor="FFE0DD"), font=Font(color="E17055", bold=True))
)

# Type filter dropdown
dv_type = DataValidation(type="list", formula1='"Income,Expense"', allow_blank=True)
dv_type.error = "Please select Income or Expense"
dv_type.errorTitle = "Invalid Type"
ws2.add_data_validation(dv_type)
dv_type.add('D4:D103')

# Category dropdown
dv_cat = DataValidation(type="list", formula1='"Housing,Utilities,Groceries,Transportation,Dining Out,Entertainment,Healthcare,Shopping,Savings,Subscriptions,Insurance,Other,Salary,Side Hustle,Investments"', allow_blank=True)
ws2.add_data_validation(dv_cat)
dv_cat.add('E4:E103')

# Auto-expand note for new rows
for r in range(4 + len(samples), 104):
    for col in range(2, 9):
        c = ws2.cell(row=r, column=col)
        c.border = border_thin
        c.fill = fill(CLR_INPUT_BG)


# ═══════════════════════════════════════════════════════════════
#  SHEET 3 – Categories
# ═══════════════════════════════════════════════════════════════
ws3 = wb.create_sheet("Categories")

ws3.column_dimensions["A"].width = 3
ws3.column_dimensions["B"].width = 22
ws3.column_dimensions["C"].width = 14
ws3.column_dimensions["D"].width = 14
ws3.column_dimensions["E"].width = 14
ws3.column_dimensions["F"].width = 30

# Title
ws3.merge_cells("B2:F2")
c = ws3["B2"]
c.value = "📂  Category Manager"
c.font = Font(name="Calibri", size=20, bold=True, color=CLR_WHITE)
c.fill = fill(CLR_DARK)
c.alignment = center()
c.border = border_medium
ws3.row_dimensions[2].height = 42

cats_headers = ["Category", "Type", "Budget", "Spent", "% Used", "Status"]
for i, h in enumerate(cats_headers, start=2):
    c = ws3.cell(row=3, column=i, value=h)
    c.font = Font(name="Calibri", size=11, bold=True, color=CLR_WHITE)
    c.fill = fill(CLR_ACCENT)
    c.alignment = center()
    c.border = border_thin
ws3.row_dimensions[3].height = 24

cat_data = [
    ("Housing",         "Expense", 1500, "", "", ""),
    ("Utilities",       "Expense",  200, "", "", ""),
    ("Groceries",       "Expense",  600, "", "", ""),
    ("Transportation",  "Expense",  300, "", "", ""),
    ("Dining Out",      "Expense",  250, "", "", ""),
    ("Entertainment",   "Expense",  150, "", "", ""),
    ("Healthcare",      "Expense",  200, "", "", ""),
    ("Shopping",        "Expense",  300, "", "", ""),
    ("Savings",         "Expense",  500, "", "", ""),
    ("Subscriptions",   "Expense",   50, "", "", ""),
    ("Insurance",       "Expense",  150, "", "", ""),
    ("Other",           "Expense",  200, "", "", ""),
    ("Salary",          "Income",    0, "", "", ""),
    ("Side Hustle",     "Income",    0, "", "", ""),
    ("Investments",     "Income",    0, "", "", ""),
]

cat_fills = [
    fill(CLR_INPUT_BG), fill(CLR_BG_ALT), fill(CLR_INPUT_BG), fill(CLR_BG_ALT),
    fill(CLR_INPUT_BG), fill(CLR_BG_ALT), fill(CLR_INPUT_BG), fill(CLR_BG_ALT),
    fill(CLR_INPUT_BG), fill(CLR_BG_ALT), fill(CLR_INPUT_BG), fill(CLR_BG_ALT),
    fill("E8F8F5"), fill("E8F8F5"), fill("E8F8F5"),
]

for i, (name, typ, budget, _, _, _) in enumerate(cat_data):
    r = 4 + i
    bg = cat_fills[i]

    ws3.cell(row=r, column=2, value=name).font = Font(name="Calibri", size=11, bold=True)
    ws3.cell(row=r, column=2).fill = bg
    ws3.cell(row=r, column=2).alignment = Alignment(horizontal="left", indent=1)
    ws3.cell(row=r, column=2).border = border_thin

    c = ws3.cell(row=r, column=3, value=typ)
    c.font = body_font(bold=True,
                       color=CLR_SUCCESS if typ=="Income" else CLR_HIGHLIGHT)
    c.fill = bg
    c.alignment = center()
    c.border = border_thin

    c = ws3.cell(row=r, column=4, value=budget if budget > 0 else None)
    c.font = body_font()
    c.fill = bg
    c.alignment = right_align()
    c.border = border_thin
    c.number_format = '#,##0.00'

    # Spent formula
    c = ws3.cell(row=r, column=5)
    c.value = f'=SUMIFS(Transactions!$H:$H,Transactions!$F:$F,A{r},Transactions!$E:$E,"Expense")'
    c.font = body_font(bold=True)
    c.fill = bg
    c.alignment = right_align()
    c.border = border_thin
    c.number_format = '#,##0.00;(#,##0.00)'

    # % Used
    c = ws3.cell(row=r, column=6)
    c.value = f'=IF(D{r}>0,E{r}/D{r},0)'
    c.font = body_font()
    c.fill = bg
    c.alignment = center()
    c.border = border_thin
    c.number_format = '0%'

    # Status
    c = ws3.cell(row=r, column=7)
    c.value = f'=IF(D{r}=0,"No Budget","")'
    c.font = body_font(bold=True)
    c.fill = bg
    c.alignment = center()
    c.border = border_thin

    ws3.row_dimensions[r].height = 22

# Conditional formatting for percentage used
ws3.conditional_formatting.add(
    "F4:F18",
    ColorScaleRule(start_type='min', start_color='00B894',
                   mid_type='percentile', mid_value=50, mid_color='FDCB6E',
                   end_type='max', end_color='E17055')
)

# Data bar on spent
ws3.conditional_formatting.add(
    "E4:E18",
    DataBarRule(start_type='num', start_value=0,
                end_type='num', end_value=2000, color="63B3ED")
)

# Category dropdown validation
dv_cat2 = DataValidation(type="list", formula1='"Housing,Utilities,Groceries,Transportation,Dining Out,Entertainment,Healthcare,Shopping,Savings,Subscriptions,Insurance,Other,Salary,Side Hustle,Investments"', allow_blank=True)
ws3.add_data_validation(dv_cat2)
dv_cat2.add('A4:A103')


# ═══════════════════════════════════════════════════════════════
#  SHEET 4 – Monthly Summary
# ═══════════════════════════════════════════════════════════════
ws4 = wb.create_sheet("Monthly Summary")

ws4.column_dimensions["A"].width = 3
ws4.column_dimensions["B"].width = 16
ws4.column_dimensions["C"].width = 16
ws4.column_dimensions["D"].width = 16
ws4.column_dimensions["E"].width = 16
ws4.column_dimensions["F"].width = 16
ws4.column_dimensions["G"].width = 16
ws4.column_dimensions["H"].width = 16
ws4.column_dimensions["I"].width = 16
ws4.column_dimensions["J"].width = 16
ws4.column_dimensions["K"].width = 16
ws4.column_dimensions["L"].width = 16
ws4.column_dimensions["M"].width = 3

# Title
ws4.merge_cells("B2:M2")
c = ws4["B2"]
c.value = "📅  Monthly Overview"
c.font = Font(name="Calibri", size=20, bold=True, color=CLR_WHITE)
c.fill = fill(CLR_DARK)
c.alignment = center()
c.border = border_medium
ws4.row_dimensions[2].height = 42

months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

# Month headers
for i, m in enumerate(months, start=2):
    c = ws4.cell(row=3, column=i, value=m)
    c.font = Font(name="Calibri", size=11, bold=True, color=CLR_WHITE)
    c.fill = fill(CLR_ACCENT)
    c.alignment = center()
    c.border = border_thin
ws4.row_dimensions[3].height = 24

# Row labels
rows_label = [
    ("Income", fill("E8F8F5"), CLR_SUCCESS),
    ("Expenses", fill("FFE8E8"), CLR_HIGHLIGHT),
    ("Net", fill("F0EDFF"), CLR_PURPLE),
    ("Savings Rate", fill("FFF8E1"), CLR_BLUE),
]
row_indices = [4, 5, 6, 7]

for ri, (label, bg, col) in zip(row_indices, rows_label):
    c = ws4.cell(row=ri, column=2, value=label)
    c.font = Font(name="Calibri", size=11, bold=True, color=col)
    c.fill = bg
    c.alignment = Alignment(horizontal="left", indent=1)
    c.border = border_thin

    for mi, m in enumerate(months, start=3):
        c = ws4.cell(row=ri, column=mi)
        c.fill = bg
        c.border = border_thin

        if ri == 4:  # Income
            c.value = f'=SUMIFS(Transactions!$H:$H,Transactions!$E:$E,"Income",Transactions!$B:$B,">="&DATE(2025,{mi},1),Transactions!$B:$B,"<"&DATE(2025,{mi}+1,1))'
        elif ri == 5:  # Expenses
            c.value = f'=ABS(SUMIFS(Transactions!$H:$H,Transactions!$E:$E,"Expense",Transactions!$B:$B,">="&DATE(2025,{mi},1),Transactions!$B:$B,"<"&DATE(2025,{mi}+1,1)))'
        elif ri == 6:  # Net
            c.value = f'=B{ri}-C{ri}'
        elif ri == 7:  # Savings rate
            c.value = f'=IF(B{ri}=0,0,(B{ri}-C{ri})/B{ri})'

        c.font = body_font(bold=True)
        c.alignment = right_align()
        if ri == 7:
            c.number_format = '0%'
        else:
            c.number_format = '#,##0.00'

    ws4.row_dimensions[ri].height = 22

# ── Category x Month breakdown ──
ws4.merge_cells("B10:M10")
c = ws4["B10"]
c.value = "📊  Spending by Category & Month"
c.font = Font(name="Calibri", size=14, bold=True, color=CLR_DARK)
c.fill = fill(CLR_LIGHT)
c.alignment = center()
ws4.row_dimensions[10].height = 28

# Sub-headers
ws4.cell(row=11, column=2, value="Category").font = Font(name="Calibri", size=10, bold=True, color=CLR_WHITE)
ws4.cell(row=11, column=2).fill = fill(CLR_ACCENT)
ws4.cell(row=11, column=2).alignment = center()
ws4.cell(row=11, column=2).border = border_thin

for i, m in enumerate(months, start=3):
    c = ws4.cell(row=11, column=i, value=m)
    c.font = Font(name="Calibri", size=10, bold=True, color=CLR_WHITE)
    c.fill = fill(CLR_ACCENT)
    c.alignment = center()
    c.border = border_thin
ws4.row_dimensions[11].height = 22

for i, cat in enumerate(categories):
    r = 12 + i
    bg = fill(CLR_INPUT_BG) if i % 2 == 0 else fill(CLR_BG_ALT)

    c = ws4.cell(row=r, column=2, value=cat)
    c.font = Font(name="Calibri", size=10, bold=True)
    c.fill = bg
    c.alignment = Alignment(horizontal="left", indent=1)
    c.border = border_thin

    for mi, m in enumerate(months, start=3):
        c = ws4.cell(row=r, column=i)
        c.value = f'=SUMIFS(Transactions!$H:$H,Transactions!$F:$F,$B{r},Transactions!$E:$E,"Expense",Transactions!$B:$B,">="&DATE(2025,{mi},1),Transactions!$B:$B,"<"&DATE(2025,{mi}+1,1))'
        c.font = body_font(size=10)
        c.fill = bg
        c.alignment = right_align()
        c.border = border_thin
        c.number_format = '#,##0.00'
    ws4.row_dimensions[r].height = 18

# Conditional formatting on the grid
ws4.conditional_formatting.add(
    "C12:M23",
    ColorScaleRule(start_type='min', start_color='00B894',
                   mid_type='percentile', mid_value=50, mid_color='FDCB6E',
                   end_type='max', end_color='E17055')
)


# ═══════════════════════════════════════════════════════════════
#  Final touches
# ═══════════════════════════════════════════════════════════════
wb.sheet_properties.tabColor["Dashboard"] = CLR_ACCENT
wb.sheet_properties.tabColor["Transactions"] = CLR_BLUE
wb.sheet_properties.tabColor["Categories"] = CLR_PURPLE
wb.sheet_properties.tabColor["Monthly Summary"] = CLR_HIGHLIGHT

# Set active sheet
wb.active = wb.worksheets[0]

output_path = "Budget_Tracker.xlsx"
wb.save(output_path)
print(f"✅ Saved to {output_path}")