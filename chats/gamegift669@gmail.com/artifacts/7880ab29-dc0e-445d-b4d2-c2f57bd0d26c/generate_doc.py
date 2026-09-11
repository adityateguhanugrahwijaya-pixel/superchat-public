import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = openpyxl.Workbook()

# ── Sheet 1: Monthly Budget ──────────────────────────────────────────────────
ws = wb.active
ws.title = "Monthly Budget"

# Styles
header_font = Font(name="Calibri", bold=True, size=14, color="FFFFFF")
sub_header_font = Font(name="Calibri", bold=True, size=11)
income_font = Font(name="Calibri", bold=True, size=11, color="1F6B2A")
expense_font = Font(name="Calibri", bold=True, size=11, color="9C1D1D")
cat_font = Font(name="Calibri", size=11)
number_font = Font(name="Calibri", size=11)
total_font = Font(name="Calibri", bold=True, size=12)
pct_font = Font(name="Calibri", size=10, italic=True, color="555555")

header_fill = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
income_fill = PatternFill(start_color="E2EFDA", end_color="E2EFDA", fill_type="solid")
expense_fill = PatternFill(start_color="FCE4EC", end_color="FCE4EC", fill_type="solid")
total_fill  = PatternFill(start_color="FFD966", end_color="FFD966", fill_type="solid")
cat_fill    = PatternFill(start_color="D6DCE4", end_color="D6DCE4", fill_type="solid")
white_fill  = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
yellow_fill = PatternFill(start_color="FFFF00", end_color="FFFF00", fill_type="solid")

thin_border = Border(
    left=Side(style="thin"), right=Side(style="thin"),
    top=Side(style="thin"), bottom=Side(style="thin")
)
center = Alignment(horizontal="center", vertical="center")
right_align = Alignment(horizontal="right", vertical="center")

# Title
ws.merge_cells("A1:D1")
ws["A1"] = "📊 PERSONAL MONTHLY BUDGET"
ws["A1"].font = Font(name="Calibri", bold=True, size=18, color="FFFFFF")
ws["A1"].fill = header_fill
ws["A1"].alignment = center
ws.row_dimensions[1].height = 36

# Labels
ws["A2"] = "Name"
ws["B2"] = "Category"
ws["C2"] = "Budgeted ($)"
ws["D2"] = "Actual ($)"

# Header row 2
for col in range(1, 5):
    cell = ws.cell(row=2, column=col)
    cell.font = header_font
    cell.fill = PatternFill(start_color="1F3864", end_color="1F3864", fill_type="solid")
    cell.alignment = center
    cell.border = thin_border
ws.row_dimensions[2].height = 26

# ── INCOME SECTION ───────────────────────────────────────────────
row = 3
ws.cell(row=row, column=1).value = ""
ws.cell(row=row, column=2).value = "INCOME"
ws.cell(row=row, column=2).font = income_font
ws.cell(row=row, column=2).fill = income_fill
ws.cell(row=row, column=2).border = thin_border
for c in range(1,5): ws.cell(row=row, column=c).fill = income_fill; ws.cell(row=row, column=c).border = thin_border
ws.row_dimensions[row].height = 22
row += 1

income_items = [
    ("Salary / Wages",            "",      ""),
    ("Freelance / Side Hustle",   "",      ""),
    ("Investment Income",         "",      ""),
    ("Other Income",              "",      ""),
]
for label, budget, actual in income_items:
    ws.cell(row=row, column=1).value = ""
    ws.cell(row=row, column=2).value = label
    ws.cell(row=row, column=2).font = cat_font
    ws.cell(row=row, column=2).alignment = Alignment(horizontal="left", vertical="center")
    ws.cell(row=row, column=3).value = budget
    ws.cell(row=row, column=3).font = number_font
    ws.cell(row=row, column=3).alignment = right_align
    ws.cell(row=row, column=4).value = actual
    ws.cell(row=row, column=4).font = number_font
    ws.cell(row=row, column=4).alignment = right_align
    for c in range(1,5): ws.cell(row=row, column=c).fill = white_fill; ws.cell(row=row, column=c).border = thin_border
    row += 1

