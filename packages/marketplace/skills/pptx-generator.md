---
name: pptx-generator
description: Generate PowerPoint presentations using python-pptx
category: documents
builtIn: true
---

# PPTX Generator

Generate PowerPoint presentations. Use the bash tool to run a Python script with python-pptx.

## Workflow

1. Create a Python script that uses python-pptx to build the presentation
2. Run it with the bash tool
3. Return the file path to the user

## Requirements

- python3 with python-pptx installed (`pip install python-pptx`)

## Example Script

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN

prs = Presentation()

# Title slide
slide = prs.slides.add_slide(prs.slide_layouts[0])
slide.shapes.title.text = "Quarterly Report"
slide.placeholders[1].text = "Q1 2026 Results"

# Content slide
slide = prs.slides.add_slide(prs.slide_layouts[1])
slide.shapes.title.text = "Key Metrics"
body = slide.placeholders[1]
tf = body.text_frame
tf.text = "Revenue: $2.4M (+15% YoY)"
p = tf.add_paragraph()
p.text = "Active Users: 12,500 (+22%)"

prs.save("report.pptx")
print("Created report.pptx")
```

## Tips

- Use `prs.slide_layouts[0]` for title slides, `[1]` for content slides
- Add charts with `pptx.chart` module
- Add images with `slide.shapes.add_picture()`
- Set slide dimensions with `prs.slide_width` and `prs.slide_height`
