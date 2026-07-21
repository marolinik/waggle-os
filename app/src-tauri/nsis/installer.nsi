; Waggle-specific extensions for Tauri's NSIS installer.
;
; Tauri owns install location, shortcuts, finish-page launch, silent /R launch,
; registry entries, and uninstaller cleanup. Do not duplicate those here: doing
; so double-launched normal installs and made silent repair nondeterministic.
; Autostart is handled by tauri-plugin-autostart at runtime.
; Personal data is always preserved by the package uninstaller. Tauri's base
; uninstaller exposes a generic "Delete app data" checkbox, so PREUNINSTALL
; explicitly neutralizes that state. Destructive erasure is available only
; through Waggle's authenticated, phrase-gated UI.
;
; Reference: https://v2.tauri.app/distribute/windows-installer/#extending-the-installer

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Installing Waggle..."
  DetailPrint "Your personal AI agent workspace - powered by Waggle."
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  StrCmp $DeleteAppDataCheckboxState "1" 0 +2
  MessageBox MB_OK|MB_ICONINFORMATION \
    "For safety, Waggle always preserves app data during uninstall. Data can only be erased from Settings > Data & Privacy while Waggle is installed."
  StrCpy $DeleteAppDataCheckboxState 0
  DetailPrint "Preserving Waggle app data."
!macroend
