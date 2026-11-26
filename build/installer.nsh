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

  ; Localized UI strings populated from $LANGUAGE (set by NSIS language selector)
  Var StrWelcomeHeader
  Var StrWelcomeSub
  Var StrWelcomeLine1
  Var StrWelcomeLine2
  Var StrCreditsHeader
  Var StrCreditsSub
  Var StrCreditsLine1
  Var StrCreditsLine2
  Var StrCreditsCheck
  Var StrCreditsAlert
  Var StrOptionsHeader
  Var StrOptionsSub
  Var StrOptionsTitle
  Var StrOptionsDesc
  Var StrOptionsCheck
  Var StrOptionsHint
  Var StrFinishHeader
  Var StrFinishSub
  Var StrFinishLine1
  Var StrFinishLine2
  Var StrFinishLaunch
  Var StrFinishBtn

  ; .onInit defaults. Called by electron-builder after the language selector.
  !macro customInit
    StrCpy $InstallerPrevOutDir ""
    StrCpy $InstallNativeBackend "0"
    StrCpy $AcceptLicense "0"
    StrCpy $LaunchAfterFinish "1"

    ; Default: English (1033)
    StrCpy $StrWelcomeHeader "Welcome to Upscayl-Next"
    StrCpy $StrWelcomeSub "AI image and video upscaling, simplified"
    StrCpy $StrWelcomeLine1 "Upscayl-Next is a free and open-source AI upscaler."
    StrCpy $StrWelcomeLine2 "Requires a Vulkan-capable GPU with a current driver.$\r$\nClick Next to review the license and choose a folder."
    StrCpy $StrCreditsHeader "License and credits"
    StrCpy $StrCreditsSub "Open source, built on the shoulders of giants"
    StrCpy $StrCreditsLine1 "Upscayl-Next is released under the GNU AGPL-3.0."
    StrCpy $StrCreditsLine2 "Based on Upscayl by Nayam Amarshe and TGS963.$\r$\nNCNN: upscayl/upscayl-ncnn. Real-ESRGAN: Xintao Wang.$\r$\nModels: Helaman, Foolhardy, Kim2091.$\r$\nFull license is installed with the app."
    StrCpy $StrCreditsCheck "I accept the AGPL-3.0 license and the credits above."
    StrCpy $StrCreditsAlert "You must accept the AGPL-3.0 license and the credits to continue."
    StrCpy $StrOptionsHeader "Installation options"
    StrCpy $StrOptionsSub "Tailor Upscayl-Next to your workflow"
    StrCpy $StrOptionsTitle "Optional native AI backend"
    StrCpy $StrOptionsDesc "HAT, DAT and SUPIR models run in a Python backend.$\r$\nIt needs Python 3.10/3.11, internet and about 2 GB.$\r$\nYou can install it later from the Start Menu."
    StrCpy $StrOptionsCheck "Install the optional AI backend now"
    StrCpy $StrOptionsHint "You can run this later from the Start Menu shortcut."
    StrCpy $StrFinishHeader "Installation complete"
    StrCpy $StrFinishSub "Upscayl-Next is ready"
    StrCpy $StrFinishLine1 "Thank you for installing Upscayl-Next."
    StrCpy $StrFinishLine2 "The app, models and shortcuts are ready to use."
    StrCpy $StrFinishLaunch "Launch Upscayl-Next now"
    StrCpy $StrFinishBtn "Finish"

    ; Japanese (LCID 1041)
    ${If} $LANGUAGE == 1041
      StrCpy $StrWelcomeHeader "Upscayl-Next へようこそ"
      StrCpy $StrWelcomeSub "AI 画像・動画アップスケールをシンプルに"
      StrCpy $StrWelcomeLine1 "Upscayl-Next は無料のオープンソース AI アップスケーラーです。"
      StrCpy $StrWelcomeLine2 "最新の Vulkan 対応 GPU ドライバーが必要です。$\r$\n「次へ」をクリックしてライセンス確認とインストール先選択へ進みます。"
      StrCpy $StrCreditsHeader "ライセンスとクレジット"
      StrCpy $StrCreditsSub "オープンソースの力で構築されています"
      StrCpy $StrCreditsLine1 "Upscayl-Next は GNU AGPL-3.0 ライセンスで公開されています。"
      StrCpy $StrCreditsLine2 "Based on Upscayl by Nayam Amarshe and TGS963.$\r$\nNCNN: upscayl/upscayl-ncnn / Real-ESRGAN: Xintao Wang.$\r$\nModels: Helaman, Foolhardy, Kim2091.$\r$\nライセンス全文はアプリと一緒にインストールされます。"
      StrCpy $StrCreditsCheck "上記の AGPL-3.0 ライセンスとクレジットに同意します。"
      StrCpy $StrCreditsAlert "続行するには AGPL-3.0 ライセンスとクレジットに同意してください。"
      StrCpy $StrOptionsHeader "インストールオプション"
      StrCpy $StrOptionsSub "ワークフローに合わせて構成できます"
      StrCpy $StrOptionsTitle "オプションのネイティブ AI バックエンド"
      StrCpy $StrOptionsDesc "HAT / DAT / SUPIR モデルは Python バックエンドで動作します。$\r$\nPython 3.10/3.11・ネット接続・約 2GB の空き容量が必要です。$\r$\n後からスタートメニューから導入することもできます。"
      StrCpy $StrOptionsCheck "今すぐオプションの AI バックエンドをインストールする"
      StrCpy $StrOptionsHint "後からスタートメニューのショートカットで実行できます。"
      StrCpy $StrFinishHeader "インストール完了"
      StrCpy $StrFinishSub "Upscayl-Next の準備が整いました"
      StrCpy $StrFinishLine1 "Upscayl-Next をインストールしていただきありがとうございます。"
      StrCpy $StrFinishLine2 "アプリ・同梱モデル・ショートカットが利用可能になりました。"
      StrCpy $StrFinishLaunch "今すぐ Upscayl-Next を起動する"
      StrCpy $StrFinishBtn "完了"
    ${ElseIf} $LANGUAGE == 2052
      ; Simplified Chinese (LCID 2052)
      StrCpy $StrWelcomeHeader "欢迎使用 Upscayl-Next"
      StrCpy $StrWelcomeSub "简洁高效的 AI 图像与视频超分辨率工具"
      StrCpy $StrWelcomeLine1 "Upscayl-Next 是一款免费开源的 AI 放大工具。"
      StrCpy $StrWelcomeLine2 "需要支持 Vulkan 的显卡及最新驱动程序。$\r$\n点击“下一步”查看许可协议并选择安装目录。"
      StrCpy $StrCreditsHeader "许可协议与鸣谢"
      StrCpy $StrCreditsSub "开源共享，站在巨人的肩膀上"
      StrCpy $StrCreditsLine1 "Upscayl-Next 基于 GNU AGPL-3.0 协议发布。"
      StrCpy $StrCreditsLine2 "Based on Upscayl by Nayam Amarshe and TGS963.$\r$\nNCNN: upscayl/upscayl-ncnn / Real-ESRGAN: Xintao Wang.$\r$\nModels: Helaman, Foolhardy, Kim2091.$\r$\n完整许可证将随应用一起安装。"
      StrCpy $StrCreditsCheck "我接受 AGPL-3.0 许可协议及上述鸣谢声明。"
      StrCpy $StrCreditsAlert "必须接受 AGPL-3.0 许可协议和鸣谢声明才能继续。"
      StrCpy $StrOptionsHeader "安装选项"
      StrCpy $StrOptionsSub "按需定制 Upscayl-Next 组件"
      StrCpy $StrOptionsTitle "可选原生 AI 后端"
      StrCpy $StrOptionsDesc "HAT / DAT / SUPIR 模型运行在 Python 后端中。$\r$\n需要 Python 3.10/3.11、网络连接及约 2GB 空间。$\r$\n您也可以稍后从开始菜单安装。"
      StrCpy $StrOptionsCheck "立即安装可选 AI 后端"
      StrCpy $StrOptionsHint "稍后也可通过开始菜单快捷方式运行安装。"
      StrCpy $StrFinishHeader "安装完成"
      StrCpy $StrFinishSub "Upscayl-Next 已准备就绪"
      StrCpy $StrFinishLine1 "感谢安装 Upscayl-Next。"
      StrCpy $StrFinishLine2 "应用程序、内置模型与快捷方式均已就绪。"
      StrCpy $StrFinishLaunch "立即启动 Upscayl-Next"
      StrCpy $StrFinishBtn "完成"
    ${ElseIf} $LANGUAGE == 1042
      ; Korean (LCID 1042)
      StrCpy $StrWelcomeHeader "Upscayl-Next에 오신 것을 환영합니다"
      StrCpy $StrWelcomeSub "간편한 AI 이미지·동영상 업스케일링"
      StrCpy $StrWelcomeLine1 "Upscayl-Next는 무료 오픈소스 AI 업스케일러입니다."
      StrCpy $StrWelcomeLine2 "최신 드라이버가 설치된 Vulkan 지원 GPU가 필요합니다.$\r$\n다음을 클릭하여 라이선스를 확인하고 설치 폴더를 선택하세요."
      StrCpy $StrCreditsHeader "라이선스 및 크레딧"
      StrCpy $StrCreditsSub "오픈소스 커뮤니티와 함께합니다"
      StrCpy $StrCreditsLine1 "Upscayl-Next는 GNU AGPL-3.0 라이선스로 배포됩니다."
      StrCpy $StrCreditsLine2 "Based on Upscayl by Nayam Amarshe and TGS963.$\r$\nNCNN: upscayl/upscayl-ncnn / Real-ESRGAN: Xintao Wang.$\r$\nModels: Helaman, Foolhardy, Kim2091.$\r$\n전체 라이선스는 앱과 함께 설치됩니다."
      StrCpy $StrCreditsCheck "위의 AGPL-3.0 라이선스 및 크레딧에 동의합니다."
      StrCpy $StrCreditsAlert "계속하려면 AGPL-3.0 라이선스 및 크레딧에 동의해야 합니다."
      StrCpy $StrOptionsHeader "설치 옵션"
      StrCpy $StrOptionsSub "워크플로에 맞게 구성하세요"
      StrCpy $StrOptionsTitle "선택적 네이티브 AI 백엔드"
      StrCpy $StrOptionsDesc "HAT / DAT / SUPIR 모델은 Python 백엔드에서 실행됩니다.$\r$\nPython 3.10/3.11, 인터넷 연결, 약 2GB 공간이 필요합니다.$\r$\n나중에 시작 메뉴에서 설치할 수도 있습니다."
      StrCpy $StrOptionsCheck "지금 선택적 AI 백엔드 설치"
      StrCpy $StrOptionsHint "나중에 시작 메뉴 바로가기에서 실행할 수 있습니다."
      StrCpy $StrFinishHeader "설치 완료"
      StrCpy $StrFinishSub "Upscayl-Next 사용 준비가 완료되었습니다"
      StrCpy $StrFinishLine1 "Upscayl-Next를 설치해 주셔서 감사합니다."
      StrCpy $StrFinishLine2 "앱, 기본 모델 및 바로가기가 준비되었습니다."
      StrCpy $StrFinishLaunch "지금 Upscayl-Next 실행"
      StrCpy $StrFinishBtn "완료"
    ${EndIf}
  !macroend

  ; -------------------------------------------------------------------------
  ; 1. Welcome page (animated banner)
  ; -------------------------------------------------------------------------
  !macro customWelcomePage
    Page custom WelcomePageCreate WelcomePageLeave
    Page custom CreditsPageCreate CreditsPageLeave
  !macroend

  Function WelcomePageCreate
    !insertmacro MUI_HEADER_TEXT "$StrWelcomeHeader" "$StrWelcomeSub"

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

    ${NSD_CreateLabel} 0u 90u 300u 10u "$StrWelcomeLine1"
    Pop $0

    ${NSD_CreateLabel} 0u 102u 300u 28u "$StrWelcomeLine2"
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
    !insertmacro MUI_HEADER_TEXT "$StrCreditsHeader" "$StrCreditsSub"

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

    ${NSD_CreateLabel} 0u 62u 300u 10u "$StrCreditsLine1"
    Pop $0

    ${NSD_CreateLabel} 0u 74u 300u 40u "$StrCreditsLine2"
    Pop $0

    ${NSD_CreateCheckbox} 0u 118u 300u 12u "$StrCreditsCheck"
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
      MessageBox MB_ICONEXCLAMATION|MB_OK "$StrCreditsAlert"
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
    !insertmacro MUI_HEADER_TEXT "$StrOptionsHeader" "$StrOptionsSub"

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

    ${NSD_CreateLabel} 0u 62u 300u 10u "$StrOptionsTitle"
    Pop $0

    ${NSD_CreateLabel} 0u 74u 300u 30u "$StrOptionsDesc"
    Pop $0

    ${NSD_CreateCheckbox} 0u 108u 300u 12u "$StrOptionsCheck"
    Pop $NativeBackendCheckbox
    ${If} $InstallNativeBackend == "1"
      ${NSD_Check} $NativeBackendCheckbox
    ${EndIf}

    ${NSD_CreateLabel} 0u 124u 300u 10u "$StrOptionsHint"
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
    !insertmacro MUI_HEADER_TEXT "$StrFinishHeader" "$StrFinishSub"

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

    ${NSD_CreateLabel} 0u 86u 300u 10u "$StrFinishLine1"
    Pop $0

    ${NSD_CreateLabel} 0u 98u 300u 10u "$StrFinishLine2"
    Pop $0

    ${NSD_CreateCheckbox} 0u 112u 300u 12u "$StrFinishLaunch"
    Pop $FinishRunCheckbox
    ${If} $LaunchAfterFinish == "1"
      ${NSD_Check} $FinishRunCheckbox
    ${EndIf}

    ; This page replaces MUI_PAGE_FINISH, so set its button text and hide Back.
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$StrFinishBtn"
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

