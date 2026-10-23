---
name: pdf
description: Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text/tables from PDFs, combining or merging multiple PDFs into one, splitting PDFs apart, rotating pages, adding watermarks, creating new PDFs, filling PDF forms, encrypting/decrypting PDFs, extracting images, and OCR on scanned PDFs to make them searchable. If the user mentions a .pdf file or asks to produce one, use this skill.
triggers:
  - pdf
  - document
  - reportlab
  - pypdf
  - invoice
dependencies:
  - pypdf
  - reportlab
license: Proprietary. LICENSE.txt has complete terms
---

# PDF Processing Guide

## Overview

This guide covers essential PDF processing operations using Python libraries and command-line tools. For advanced features, JavaScript libraries, and detailed examples, see REFERENCE.md. If you need to fill out a PDF form, read FORMS.md and follow its instructions.

## Quick Start

```python
from pypdf import PdfReader, PdfWriter

# Read a PDF
reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

# Extract text
text = ""
for page in reader.pages:
    text += page.extract_text()
```

## Python Libraries

### pypdf - Basic Operations

#### Merge PDFs
```python
from pypdf import PdfWriter, PdfReader

writer = PdfWriter()
for pdf_file in ["doc1.pdf", "doc2.pdf", "doc3.pdf"]:
    reader = PdfReader(pdf_file)
    for page in reader.pages:
        writer.add_page(page)

with open("merged.pdf", "wb") as output:
    writer.write(output)
```

#### Split PDF
```python
reader = PdfReader("input.pdf")
for i, page in enumerate(reader.pages):
    writer = PdfWriter()
    writer.add_page(page)
    with open(f"page_{i+1}.pdf", "wb") as output:
        writer.write(output)
```

#### Extract Metadata
```python
reader = PdfReader("document.pdf")
meta = reader.metadata
print(f"Title: {meta.title}")
print(f"Author: {meta.author}")
print(f"Subject: {meta.subject}")
print(f"Creator: {meta.creator}")
```

#### Rotate Pages
```python
reader = PdfReader("input.pdf")
writer = PdfWriter()

page = reader.pages[0]
page.rotate(90)  # Rotate 90 degrees clockwise
writer.add_page(page)

with open("rotated.pdf", "wb") as output:
    writer.write(output)
```

### pdfplumber - Text and Table Extraction

#### Extract Text with Layout
```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        print(text)
```

#### Extract Tables
```python
with pdfplumber.open("document.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for j, table in enumerate(tables):
            print(f"Table {j+1} on page {i+1}:")
            for row in table:
                print(row)
```

#### Advanced Table Extraction
```python
import pandas as pd

with pdfplumber.open("document.pdf") as pdf:
    all_tables = []
    for page in pdf.pages:
        tables = page.extract_tables()
        for table in tables:
            if table:  # Check if table is not empty
                df = pd.DataFrame(table[1:], columns=table[0])
                all_tables.append(df)

# Combine all tables
if all_tables:
    combined_df = pd.concat(all_tables, ignore_index=True)
    combined_df.to_excel("extracted_tables.xlsx", index=False)
```

### reportlab - Create PDFs

#### Basic PDF Creation
```python
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

c = canvas.Canvas("hello.pdf", pagesize=letter)
width, height = letter

# Add text
c.drawString(100, height - 100, "Hello World!")
c.drawString(100, height - 120, "This is a PDF created with reportlab")

# Add a line
c.line(100, height - 140, 400, height - 140)

# Save
c.save()
```

#### Create PDF with Multiple Pages
```python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate("report.pdf", pagesize=letter)
styles = getSampleStyleSheet()
story = []

# Add content
title = Paragraph("Report Title", styles['Title'])
story.append(title)
story.append(Spacer(1, 12))

body = Paragraph("This is the body of the report. " * 20, styles['Normal'])
story.append(body)
story.append(PageBreak())

# Page 2
story.append(Paragraph("Page 2", styles['Heading1']))
story.append(Paragraph("Content for page 2", styles['Normal']))

# Build PDF
doc.build(story)
```

#### 🎨 Modern & Aesthetic PDF Design (Unique Styling & Custom Backgrounds)