# Income Total
ws.cell(row=row, column=1).value = ""
ws.cell(row=row, column=2).value = "Total Income"
ws.cell(row=row, column=2).font = total_font
ws.cell(row=row, column=2).fill = total_fill
ws.cell(row=row, column=3).value = "=SUM(C4:C7)"
ws.cell(row=row, column=3).font = total_font
ws.cell(row=row, column=3).number_format = "$#,##0.00"
ws.cell(row=row, column=3).fill = total_fill
ws.cell(row=row, column=4).value = "=SUM(D4:D7)"
ws.cell(row=row, column=4).font = total_font
ws.cell(row=row, column=4).number_format = "$#,##0.00"
ws.cell(row=row, column=4).fill = total_fill
for c in range(1,5): ws.cell(row=row, column=c).border = thin_border
ws.cell(row=row, column=2).alignment = right_align
ws.cell(row=row, column=3).alignment = right_align
ws.cell(row=row, column=4).alignment = right_align
ws.row_dimensions[row].height = 24
income_total_row = row
row += 2

# ── EXPENSES SECTION ─────────────────────────────────────────────
ws.cell(row=row, column=2).value = "EXPENSES"
ws.cell(row=row, column=2).font = expense_font
ws.cell(row=row, column=2).fill = expense_fill
for c in range(1,5): ws.cell(row=row, column=c).fill = expense_fill; ws.cell(row=row, column=c).border = thin_border
ws.row_dimensions[row].height = 22
row += 1

expenses = [
    ("Housing",      "", ""),
    ("  Rent / Mortgage",       "",  ""),
    ("  Property Tax",          "",  ""),
    ("  Home Insurance",        "",  ""),
    ("  HOA Fees",              "",  ""),
    ("Utilities",      "", ""),
    ("  Electricity",           "",  ""),
    ("  Water / Sewer",         "",  ""),
    ("  Gas / Heating",         "",  ""),
    ("  Internet / Phone",      "",  ""),
    ("Transportation", "", ""),
    ("  Car Payment",           "",  ""),
    ("  Gas / Fuel",            "",  ""),
    ("  Insurance",             "",  ""),
    ("  Public Transit",        "",  ""),
    ("Food",         "", ""),
    ("  Groceries",             "",  ""),
    ("  Dining Out",            "",  ""),
    ("Healthcare",   "", ""),
    ("  Health Insurance",      "",  ""),
    ("  Doctors / Pharmacy",    "",  ""),
    ("Insurance",    "", ""),
    ("  Life Insurance",        "",  ""),
    ("  Other Insurance",       "",  ""),
    ("Debt Payments", "", ""),
    ("  Credit Cards",          "",  ""),
    ("  Student Loans",         "",  ""),
    ("  Other Debt",            "",  ""),
    ("Savings",      "", ""),
    ("  Emergency Fund",        "",  ""),
    ("  Retirement (401k/IRA)", "",  ""),
    ("  Investments",           "",  ""),
    ("Entertainment", "", ""),
    ("  Subscriptions",         "",  ""),
    ("  Streaming / Media",     "",  ""),
    ("  Hobbies",               "",  ""),
    ("Personal",     "", ""),
    ("  Clothing",              "",  ""),
    ("  Personal Care",         "",  ""),
    ("  Gifts / Donations",     "",  ""),
    ("Miscellaneous", "", ""),
    ("  Miscellaneous",         "",  ""),
]

category_rows = {}  # track first row of each category
current_cat = None
for label, budget, actual in expenses:
    is_sub = label.startswith("  ")
    name = label.strip()
    if not is_sub and name:
        current_cat = name
        cat_start = row
        ws.cell(row=row, column=1).value = ""
        ws.cell(row=row, column=2).value = name
        ws.cell(row=row, column=2).font = sub_header_font
        ws.cell(row=row, column=2).fill = cat_fill
        ws.cell(row=row, column=2).border = thin_border
        ws.cell(row=row, column=3).fill = cat_fill
        ws.cell(row=row, column=3).border = thin_border
        ws.cell(row=row, column=4).fill = cat_fill
        ws.cell(row=row, column=4).border = thin_border
        ws.cell(row=row, column=5).fill = cat_fill
        ws.cell(row=row, column=5).border = thin_border
        ws.row_dimensions[row].height = 22
        category_rows[current_cat] = cat_start
        row += 1
        continue
    ws.cell(row=row, column=1).value = ""
    ws.cell(row=row, column=2).value = name
    ws.cell(row=row, column=2).font = cat_font
    ws.cell(row=row, column=2).alignment = Alignment(horizontal="left", vertical="center")
    ws.cell(row=row, column=2).fill = white_fill
    ws.cell(row=row, column=2).border = thin_border
    ws.cell(row=row, column=3).value = budget
    ws.cell(row=row, column=3).font = number_font
    ws.cell(row=row, column=3).number_format = "$#,##0.00"
    ws.cell(row=row, column=3).alignment = right_align
    ws.cell(row=row, column=3).fill = yellow_fill
    ws.cell(row=row, column=3).border = thin_border
    ws.cell(row=row, column=4).value = actual
    ws.cell(row=row, column=4).font = number_font
    ws.cell(row=row, column=4).number_format = "$#,##0.00"
    ws.cell(row=row, column=4).alignment = right_align
    ws.cell(row=row, column=4).fill = white_fill
    ws.cell(row=row, column=4).border = thin_border
    row += 1

