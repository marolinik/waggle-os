---
name: xlsx-generator
description: Generate Excel spreadsheets using openpyxl
category: documents
builtIn: true
---

# XLSX Generator

Generate Excel spreadsheets. Use the bash tool to run a Python script with openpyxl.

## Workflow

1. Create a Python script that uses openpyxl to build the spreadsheet
2. Run it with the bash tool
3. Return the file path to the user

## Requirements

- python3 with openpyxl installed (`pip install openpyxl`)

## Example Script

```python
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
from openpyxl.chart import BarChart, Reference

wb = Workbook()
ws = wb.active
ws.title = "Sales Data"

# Headers
headers = ["Month", "Revenue", "Expenses", "Profit"]
for col, header in enumerate(headers, 1):
    cell = ws.cell(row=1, column=col, value=header)
    cell.font = Font(bold=True, size=12)
    cell.fill = PatternFill(start_color="4472C4", fill_type="solid")
    cell.font = Font(bold=True, color="FFFFFF")

# Data
data = [
    ["Jan", 45000, 32000, 13000],
    ["Feb", 52000, 35000, 17000],
    ["Mar", 48000, 33000, 15000],
]
for row_idx, row_data in enumerate(data, 2):
    for col_idx, value in enumerate(row_data, 1):
        ws.cell(row=row_idx, column=col_idx, value=value)

# Auto-width columns
for col in ws.columns:
    ws.column_dimensions[col[0].column_letter].width = 15

wb.save("sales-report.xlsx")
print("Created sales-report.xlsx")
```

## Tips

- Use `openpyxl.styles` for formatting (fonts, colors, borders)
- Use `openpyxl.chart` for embedded charts
- Use `ws.merge_cells()` for merged header rows
- Use `openpyxl.utils` for column letter conversions
- Add formulas as strings: `ws['D2'] = '=B2-C2'`
