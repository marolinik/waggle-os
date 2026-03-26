; ─── Waggle NSIS Installer Template ──────────────────────────────────────────
;
; Custom hooks for the Tauri NSIS installer:
;   1. Welcome message with Waggle branding
;   2. Desktop shortcut creation
;   3. Start Menu entry
;   4. "Launch Waggle" on finish
;   5. Uninstaller with optional ~/.waggle/ data removal
;
; Tauri injects NSIS defines: PRODUCT_NAME, PRODUCT_VERSION, MAINBINARYNAME,
; DEFAULT_INSTALL_DIR. Autostart is handled by tauri-plugin-autostart at
; runtime, not by the installer.
;
; Reference: https://tauri.app/distribute/windows-installer/#nsis
; ─────────────────────────────────────────────────────────────────────────────

InstallDir "${DEFAULT_INSTALL_DIR}"

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Installing ${PRODUCT_NAME} v${PRODUCT_VERSION}..."
  DetailPrint "Your personal AI agent workspace — powered by Waggle."
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; ── Desktop shortcut ──────────────────────────────────────────────────────
  CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" \
    "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
  DetailPrint "Desktop shortcut created."

  ; ── Start Menu entry ──────────────────────────────────────────────────────
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" \
    "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0
  CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall ${PRODUCT_NAME}.lnk" \
    "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0
  DetailPrint "Start Menu entry created."

  ; ── Launch after install ──────────────────────────────────────────────────
  Exec '"$INSTDIR\${MAINBINARYNAME}.exe"'
  DetailPrint "Launching ${PRODUCT_NAME}..."
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; ── Remove desktop shortcut ─────────────────────────────────────────────
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"

  ; ── Remove Start Menu entries ───────────────────────────────────────────
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall ${PRODUCT_NAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"

  ; ── Ask about user data removal ─────────────────────────────────────────
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Waggle stores your data (agents, memories, configuration) in:$\r$\n$\r$\n\
     $PROFILE\.waggle$\r$\n$\r$\n\
     Do you want to remove this data as well?$\r$\n$\r$\n\
     Choose $\"Yes$\" to delete all data, or $\"No$\" to keep it for future use." \
    IDYES removeData IDNO skipData

  removeData:
    RMDir /r "$PROFILE\.waggle"
    DetailPrint "User data removed: $PROFILE\.waggle"
    Goto doneData

  skipData:
    DetailPrint "User data preserved: $PROFILE\.waggle"

  doneData:
!macroend