# Category Subtotals (Diff column)
for cat, start_r in category_rows.items():
    # find last row of this category
    r = start_r + 1
    while r < ws.max_row:
        val = ws.cell(row=r, column=2).value
        if val and not str(val).startswith(" "):
            break
        r += 1
    end_r = r - 1
    # subtotal row
    ws.cell(row=r, column=1).value = ""
    ws.cell(row=r, column=2).value = f"  Subtotal – {cat}"
    ws.cell(row=r, column=2).font = Font(name="Calibri", italic=True, size=10, color="555555")
    ws.cell(row=r, column=2).alignment = right_align
    ws.cell(row=r, column=3).value = f"=SUMIFS(C{start_r}:C{end_r},B{start_r}:B{end_r},\"*{cat.replace(' ', ' '}*\")"
    # simpler approach: hardcode the range per category
    pass  # will redo below

# Let's use a cleaner approach for category subtotals
# Find total expense rows again more carefully
row_idx = 3
sub_row_map = {}  # category -> (subtotal_row, start_row)
for label, budget, actual in expenses:
    is_sub = label.startswith("  ")
    name = label.strip()
    if not is_sub and name:
        cat_start = row_idx + 1  # because we already incremented once for header
        row_idx += 1  # this is the first sub-item
        # skip items until next category
        pass
    row_idx += 1

# Actually let me just compute subtotals by scanning the table directly
# Redo: scan the filled table for category blocks
# I'll build subtotals at the right place now
current_row = 3

# Reset and re-scan properly
exp_start = 5  # skip title + headers + income section
# Find where expenses start
for r in range(1, ws.max_row + 1):
    v = ws.cell(row=r, column=2).value
    if v == "EXPENSES":
        exp_start = r + 1
        break

subtotals = []
r = exp_start
while r <= ws.max_row:
    v = ws.cell(row=r, column=2).value
    if v and not str(v).startswith(" ") and v != "EXPENSES":
        cat_name = v
        cat_start = r
        sr = r + 1
        while sr <= ws.max_row:
            sv = ws.cell(row=sr, column=2).value
            if sv and not str(sv).startswith(" ") and sv not in (None, ""):
                break
            if sv and str(sv).startswith("  "):
                sr += 1
                continue
            break
        cat_end = sr - 1
        # insert subtotal
        sb_row = cat_end + 1
        ws.cell(row=sb_row, column=1).value = ""
        ws.cell(row=sb_row, column=2).value = f"  Subtotal – {cat_name}"
        ws.cell(row=sb_row, column=2).font = Font(name="Calibri", italic=True, size=10, color="555555")
        ws.cell(row=sb_row, column=2).alignment = Alignment(horizontal="right", vertical="center")
        ws.cell(row=sb_row, column=3).value = f"=SUM(C{cat_start}:C{cat_end})"
        ws.cell(row=sb_row, column=3).font = Font(name="Calibri", size=10, italic=True)
        ws.cell(row=sb_row, column=3).number_format = "$#,##0.00"
        ws.cell(row=sb_row, column=3).alignment = right_align
        ws.cell(row=sb_row, column=4).value = f"=SUM(D{cat_start}:D{cat_end})"
        ws.cell(row=sb_row, column=4).font = Font(name="Calibri", size=10, italic=True)
        ws.cell(row=sb_row, column=4).number_format = "$#,##0.00"
        ws.cell(row=sb_row, column=4).alignment = right_align
        for c in range(1,5):
            ws.cell(row=sb_row, column=c).fill = cat_fill
            ws.cell(row=sb_row, column=c).border = thin_border
        subtotals.append((cat_name, sb_row, cat_start, cat_end))
        r = sb_row + 1
    elif v and str(v).startswith("  "):
        r += 1
    else:
        break

