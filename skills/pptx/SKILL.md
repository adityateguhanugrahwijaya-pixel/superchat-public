---
name: pptx
description: Presentation slide deck generation (.pptx) with clean layouts, bullet points, cards, and shapes using python-pptx.
triggers:
  - pptx
  - slide
  - slides
  - presentation
  - pitch
  - deck
dependencies:
  - python-pptx
---

# Presentation Slide Deck (.pptx) Skill Guide

## Overview
Guidelines for creating clean, modern, 16:9 widescreen presentations using `python-pptx`.

---

## 1. Professional Presentation Recipe

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def create_presentation(filename="outputs/architecture_pitch.pptx"):
    prs = Presentation()
    
    # 1. Force 16:9 Modern Widescreen
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    
    # Theme Palette
    COLOR_BG = RGBColor(0x0F, 0x17, 0x2A)       # Dark Navy
    COLOR_CARD = RGBColor(0x1E, 0x29, 0x3B)     # Slate 800
    COLOR_TEXT = RGBColor(0xF8, 0xFA, 0xFC)     # Slate 50
    COLOR_MUTED = RGBColor(0x94, 0xA3, 0xB8)    # Slate 400
    COLOR_ACCENT = RGBColor(0x38, 0xBD, 0xF8)   # Sky 400
    
    blank_layout = prs.slide_layouts[6]  # Blank slide
    
    # ==========================
    # SLIDE 1: Title Slide
    # ==========================
    s1 = prs.slides.add_slide(blank_layout)
    bg1 = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    bg1.fill.solid()
    bg1.fill.fore_color.rgb = COLOR_BG
    bg1.line.fill.background()
    
    title_box = s1.shapes.add_textbox(Inches(1.5), Inches(2.5), Inches(10.33), Inches(2.5))
    tf1 = title_box.text_frame
    tf1.word_wrap = True
    
    p1 = tf1.paragraphs[0]
    p1.text = "Next-Gen Autonomous Agent Engine"
    p1.font.name = "Arial"
    p1.font.size = Pt(40)
    p1.font.bold = True
    p1.font.color.rgb = COLOR_TEXT
    
    p2 = tf1.add_paragraph()
    p2.text = "Architecture, Sandboxing, & Progressive Disclosure"
    p2.font.name = "Arial"
    p2.font.size = Pt(20)
    p2.font.color.rgb = COLOR_ACCENT
    p2.space_before = Pt(12)
    
    # ==========================
    # SLIDE 2: 3-Column Card Layout
    # ==========================
    s2 = prs.slides.add_slide(blank_layout)
    bg2 = s2.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
    bg2.fill.solid()
    bg2.fill.fore_color.rgb = COLOR_BG
    bg2.line.fill.background()
    
    # Slide Title
    header_box = s2.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.33), Inches(1.0))
    h_tf = header_box.text_frame
    hp = h_tf.paragraphs[0]
    hp.text = "Core Architectural Pillars"
    hp.font.name = "Arial"
    hp.font.size = Pt(28)
    hp.font.bold = True
    hp.font.color.rgb = COLOR_TEXT
    
    # 3 Cards
    cards = [
        ("Process Isolation", "Deterministic process group termination with SIGTERM and SIGKILL cascade."),
        ("Tool Registry", "Strict JSON schema validation with transparent provider alias normalization."),
        ("Skill System", "On-demand progressive disclosure keeping context token usage minimal."),
    ]
    
    card_w = Inches(3.5)
    card_h = Inches(4.5)
    card_y = Inches(2.0)
    gap = Inches(0.4)
    start_x = Inches(1.0)
    
    for i, (c_title, c_desc) in enumerate(cards):
        cx = start_x + i * (card_w + gap)
        card_shape = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, cx, card_y, card_w, card_h)
        card_shape.fill.solid()
        card_shape.fill.fore_color.rgb = COLOR_CARD
        card_shape.line.color.rgb = RGBColor(0x33, 0x41, 0x55)
        
        c_tf = card_shape.text_frame
        c_tf.word_wrap = True
        c_tf.margin_top = Inches(0.4)
        c_tf.margin_left = Inches(0.3)
        c_tf.margin_right = Inches(0.3)
        
        cp1 = c_tf.paragraphs[0]
        cp1.text = c_title
        cp1.font.name = "Arial"
        cp1.font.size = Pt(18)
        cp1.font.bold = True
        cp1.font.color.rgb = COLOR_ACCENT
        
        cp2 = c_tf.add_paragraph()
        cp2.text = c_desc
        cp2.font.name = "Arial"
        cp2.font.size = Pt(13)
        cp2.font.color.rgb = COLOR_MUTED
        cp2.space_before = Pt(14)
        
    prs.save(filename)
    print(f"Presentation saved to {filename}")

if __name__ == "__main__":
    create_presentation()
```

---

## Common Pitfalls
1. **4:3 Aspect Ratio Default**: By default python-pptx creates old 4:3 boxy slides. Always set `prs.slide_width = Inches(13.333)` and `prs.slide_height = Inches(7.5)` for modern widescreen displays.
2. **Word Wrap**: Always set `text_frame.word_wrap = True` on text boxes to avoid text spilling past slide borders.