Standard PDFs with plain white paper, default margins, and raw black text look boring and unpolished. Use these modern design patterns to craft documents with exceptional visual taste.

##### 1. Aesthetic Color Palettes

Always define a cohesive color theme using `reportlab.lib.colors.HexColor`:

* **Dark Executive / Modern Cyber**:
  - Background: `#0F172A` (Deep Slate)
  - Card/Surface Fill: `#1E293B` (Lighter Slate)
  - Primary Accent: `#6366F1` (Indigo) or `#10B981` (Emerald)
  - Text Primary: `#F8FAFC`, Text Muted: `#94A3B8`, Dividers: `#334155`

* **Warm Editorial / Scandinavian**:
  - Background: `#FAF8F5` (Warm Cream / Soft Paper)
  - Card/Surface Fill: `#FFFFFF`
  - Primary Accent: `#D97706` (Amber / Terracotta) or `#0D9488` (Teal)
  - Text Primary: `#1E293B`, Text Muted: `#64748B`, Dividers: `#E2E8F0`

* **Clean Tech / Minimalist**:
  - Background: `#F8FAFC` (Ghost White)
  - Primary Accent: `#2563EB` (Royal Blue)
  - Text Primary: `#0F172A`, Text Muted: `#64748B`

##### 2. Full-Bleed Page Background & Accent Ribbons

Use the `onFirstPage` and `onLaterPages` canvas hooks in `doc.build(story, onFirstPage=draw_bg, onLaterPages=draw_bg)`:

```python
from reportlab.lib import colors

def draw_aesthetic_bg(canvas, doc, is_dark=True):
    canvas.saveState()
    width, height = doc.pagesize

    # 1. Full-bleed page background color
    bg_color = colors.HexColor('#0F172A') if is_dark else colors.HexColor('#FAF8F5')
    canvas.setFillColor(bg_color)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)

    # 2. Top accent ribbon / header bar
    accent_color = colors.HexColor('#6366F1') if is_dark else colors.HexColor('#2563EB')
    canvas.setFillColor(accent_color)
    canvas.rect(0, height - 8, width, 8, fill=1, stroke=0)

    # 3. Clean running footer with page numbering
    footer_text_color = colors.HexColor('#64748B')
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(footer_text_color)
    canvas.drawString(54, 32, "CONFIDENTIAL — FOR INTERNAL USE ONLY")
    canvas.drawRightString(width - 54, 32, f"Page {doc.page}")

    # 4. Subtle footer separator line
    canvas.setStrokeColor(colors.HexColor('#334155') if is_dark else colors.HexColor('#E2E8F0'))
    canvas.setLineWidth(0.5)
    canvas.line(54, 46, width - 54, 46)

    canvas.restoreState()
```

##### 3. Metric & Stat Callout Cards

Create modern stat cards by wrapping content inside a 1-row `Table` styled as a container:

```python
from reportlab.platypus import Table, TableStyle, Paragraph
from reportlab.lib import colors

def create_metric_card(label, value, change="+18.4%", is_dark=True):
    val_color = "#F8FAFC" if is_dark else "#0F172A"
    lbl_color = "#94A3B8" if is_dark else "#64748B"
    card_bg = colors.HexColor('#1E293B') if is_dark else colors.HexColor('#FFFFFF')
    border_color = colors.HexColor('#334155') if is_dark else colors.HexColor('#E2E8F0')

    card_data = [
        [Paragraph(f"<font color='{lbl_color}' size='9'><b>{label.upper()}</b></font>", styles['Normal'])],
        [Paragraph(f"<font color='{val_color}' size='20'><b>{value}</b></font>", styles['Normal'])],
        [Paragraph(f"<font color='#10B981' size='9'><b>↑ {change}</b> vs last month</font>", styles['Normal'])],
    ]
    card = Table(card_data, colWidths=[160])
    card.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), card_bg),
        ('BOX', (0,0), (-1,-1), 1, border_color),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    return card
```

##### 4. Complete Production Template (Copy-Paste Ready)