# Total Expenses
tot_exp_row = r + 1
ws.cell(row=tot_exp_row, column=1).value = ""
ws.cell(row=tot_exp_row, column=2).value = "TOTAL EXPENSES"
ws.cell(row=tot_exp_row, column=2).font = total_font
ws.cell(row=tot_exp_row, column=2).alignment = right_align
first_sub, _, _, _ = subtotals[0]
last_sub_row = subtotals[-1][1]
# sum all subtotal rows
sub_sum_formula = "+".join(f"C{s[1]}" for s in subtotals)
ws.cell(row=tot_exp_row, column=3).value = f"={sub_sum_formula}"
ws.cell(row=tot_exp_row, column=3).font = total_font
ws.cell(row=tot_exp_row, column=3).number_format = "$#,##0.00"
ws.cell(row=tot_exp_row, column=3).alignment = right_align
ws.cell(row=tot_exp_row, column=4).value = f"={sub_sum_formula.replace('C', 'D')}"
ws.cell(row=tot_exp_row, column=4).font = total_font
ws.cell(row=tot_exp_row, column=4).number_format = "$#,##0.00"
ws.cell(row=tot_exp_row, column=4).alignment = right_align
for c in range(1,5):
    ws.cell(row=tot_exp_row, column=c).fill = total_fill
    ws.cell(row=tot_exp_row, column=c).border = thin_border
ws.row_dimensions[tot_exp_row].height = 26

# Net Income
net_row = tot_exp_row + 1
ws.cell(row=net_row, column=1).value = ""
ws.cell(row=net_row, column=2).value = "NET INCOME"
ws.cell(row=net_row, column=2).font = Font(name="Calibri", bold=True, size=13, color="1F3864")
ws.cell(row=net_row, column=2).alignment = right_align
ws.cell(row=net_row, column=3).value = f"=C{income_total_row}-C{tot_exp_row}"
ws.cell(row=net_row, column=3).font = Font(name="Calibri", bold=True, size=13, color="1F3864")
ws.cell(row=net_row, column=3).number_format = "$#,##0.00"
ws.cell(row=net_row, column=3).alignment = right_align
ws.cell(row=net_row, column=4).value = f"=D{income_total_row}-D{tot_exp_row}"
ws.cell(row=net_row, column=4).font = Font(name="Calibri", bold=True, size=13, color="1F3864")
ws.cell(row=net_row, column=4).number_format = "$#,##0.00"
ws.cell(row=net_row, column=4).alignment = right_align
for c in range(1,5):
    ws.cell(row=net_row, column=c).fill = PatternFill(start_color="C9D9F0", end_color="C9D9F0", fill_type="solid")
    ws.cell(row=net_row, column=c).border = thin_border
ws.row_dimensions[net_row].height = 28

# Variance %
var_row = net_row + 1
ws.cell(row=var_row, column=1).value = ""
ws.cell(row=var_row, column=2).value = "VARIANCE (% of Budget)"
ws.cell(row=var_row, column=2).font = Font(name="Calibri", bold=True, size=11, italic=True, color="555555")
ws.cell(row=var_row, column=2).alignment = right_align
ws.cell(row=var_row, column=3).value = f'=IF(C{income_total_row}=0,"N/A",(C{income_total_row}-C{tot_exp_row})/C{income_total_row})'
ws.cell(row=var_row, column=3).font = Font(name="Calibri", size=11, italic=True, color="555555")
ws.cell(row=var_row, column=3).number_format = "0.0%"
ws.cell(row=var_row, column=3).alignment = right_align
ws.cell(row=var_row, column=4).value = ""
for c in range(1,5):
    ws.cell(row=var_row, column=c).border = thin_border
ws.row_dimensions[var_row].height = 22

# Column widths
ws.column_dimensions["A"].width = 4
ws.column_dimensions["B"].width = 26
ws.column_dimensions["C"].width = 16
ws.column_dimensions["D"].width = 16

# ── Sheet 2: Annual Overview ─────────────────────────────────────
ws2 = wb.create_sheet("Annual Overview")

ws2.merge_cells("A1:F1")
ws2["A1"] = "📅 ANNUAL BUDGET OVERVIEW"
ws2["A1"].font = Font(name="Calibri", bold=True, size=18, color="FFFFFF")
ws2["A1"].fill = header_fill
ws2["A1"].alignment = center
ws2.row_dimensions[1].height = 36

