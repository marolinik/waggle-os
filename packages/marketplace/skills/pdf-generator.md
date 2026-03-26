---
name: pdf-generator
description: Generate PDF documents using reportlab or weasyprint
category: documents
builtIn: true
---

# PDF Generator

Generate PDF documents. Use the bash tool to run a Python script with reportlab.

## Workflow

1. Create a Python script that uses reportlab to build the PDF
2. Run it with the bash tool
3. Return the file path to the user

## Requirements

- python3 with reportlab installed (`pip install reportlab`)

## Example Script

```python
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors

doc = SimpleDocTemplate("report.pdf", pagesize=letter)
styles = getSampleStyleSheet()
elements = []

# Title
title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=24, spaceAfter=30)
elements.append(Paragraph("Quarterly Report", title_style))
elements.append(Spacer(1, 12))

# Body text
elements.append(Paragraph("This report covers Q1 2026 performance metrics.", styles['Normal']))
elements.append(Spacer(1, 12))

# Table
data = [
    ["Metric", "Value", "Change"],
    ["Revenue", "$2.4M", "+15%"],
    ["Users", "12,500", "+22%"],
    ["Retention", "94%", "+3%"],
]
table = Table(data, colWidths=[2*inch, 1.5*inch, 1*inch])
table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4472C4')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
]))
elements.append(table)

doc.build(elements)
print("Created report.pdf")
```

## Tips

- Use `SimpleDocTemplate` for multi-page documents with automatic pagination
- Use `reportlab.graphics` for charts and diagrams
- Use `reportlab.lib.colors` for color management
- For HTML-to-PDF, consider weasyprint (`pip install weasyprint`) as an alternative
- Add page numbers with a custom `PageTemplate` and `Frame`
