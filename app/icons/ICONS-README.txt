Waggle Installer Icons
======================

This directory holds icon assets for the NSIS installer and app branding.
The Tauri build references icons from src-tauri/icons/ for the main app icon.

Required assets (replace placeholders with real designs):

  icon.ico    — Main application icon (256x256, multi-resolution .ico)
                Used for: app window, taskbar, installer, desktop shortcut
                Location: src-tauri/icons/icon.ico (already exists as placeholder)

  icon.png    — PNG version (512x512 recommended)
                Used for: web display, documentation, store listings

  header.bmp  — NSIS installer header image (150x57 pixels, 24-bit BMP)
                Shown at top-right of installer wizard pages

  sidebar.bmp — NSIS installer sidebar image (164x314 pixels, 24-bit BMP)
                Shown on welcome and finish pages

Design guidelines:
  - Waggle brand: honeycomb/bee/swarm motif
  - Primary colors: amber/gold (#F59E0B) on dark (#1E1B4B)
  - Clean, modern, recognizable at small sizes
