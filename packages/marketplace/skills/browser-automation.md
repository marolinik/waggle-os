---
name: browser-automation
description: Enable browser automation for web scraping, testing, and interaction
category: tools
tools: [browser_navigate, browser_screenshot, browser_click, browser_fill, browser_evaluate, browser_snapshot]
---

# Browser Automation

Enable your agent to control a web browser for:
- Web scraping and data extraction
- Form filling and testing
- Screenshot capture
- JavaScript execution on web pages

## Setup
Run this command in your Waggle installation directory:
```
npm install playwright-core
```

Then restart Waggle. Browser tools will be automatically available.

## Available Tools
- `browser_navigate` — Open a URL
- `browser_screenshot` — Capture page screenshot
- `browser_click` — Click elements
- `browser_fill` — Fill form fields
- `browser_evaluate` — Run JavaScript
- `browser_snapshot` — Get page DOM
