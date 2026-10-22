---
name: docx
description: Microsoft Word (.docx) document creation and editing with structured headings, tables, bullet lists, and styles using python-docx.
triggers:
  - docx
  - word
  - doc
  - proposal
  - agreement
dependencies:
  - python-docx
---

# Word Document (.docx) Skill Guide

## Overview
Guidelines for creating clean, professional Microsoft Word documents using `python-docx`.

---

## 1. Document Creation Recipe

```python
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, hex_color):
    shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shading)

def create_proposal(filename="outputs/project_proposal.docx"):
    doc = docx.Document()
    
    # 1. Page Margins
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)
        
    # 2. Document Title
    title = doc.add_paragraph()
    title_run = title.add_run("Enterprise AI Integration Proposal")
    title_run.font.name = "Arial"
    title_run.font.size = Pt(22)
    title_run.font.bold = True
    title_run.font.color.rgb = RGBColor(0x0F, 0x17, 0x2A)
    title.space_after = Pt(4)
    
    subtitle = doc.add_paragraph()
    sub_run = subtitle.add_run("Prepared for Executive Committee • Confidential")
    sub_run.font.name = "Arial"
    sub_run.font.size = Pt(10)
    sub_run.font.italic = True
    sub_run.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)
    subtitle.space_after = Pt(18)
    
    # 3. Section Heading
    h1 = doc.add_heading("1. Executive Summary", level=1)
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(6)
    
    p = doc.add_paragraph(
        "This proposal outlines the deployment of autonomous coding agents and isolated execution sandboxes "
        "to accelerate internal development velocity while maintaining strict host security guarantees."
    )
    p.paragraph_format.line_spacing = 1.15
    p.paragraph_format.space_after = Pt(12)
    
    # 4. Bullet Points
    bullets = [
        ("Sub-second Tool Execution", "Local process runner with instant fallback capabilities."),
        ("Strict Boundary Defense", "Ancestor realpath verification preventing directory symlink escapes."),
        ("Binary-Intact Pipelines", "Native handling for PDF, Excel, image, and office documents."),
    ]
    for b_title, b_desc in bullets:
        bp = doc.add_paragraph(style='List Bullet')
        run_bold = bp.add_run(f"{b_title}: ")
        run_bold.bold = True
        bp.add_run(b_desc)
        bp.paragraph_format.space_after = Pt(4)
        
    # 5. Styled Table
    doc.add_heading("2. Implementation Roadmap", level=1)
    table = doc.add_table(rows=1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    
    headers = ["Phase", "Milestone", "Duration"]
    widths = [Inches(1.5), Inches(3.5), Inches(1.5)]
    
    hdr_cells = table.rows[0].cells
    for i, h_text in enumerate(headers):
        hdr_cells[i].text = h_text
        hdr_cells[i].width = widths[i]
        set_cell_background(hdr_cells[i], "1E293B")
        for p in hdr_cells[i].paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for run in p.runs:
                run.font.bold = True
                run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
                
    data = [
        ["Phase 1", "Host Sandboxing & Path Resolution", "1 Week"],
        ["Phase 2", "Resilient Engine & Legacy Parity", "1 Week"],
        ["Phase 3", "Tool Registry & Present Files", "3 Days"],
    ]
    
    for phase, desc, dur in data:
        row_cells = table.add_row().cells
        for i, val in enumerate([phase, desc, dur]):
            row_cells[i].text = val
            row_cells[i].width = widths[i]
            row_cells[i].vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            
    doc.save(filename)
    print(f"Word document saved to {filename}")

if __name__ == "__main__":
    create_proposal()
```

---

## Common Pitfalls
1. **Column Widths in python-docx**: Setting width on table columns is ignored by Word unless you explicitly set the width on each individual cell in `table.rows[i].cells[j].width`.
2. **Missing Line Spacing**: Default Word templates can have awkward gaps. Explicitly set `paragraph_format.space_after` and `line_spacing`.
