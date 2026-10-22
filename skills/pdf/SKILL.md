---
name: pdf
description: High-fidelity PDF document generation using ReportLab and text extraction/merging using pypdf.
triggers:
  - pdf
  - report
  - invoice
  - document
  - certificate
dependencies:
  - reportlab
  - pypdf
---

# PDF Generation and Manipulation Skill Guide

## Overview
This skill provides production-tested patterns for creating polished PDF documents with ReportLab and reading/merging PDFs with pypdf.

---

## 1. Professional PDF Generation with ReportLab

Always use `SimpleDocTemplate` and flowables rather than hardcoded low-level canvas coordinates.

```python
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

def create_report(filename="outputs/annual_report.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Brand Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=28,
        textColor=colors.HexColor('#1e293b'),
        spaceAfter=12,
    )
    
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#334155'),
        spaceAfter=8,
    )

    story = []
    
    # Header
    story.append(Paragraph("Executive Performance Summary", title_style))
    story.append(Paragraph("Generated autonomously by SuperChat Enterprise Suite.", body_style))
    story.append(Spacer(1, 14))
    
    # Table data - ALWAYS wrap cell strings in Paragraph to enable auto-wrap
    data = [
        [Paragraph("<b>Metric</b>", body_style), Paragraph("<b>Target</b>", body_style), Paragraph("<b>Actual</b>", body_style), Paragraph("<b>Variance</b>", body_style)],
        [Paragraph("Monthly Revenue", body_style), "$100,000", "$118,450", "+18.4%"],
        [Paragraph("Active Subscriptions", body_style), "1,200", "1,340", "+11.6%"],
        [Paragraph("Churn Rate", body_style), "< 2.0%", "1.4%", "-0.6% (Good)"],
    ]
    
    t = Table(data, colWidths=[2.2 * inch, 1.5 * inch, 1.5 * inch, 1.5 * inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#0f172a')),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
    ]))
    story.append(t)
    
    # Page numbering canvas callback
    def add_page_number(canvas, doc):
        canvas.saveState()
        canvas.setFont('Helvetica', 9)
        canvas.setFillColor(colors.HexColor('#64748b'))
        canvas.drawRightString(
            letter[0] - 0.75 * inch,
            0.5 * inch,
            f"Page {doc.page}"
        )
        canvas.restoreState()

    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
    print(f"Report successfully saved to {filename}")

if __name__ == "__main__":
    create_report()
```

---

## 2. Reading and Merging with pypdf

```python
from pypdf import PdfReader, PdfWriter

def extract_pdf_text(filepath):
    reader = PdfReader(filepath)
    text = ""
    for idx, page in enumerate(reader.pages):
        text += f"--- Page {idx + 1} ---\n"
        text += page.extract_text() or ""
        text += "\n\n"
    return text

def merge_pdfs(input_paths, output_path="outputs/merged.pdf"):
    writer = PdfWriter()
    for path in input_paths:
        reader = PdfReader(path)
        for page in reader.pages:
            writer.add_page(page)
    with open(output_path, "wb") as f:
        writer.write(f)
    print(f"Merged {len(input_paths)} files into {output_path}")
```

---

## Common Pitfalls
1. **Unwrapped Table Cells**: Placing raw long strings inside ReportLab `Table` causes text to overflow the page edge. Always wrap strings in `Paragraph(text, style)`.
2. **Page Boundaries**: Avoid absolute canvas positioning (`canvas.drawString`) for dynamic content. Use Flowables (`Paragraph`, `Table`, `Spacer`).
3. **Always Output to Relative Path**: Save PDFs in `outputs/` or root so `present_files` can find and present them to the user.
