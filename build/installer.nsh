; ============================================================================
;  Upscayl-Next modern NSIS installer
;  SPDX-License-Identifier: AGPL-3.0-or-later
;
;  Copyright (C) 2024-2026 Upscayl-Next contributors.
;  Based on Upscayl by Nayam Amarshe and TGS963 (AGPL-3.0).
;
;  All artwork used here is generated from build/icon.png by
;  scripts/generate-installer-assets.ps1. No third-party icons, photos,
;  music or video clips are bundled. The installer shows the AGPL-3.0
;  notice and upstream credits, and the full LICENSE file is installed
;  with the application.
;
;  electron-builder includes this file through the "nsis.include" option.
;  Because the include is placed at the very top of the generated script,
;  only built-in NSIS variables and variables declared here may be used.
;  electron-builder variables such as $launchLink are declared later.
; ============================================================================

; ---------------------------------------------------------------------------
; Modern palette. SetCtlColors expects a Windows COLORREF (BGR order).
; The RGB comments document the intended colors for maintainers.
; ---------------------------------------------------------------------------
!define UPN_BG       0x2E1E1E   ; #1E1E2E  deep indigo
!define UPN_BG_SOFT  0x231A1A   ; #1A1A23  softer panel
!define UPN_TEXT     0xF6F3F3   ; #F3F3F6  near white
!define UPN_MUTED    0xBCA9A9   ; #A9A9BC  muted lavender grey
!define UPN_ACCENT   0xED3A7C   ; #7C3AED  violet accent
!define UPN_SUCCESS  0x7CD67C   ; #7CD67C  mint success

; MUI header/branding colors. These must be set before MUI2.nsh is included.
; MUI passes these strings to SetCtlColors, which expects COLORREF (BGR):
;   #1E1E2E RGB -> "2E1E1E" BGR,  #F3F3F6 RGB -> "F6F3F3" BGR.
!define MUI_BGCOLOR   "2E1E1E"
!define MUI_TEXTCOLOR "F6F3F3"

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