```python
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def generate_modern_pdf(filename="executive_summary.pdf", theme="dark"):
    is_dark = theme == "dark"
    bg_hex = "#0F172A" if is_dark else "#FAF8F5"
    surface_hex = "#1E293B" if is_dark else "#FFFFFF"
    text_hex = "#F8FAFC" if is_dark else "#0F172A"
    muted_hex = "#94A3B8" if is_dark else "#64748B"
    accent_hex = "#6366F1" if is_dark else "#2563EB"
    border_hex = "#334155" if is_dark else "#E2E8F0"

    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=30,
        textColor=colors.HexColor(text_hex)
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=11,
        leading=16,
        textColor=colors.HexColor(muted_hex)
    )

    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=15,
        textColor=colors.HexColor(text_hex)
    )

    story = [
        Spacer(1, 10),
        Paragraph("Executive Performance Briefing", title_style),
        Paragraph("Quarterly Operational & Financial Analytics", subtitle_style),
        Spacer(1, 20),
    ]

    # Metrics Row: 3 side-by-side cards
    def mini_card(lbl, val, chg):
        c_data = [
            [Paragraph(f"<font color='{muted_hex}' size='8'><b>{lbl}</b></font>", subtitle_style)],
            [Paragraph(f"<font color='{text_hex}' size='18'><b>{val}</b></font>", title_style)],
            [Paragraph(f"<font color='#10B981' size='8'><b>{chg}</b></font>", subtitle_style)],
        ]
        t = Table(c_data, colWidths=[162])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(surface_hex)),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor(border_hex)),
            ('PADDING', (0,0), (-1,-1), 8),
        ]))
        return t

    card_row = Table([[
        mini_card("TOTAL REVENUE", "$1,420,500", "+24.5%"),
        mini_card("ACTIVE USERS", "84,320", "+12.1%"),
        mini_card("RETENTION RATE", "94.8%", "+3.2%")
    ]], colWidths=[168, 168, 168])
    card_row.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
    story.append(card_row)
    story.append(Spacer(1, 25))

    # Styled Data Table
    table_data = [
        [Paragraph(f"<font color='{muted_hex}'><b>MODULE / DIVISION</b></font>", subtitle_style),
         Paragraph(f"<font color='{muted_hex}'><b>STATUS</b></font>", subtitle_style),
         Paragraph(f"<font color='{muted_hex}'><b>Q3 PERFORMANCE</b></font>", subtitle_style)],
        [Paragraph("AI Infrastructure Pipeline", body_style), Paragraph("<font color='#10B981'><b>OPERATIONAL</b></font>", body_style), Paragraph("99.98% Uptime", body_style)],
        [Paragraph("Model Router & Endpoints", body_style), Paragraph("<font color='#10B981'><b>OPERATIONAL</b></font>", body_style), Paragraph("142ms Latency", body_style)],
        [Paragraph("Autonomous Sandbox Engine", body_style), Paragraph("<font color='#6366F1'><b>SCALING</b></font>", body_style), Paragraph("+45% Throughput", body_style)],
    ]
    data_table = Table(table_data, colWidths=[200, 150, 154])
    data_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor(surface_hex)),
        ('LINEBELOW', (0,0), (-1,0), 1.5, colors.HexColor(accent_hex)),
        ('LINEBELOW', (0,1), (-1,-1), 0.5, colors.HexColor(border_hex)),
        ('PADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(data_table)

    def on_page(canvas, d):
        canvas.saveState()
        w, h = d.pagesize
        canvas.setFillColor(colors.HexColor(bg_hex))
        canvas.rect(0, 0, w, h, fill=1, stroke=0)
        canvas.setFillColor(colors.HexColor(accent_hex))
        canvas.rect(0, h - 8, w, 8, fill=1, stroke=0)
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.HexColor(muted_hex))
        canvas.drawString(54, 30, "SUPERSYSTEMS CONFIDENTIAL")
        canvas.drawRightString(w - 54, 30, f"Page {d.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)

if __name__ == '__main__':
    generate_modern_pdf("modern_report.pdf", theme="dark")
```

#### Subscripts and Superscripts