headers2 = ["Category", "Jan", "Feb", "Mar", "Apr", "May"]
for ci, h in enumerate(headers2, 1):
    cell = ws2.cell(row=2, column=ci, value=h)
    cell.font = header_font
    cell.fill = PatternFill(start_color="1F3864", end_color="1F3864", fill_type="solid")
    cell.alignment = center
    cell.border = thin_border
ws2.row_dimensions[2].height = 26

annual_categories = [
    "Income", "Housing", "Utilities", "Transportation", "Food",
    "Healthcare", "Insurance", "Debt Payments", "Savings",
    "Entertainment", "Personal", "Miscellaneous",
]

for i, cat in enumerate(annual_categories):
    r = i + 3
    ws2.cell(row=r, column=1).value = cat
    ws2.cell(row=r, column=1).font = sub_header_font
    ws2.cell(row=r, column=1).fill = cat_fill
    ws2.cell(row=r, column=1).border = thin_border
    ws2.cell(row=r, column=1).alignment = Alignment(horizontal="left", vertical="center")
    for c in range(2, 7):
        ws2.cell(row=r, column=c).value = ""
        ws2.cell(row=r, column=c).font = number_font
        ws2.cell(row=r, column=c).number_format = "$#,##0.00"
        ws2.cell(row=r, column=c).alignment = right_align
        ws2.cell(row=r, column=c).fill = yellow_fill if cat != "Income" else income_fill
        ws2.cell(row=r, column=c).border = thin_border
    # Jun-Dec blank template rows
    for j in range(6, 12):
        c_idx = j + 1
        ws2.cell(row=r, column=c_idx).value = f"=IF(B{r}<>\"\",\"B{r}\",\"\")"
        ws2.cell(row=r, column=c_idx).font = number_font
        ws2.cell(row=r, column=c_idx).number_format = "$#,##0.00"
        ws2.cell(row=r, column=c_idx).alignment = right_align
        ws2.cell(row=r, column=c_idx).fill = yellow_fill if cat != "Income" else income_fill
        ws2.cell(row=r, column=c_idx).border = thin_border
    ws2.row_dimensions[r].height = 22

# Totals row
tr = len(annual_categories) + 3
ws2.cell(row=tr, column=1).value = "ANNUAL TOTAL"
ws2.cell(row=tr, column=1).font = total_font
ws2.cell(row=tr, column=1).fill = total_fill
ws2.cell(row=tr, column=1).border = thin_border
ws2.cell(row=tr, column=1).alignment = Alignment(horizontal="right", vertical="center")
for c in range(2, 13):
    col_letter = get_column_letter(c)
    ws2.cell(row=tr, column=c).value = f"=SUM({col_letter}3:{col_letter}{tr-1})"
    ws2.cell(row=tr, column=c).font = total_font
    ws2.cell(row=tr, column=c).number_format = "$#,##0.00"
    ws2.cell(row=tr, column=c).alignment = right_align
    ws2.cell(row=tr, column=c).fill = total_fill
    ws2.cell(row=tr, column=c).border = thin_border
ws2.row_dimensions[tr].height = 26

# Monthly totals column
for r in range(3, tr):
    row_num = r
    ws2.cell(row=r, column=13).value = f"=SUM(B{r}:M{r})"
    ws2.cell(row=r, column=13).font = number_font
    ws2.cell(row=r, column=13).number_format = "$#,##0.00"
    ws2.cell(row=r, column=13).alignment = right_align
    ws2.cell(row=r, column=13).fill = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")
    ws2.cell(row=r, column=13).border = thin_border
ws2.cell(row=tr, column=13).value = f"=SUM(N3:N{tr-1})"
ws2.cell(row=tr, column=13).font = total_font
ws2.cell(row=tr, column=13).number_format = "$#,##0.00"
ws2.cell(row=tr, column=13).alignment = right_align
ws2.cell(row=tr, column=13).fill = total_fill
ws2.cell(row=tr, column=13).border = thin_border

ws2.column_dimensions["A"].width = 20
for c in range(2, 14):
    ws2.column_dimensions[get_column_letter(c)].width = 12

# ── Sheet 3: Savings Goals ───────────────────────────────────────
ws3 = wb.create_sheet("Savings Goals")

ws3.merge_cells("A1:E1")
ws3["A1"] = "💰 SAVINGS GOALS TRACKER"
ws3["A1"].font = Font(name="Calibri", bold=True, size=18, color="FFFFFF")
ws3["A1"].fill = PatternFill(start_color="375623", end_color="375623", fill_type="solid")
ws3["A1"].alignment = center
ws3.row_dimensions[1].height = 36