; ---------------------------------------------------------------------------
; Installer-only pages. The uninstaller build must not declare these.
; ---------------------------------------------------------------------------
!ifndef BUILD_UNINSTALLER

  Var WelcomeDialog
  Var WelcomeAnim
  Var CreditsDialog
  Var CreditsAnim
  Var CreditsCheckbox
  Var OptionsDialog
  Var OptionsAnim
  Var NativeBackendCheckbox
  Var FinishDialog
  Var FinishAnim
  Var FinishRunCheckbox

  Var InstallerPrevOutDir
  Var InstallNativeBackend
  Var AcceptLicense
  Var LaunchAfterFinish

  ; .onInit defaults. Called by electron-builder before any page is shown.
  !macro customInit
    StrCpy $InstallerPrevOutDir ""
    StrCpy $InstallNativeBackend "0"
    StrCpy $AcceptLicense "0"
    StrCpy $LaunchAfterFinish "1"
  !macroend

  ; -------------------------------------------------------------------------
  ; 1. Welcome page (animated banner)
  ; -------------------------------------------------------------------------
  !macro customWelcomePage
    Page custom WelcomePageCreate WelcomePageLeave
    Page custom CreditsPageCreate CreditsPageLeave
  !macroend

  Function WelcomePageCreate
    !insertmacro MUI_HEADER_TEXT "Welcome to Upscayl-Next" "AI image and video upscaling, simplified"

    nsDialogs::Create 1018
    Pop $WelcomeDialog
    ${If} $WelcomeDialog == error
      Abort
    ${EndIf}

    ; All layout uses dialog units (the "u" suffix). The NSIS page template
    ; is 300x140 DLU, so mixing pixel coordinates made the controls tiny and
    ; left large blank areas.
    ${NSD_CreateAnimation} 10u 0u 280u 80u ""
    Pop $WelcomeAnim

    StrCpy $InstallerPrevOutDir $OUTDIR
    InitPluginsDir
    SetOutPath "$PLUGINSDIR\upscayl-installer"
    File "/oname=welcome.avi" "${BUILD_RESOURCES_DIR}\anim\welcome.avi"
    ${NSD_Anim_OpenFile} $WelcomeAnim "$PLUGINSDIR\upscayl-installer\welcome.avi"
    ${NSD_Anim_Play} $WelcomeAnim

    ; Violet accent divider. Only this decorative control overrides colors;
    ; text and checkboxes keep the standard, readable MUI colors.
    ${NSD_CreateLabel} 0u 84u 300u 2u "."
    Pop $0
    SetCtlColors $0 ${UPN_ACCENT} ${UPN_ACCENT}

    ${NSD_CreateLabel} 0u 90u 300u 10u "Upscayl-Next is a free and open-source AI upscaler."
    Pop $0

    ${NSD_CreateLabel} 0u 102u 300u 28u "Requires a Vulkan-capable GPU with a current driver.$\r$\nClick Next to review the license and choose a folder."
    Pop $0

    nsDialogs::Show
  FunctionEnd

  Function WelcomePageLeave
    ${If} $WelcomeAnim != ""
      ${NSD_Anim_Stop} $WelcomeAnim
      ${NSD_Anim_Close} $WelcomeAnim
    ${EndIf}
    ${If} $InstallerPrevOutDir != ""
      SetOutPath "$InstallerPrevOutDir"
    ${EndIf}
  FunctionEnd


  ; -------------------------------------------------------------------------
  ; 2. License and credits page (animated, AGPL-3.0 notice)
  ; -------------------------------------------------------------------------
  Function CreditsPageCreate
    !insertmacro MUI_HEADER_TEXT "License and credits" "Open source, built on the shoulders of giants"

    nsDialogs::Create 1018
    Pop $CreditsDialog
    ${If} $CreditsDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateAnimation} 10u 0u 280u 56u ""
    Pop $CreditsAnim

    StrCpy $InstallerPrevOutDir $OUTDIR
    InitPluginsDir
    SetOutPath "$PLUGINSDIR\upscayl-installer"
    File "/oname=credits.avi" "${BUILD_RESOURCES_DIR}\anim\credits.avi"
    ${NSD_Anim_OpenFile} $CreditsAnim "$PLUGINSDIR\upscayl-installer\credits.avi"
    ${NSD_Anim_Play} $CreditsAnim

    ${NSD_CreateLabel} 0u 62u 300u 10u "Upscayl-Next is released under the GNU AGPL-3.0."
    Pop $0

    ${NSD_CreateLabel} 0u 74u 300u 40u "Based on Upscayl by Nayam Amarshe and TGS963.$\r$\nNCNN: upscayl/upscayl-ncnn. Real-ESRGAN: Xintao Wang.$\r$\nModels: Helaman, Foolhardy, Kim2091.$\r$\nFull license is installed with the app."
    Pop $0

    ${NSD_CreateCheckbox} 0u 118u 300u 12u "I accept the AGPL-3.0 license and the credits above."
    Pop $CreditsCheckbox
    ${If} $AcceptLicense == "1"
      ${NSD_Check} $CreditsCheckbox
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function CreditsPageLeave
    ${NSD_GetState} $CreditsCheckbox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $AcceptLicense "1"
    ${Else}
      StrCpy $AcceptLicense "0"
      MessageBox MB_ICONEXCLAMATION|MB_OK "You must accept the AGPL-3.0 license and the credits to continue."
      Abort
    ${EndIf}

    ${If} $CreditsAnim != ""
      ${NSD_Anim_Stop} $CreditsAnim
      ${NSD_Anim_Close} $CreditsAnim
    ${EndIf}
    ${If} $InstallerPrevOutDir != ""
      SetOutPath "$InstallerPrevOutDir"
    ${EndIf}
  FunctionEnd


  ; -------------------------------------------------------------------------
  ; 3. Optional AI backend page (after the install directory page)
  ; -------------------------------------------------------------------------
  !macro customPageAfterChangeDir
    Page custom OptionsPageCreate OptionsPageLeave
  !macroend

  Function OptionsPageCreate
    !insertmacro MUI_HEADER_TEXT "Installation options" "Tailor Upscayl-Next to your workflow"

    nsDialogs::Create 1018
    Pop $OptionsDialog
    ${If} $OptionsDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateAnimation} 10u 0u 280u 56u ""
    Pop $OptionsAnim

    StrCpy $InstallerPrevOutDir $OUTDIR
    InitPluginsDir
    SetOutPath "$PLUGINSDIR\upscayl-installer"
    File "/oname=options.avi" "${BUILD_RESOURCES_DIR}\anim\options.avi"
    ${NSD_Anim_OpenFile} $OptionsAnim "$PLUGINSDIR\upscayl-installer\options.avi"
    ${NSD_Anim_Play} $OptionsAnim

    ${NSD_CreateLabel} 0u 62u 300u 10u "Optional native AI backend"
    Pop $0

    ${NSD_CreateLabel} 0u 74u 300u 30u "HAT, DAT and SUPIR models run in a Python backend.$\r$\nIt needs Python 3.10/3.11, internet and about 2 GB.$\r$\nYou can install it later from the Start Menu."
    Pop $0

    ${NSD_CreateCheckbox} 0u 108u 300u 12u "Install the optional AI backend now"
    Pop $NativeBackendCheckbox
    ${If} $InstallNativeBackend == "1"
      ${NSD_Check} $NativeBackendCheckbox
    ${EndIf}

    ${NSD_CreateLabel} 0u 124u 300u 10u "You can run this later from the Start Menu shortcut."
    Pop $0

    nsDialogs::Show
  FunctionEnd

  Function OptionsPageLeave
    ${NSD_GetState} $NativeBackendCheckbox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $InstallNativeBackend "1"
    ${Else}
      StrCpy $InstallNativeBackend "0"
    ${EndIf}

    ${If} $OptionsAnim != ""
      ${NSD_Anim_Stop} $OptionsAnim
      ${NSD_Anim_Close} $OptionsAnim
    ${EndIf}
    ${If} $InstallerPrevOutDir != ""
      SetOutPath "$InstallerPrevOutDir"
    ${EndIf}
  FunctionEnd


  ; -------------------------------------------------------------------------
  ; 4. Finish page (animated, launch checkbox)
  ; -------------------------------------------------------------------------
  !macro customFinishPage
    Page custom FinishPageCreate FinishPageLeave
  !macroend

  Function FinishPageCreate
    !insertmacro MUI_HEADER_TEXT "Installation complete" "Upscayl-Next is ready"

    nsDialogs::Create 1018
    Pop $FinishDialog
    ${If} $FinishDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateAnimation} 10u 0u 280u 80u ""
    Pop $FinishAnim

    StrCpy $InstallerPrevOutDir $OUTDIR
    InitPluginsDir
    SetOutPath "$PLUGINSDIR\upscayl-installer"
    File "/oname=finish.avi" "${BUILD_RESOURCES_DIR}\anim\finish.avi"
    ${NSD_Anim_OpenFile} $FinishAnim "$PLUGINSDIR\upscayl-installer\finish.avi"
    ${NSD_Anim_Play} $FinishAnim

    ${NSD_CreateLabel} 0u 86u 300u 10u "Thank you for installing Upscayl-Next."
    Pop $0

    ${NSD_CreateLabel} 0u 98u 300u 10u "The app, models and shortcuts are ready to use."
    Pop $0

    ${NSD_CreateCheckbox} 0u 112u 300u 12u "Launch Upscayl-Next now"
    Pop $FinishRunCheckbox
    ${If} $LaunchAfterFinish == "1"
      ${NSD_Check} $FinishRunCheckbox
    ${EndIf}

    ; This page replaces MUI_PAGE_FINISH, so set its button text and hide Back.
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:Finish"
    GetDlgItem $0 $HWNDPARENT 3
    ShowWindow $0 ${SW_HIDE}

    nsDialogs::Show
  FunctionEnd

  Function FinishPageLeave
    ${NSD_GetState} $FinishRunCheckbox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $LaunchAfterFinish "1"
      ; Launch through the user's shell. Explorer runs as the logged-in user,
      ; so the app does not inherit the installer's elevated token. This avoids
      ; a dependency on the optional StdUtils plugin. APP_EXECUTABLE_FILENAME is
      ; defined later in common.nsh, so use PRODUCT_FILENAME here.
      Exec '"$WINDIR\explorer.exe" "$INSTDIR\${PRODUCT_FILENAME}.exe"'
    ${Else}
      StrCpy $LaunchAfterFinish "0"
    ${EndIf}

    ${If} $FinishAnim != ""
      ${NSD_Anim_Stop} $FinishAnim
      ${NSD_Anim_Close} $FinishAnim
    ${EndIf}
    ${If} $InstallerPrevOutDir != ""
      SetOutPath "$InstallerPrevOutDir"
    ${EndIf}
  FunctionEnd


  ; -------------------------------------------------------------------------
  ; 5. Post-install work: shortcut for the optional backend + optional setup
  ; -------------------------------------------------------------------------
  !macro customInstall
    ; The launcher self-elevates so the user can install the backend later
    ; without opening a terminal. It lives in resources\native.
    CreateShortcut "$SMPROGRAMS\Upscayl-Next - Set up AI backend.lnk" "powershell.exe" "-NoProfile -ExecutionPolicy Bypass -File $\"$INSTDIR\resources\native\setup-launcher.ps1$\"" "$INSTDIR\${PRODUCT_FILENAME}.exe" 0

    ${If} $InstallNativeBackend == "1"
      DetailPrint "Installing the optional AI backend (HAT/DAT/SUPIR). This can take several minutes..."
      nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\native\setup.ps1"'
      Pop $0
      ${If} $0 != 0
        MessageBox MB_ICONEXCLAMATION|MB_OK "The optional AI backend could not be installed automatically.$\r$\n$\r$\nYou can retry later from Start Menu > Upscayl-Next - Set up AI backend.$\r$\nUpscayl-Next still works with the bundled NCNN models."
      ${EndIf}
    ${EndIf}
  !macroend

!endif ; BUILD_UNINSTALLER

; ---------------------------------------------------------------------------
; Uninstaller cleanup. customUnInstall is inserted into the uninstaller build.
; ---------------------------------------------------------------------------
!macro customUnInstall
  Delete "$SMPROGRAMS\Upscayl-Next - Set up AI backend.lnk"
!macroend

