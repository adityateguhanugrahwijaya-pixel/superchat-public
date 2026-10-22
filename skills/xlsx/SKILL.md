---
name: xlsx
description: Professional Excel workbook generation, styling, formulas, and data formatting using openpyxl, xlsxwriter, or pandas.
triggers:
  - excel
  - xlsx
  - spreadsheet
  - sheet
  - csv
dependencies:
  - openpyxl
  - pandas
---

# Excel Spreadsheet (XLSX) Skill Guide

## Overview
Guidelines for creating clean, styled, and formula-enabled Excel workbooks with openpyxl and pandas.

---

## 1. Professional Formatted Workbook with openpyxl

```python
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def generate_financial_model(filename="outputs/financial_summary.xlsx"):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Q4 Financials"
    
    # Theme colors
    HEADER_BG = "1E293B"     # Slate 800
    HEADER_TEXT = "FFFFFF"
    ZEBRA_BG = "F8FAFC"      # Slate 50
    ACCENT_BG = "E2E8F0"     # Slate 200
    
    header_font = Font(name="Calibri", size=11, bold=True, color=HEADER_TEXT)
    header_fill = PatternFill(start_color=HEADER_BG, end_color=HEADER_BG, fill_type="solid")
    regular_font = Font(name="Calibri", size=10)
    total_font = Font(name="Calibri", size=10, bold=True)
    
    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'),
        right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'),
        bottom=Side(style='thin', color='CBD5E1')
    )
    
    headers = ["Department", "Budget", "Actual Spend", "Variance", "% Budget"]
    ws.append(headers)
    
    rows = [
        ["Engineering", 120000, 114500],
        ["Product & Design", 45000, 48200],
        ["Marketing", 80000, 76400],
        ["Sales & Ops", 60000, 58900],
        ["Customer Success", 30000, 27500],
    ]
    
    start_row = 2
    for idx, (dept, budget, actual) in enumerate(rows, start=start_row):
        variance_formula = f"=B{idx}-C{idx}"
        pct_formula = f"=C{idx}/B{idx}"
        ws.append([dept, budget, actual, variance_formula, pct_formula])
    
    total_row = start_row + len(rows)
    ws.append([
        "Total",
        f"=SUM(B{start_row}:B{total_row-1})",
        f"=SUM(C{start_row}:C{total_row-1})",
        f"=B{total_row}-C{total_row}",
        f"=C{total_row}/B{total_row}"
    ])
    
    # Style Header
    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_num)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border
    
    # Style Data Rows
    for r in range(start_row, total_row):
        fill = PatternFill(start_color=ZEBRA_BG, end_color=ZEBRA_BG, fill_type="solid") if r % 2 == 0 else None
        for col_num in range(1, len(headers) + 1):
            cell = ws.cell(row=r, column=col_num)
            cell.font = regular_font
            cell.border = thin_border
            if fill:
                cell.fill = fill
            
            # Formats
            if col_num in [2, 3, 4]:
                cell.number_format = '$#,##0'
                cell.alignment = Alignment(horizontal="right")
            elif col_num == 5:
                cell.number_format = '0.0%'
                cell.alignment = Alignment(horizontal="right")
            else:
                cell.alignment = Alignment(horizontal="left")
                
    # Style Totals Row
    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=total_row, column=col_num)
        cell.font = total_font
        cell.border = Border(top=Side(style='thin', color='0F172A'), bottom=Side(style='double', color='0F172A'))
        if col_num in [2, 3, 4]:
            cell.number_format = '$#,##0'
        elif col_num == 5:
            cell.number_format = '0.0%'
    
    # Auto-adjust column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 4, 12)
        
    ws.freeze_panes = "A2"
    wb.save(filename)
    print(f"Spreadsheet saved to {filename}")

if __name__ == "__main__":
    generate_financial_model()
```

---

## Common Pitfalls
1. **Never Hardcode Calculations**: Always use Excel formulas (`=SUM()`, `=A1*B1`) for subtotals and ratios so users can modify inputs.
2. **Auto Column Width**: Unformatted columns truncate text with `###` when numbers are long. Always calculate column width.
3. **Freeze Panes**: Add `ws.freeze_panes = "A2"` so headers remain visible when scrolling.