**IMPORTANT**: Never use Unicode subscript/superscript characters (₀₁₂₃₄₅₆₇₈₉, ⁰¹²³⁴⁵⁶⁷⁸⁹) in ReportLab PDFs. The built-in fonts do not include these glyphs, causing them to render as solid black boxes.

Instead, use ReportLab's XML markup tags in Paragraph objects:
```python
from reportlab.platypus import Paragraph
from reportlab.lib.styles import getSampleStyleSheet

styles = getSampleStyleSheet()

# Subscripts: use <sub> tag
chemical = Paragraph("H<sub>2</sub>O", styles['Normal'])

# Superscripts: use <super> tag
squared = Paragraph("x<super>2</super> + y<super>2</super>", styles['Normal'])
```

For canvas-drawn text (not Paragraph objects), manually adjust font the size and position rather than using Unicode subscripts/superscripts.

## Command-Line Tools

### pdftotext (poppler-utils)
```bash
# Extract text
pdftotext input.pdf output.txt

# Extract text preserving layout
pdftotext -layout input.pdf output.txt

# Extract specific pages
pdftotext -f 1 -l 5 input.pdf output.txt  # Pages 1-5
```

### qpdf
```bash
# Merge PDFs
qpdf --empty --pages file1.pdf file2.pdf -- merged.pdf

# Split pages
qpdf input.pdf --pages . 1-5 -- pages1-5.pdf
qpdf input.pdf --pages . 6-10 -- pages6-10.pdf

# Rotate pages
qpdf input.pdf output.pdf --rotate=+90:1  # Rotate page 1 by 90 degrees

# Remove password
qpdf --password=mypassword --decrypt encrypted.pdf decrypted.pdf
```

### pdftk (if available)
```bash
# Merge
pdftk file1.pdf file2.pdf cat output merged.pdf

# Split
pdftk input.pdf burst

# Rotate
pdftk input.pdf rotate 1east output rotated.pdf
```

## Common Tasks

### Extract Text from Scanned PDFs
```python
# Requires: pip install pytesseract pdf2image
import pytesseract
from pdf2image import convert_from_path

# Convert PDF to images
images = convert_from_path('scanned.pdf')

# OCR each page
text = ""
for i, image in enumerate(images):
    text += f"Page {i+1}:\n"
    text += pytesseract.image_to_string(image)
    text += "\n\n"

print(text)
```

### Add Watermark
```python
from pypdf import PdfReader, PdfWriter

# Create watermark (or load existing)
watermark = PdfReader("watermark.pdf").pages[0]

# Apply to all pages
reader = PdfReader("document.pdf")
writer = PdfWriter()

for page in reader.pages:
    page.merge_page(watermark)
    writer.add_page(page)

with open("watermarked.pdf", "wb") as output:
    writer.write(output)
```

### Extract Images
```bash
# Using pdfimages (poppler-utils)
pdfimages -j input.pdf output_prefix

# This extracts all images as output_prefix-000.jpg, output_prefix-001.jpg, etc.
```

### Password Protection
```python
from pypdf import PdfReader, PdfWriter

reader = PdfReader("input.pdf")
writer = PdfWriter()

for page in reader.pages:
    writer.add_page(page)

# Add password
writer.encrypt("userpassword", "ownerpassword")

with open("encrypted.pdf", "wb") as output:
    writer.write(output)
```

## Quick Reference

| Task | Best Tool | Command/Code |
|------|-----------|--------------|
| Merge PDFs | pypdf | `writer.add_page(page)` |
| Split PDFs | pypdf | One page per file |
| Extract text | pdfplumber | `page.extract_text()` |
| Extract tables | pdfplumber | `page.extract_tables()` |
| Create PDFs | reportlab | Canvas or Platypus |
| Command line merge | qpdf | `qpdf --empty --pages ...` |
| OCR scanned PDFs | pytesseract | Convert to image first |
| Fill PDF forms | pdf-lib or pypdf (see FORMS.md) | See FORMS.md |

## Next Steps

- For advanced pypdfium2 usage, see REFERENCE.md
- For JavaScript libraries (pdf-lib), see REFERENCE.md
- If you need to fill out a PDF form, follow the instructions in FORMS.md
- For troubleshooting guides, see REFERENCE.md