s_headers = ["Goal", "Target ($)", "Current ($)", "% Complete", "Est. Date"]
for ci, h in enumerate(s_headers, 1):
    cell = ws3.cell(row=2, column=ci, value=h)
    cell.font = header_font
    cell.fill = PatternFill(start_color="1F6B2A", end_color="1F6B2A", fill_type="solid")
    cell.alignment = center
    cell.border = thin_border
ws3.row_dimensions[2].height = 26

goals = [
    ("Emergency Fund (3 months)",     15000, "", ""),
    ("Vacation Fund",                 3000,  "", ""),
    ("New Car Down Payment",          8000,  "", ""),
    ("Home Down Payment",             60000, "", ""),
    ("Retirement (Additional)",       50000, "", ""),
    ("Wedding / Event",               10000, "", ""),
    ("Education / Tuition",           20000, "", ""),
    ("Major Purchase",                5000,  "", ""),
]

for i, (goal, target, current, date_val) in enumerate(goals):
    r = i + 3
    ws3.cell(row=r, column=1).value = goal
    ws3.cell(row=r, column=1).font = cat_font
    ws3.cell(row=r, column=1).alignment = Alignment(horizontal="left", vertical="center")
    ws3.cell(row=r, column=1).fill = white_fill
    ws3.cell(row=r, column=1).border = thin_border

    ws3.cell(row=r, column=2).value = target
    ws3.cell(row=r, column=2).font = number_font
    ws3.cell(row=r, column=2).number_format = "$#,##0.00"
    ws3.cell(row=r, column=2).alignment = right_align
    ws3.cell(row=r, column=2).fill = yellow_fill
    ws3.cell(row=r, column=2).border = thin_border

    ws3.cell(row=r, column=3).value = current
    ws3.cell(row=r, column=3).font = number_font
    ws3.cell(row=r, column=3).number_format = "$#,##0.00"
    ws3.cell(row=r, column=3).alignment = right_align
    ws3.cell(row=r, column=3).fill = white_fill
    ws3.cell(row=r, column=3).border = thin_border

    ws3.cell(row=r, column=4).value = f"=IF(B{r}=0,0,C{r}/B{r})"
    ws3.cell(row=r, column=4).font = Font(name="Calibri", bold=True, size=11, color="1F6B2A")
    ws3.cell(row=r, column=4).number_format = "0.0%"
    ws3.cell(row=r, column=4).alignment = center
    ws3.cell(row=r, column=4).fill = white_fill
    ws3.cell(row=r, column=4).border = thin_border

    ws3.cell(row=r, column=5).value = date_val
    ws3.cell(row=r, column=5).font = number_font
    ws3.cell(row=r, column=5).number_format = "MM/DD/YYYY"
    ws3.cell(row=r, column=5).alignment = center
    ws3.cell(row=r, column=5).fill = white_fill
    ws3.cell(row=r, column=5).border = thin_border
    ws3.row_dimensions[r].height = 22

# Summary stats
sr = len(goals) + 4
ws3.merge_cells(f"A{sr}:C{sr}")
ws3.cell(row=sr, column=1).value = "📌 Total Target Savings:"
ws3.cell(row=sr, column=1).font = total_font
ws3.cell(row=sr, column=1).fill = total_fill
ws3.cell(row=sr, column=1).border = thin_border
ws3.cell(row=sr, column=2).value = f"=SUM(B3:B{len(goals)+2})"
ws3.cell(row=sr, column=2).font = total_font
ws3.cell(row=sr, column=2).number_format = "$#,##0.00"
ws3.cell(row=sr, column=2).alignment = right_align
ws3.cell(row=sr, column=2).fill = total_fill
ws3.cell(row=sr, column=2).border = thin_border
ws3.cell(row=sr, column=3).fill = total_fill
ws3.cell(row=sr, column=3).border = thin_border

ws3.column_dimensions["A"].width = 28
ws3.column_dimensions["B"].width = 16
ws3.column_dimensions["C"].width = 14
ws3.column_dimensions["D"].width = 14
ws3.column_dimensions["E"].width = 14

# ── SAVE ─────────────────────────────────────────────────────────
output_path = "Budget_Template.xlsx"
wb.save(output_path)
print(f"✅ Saved → {output_path}")