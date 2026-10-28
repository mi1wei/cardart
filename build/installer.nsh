!include "LogicLib.nsh"

LangString FolioFirewallInstallWarning 1033 "Folio could not configure Private LAN access. Local albums still work. Ask your administrator to allow this program on trusted Private networks only. Do not disable the firewall."
LangString FolioFirewallInstallWarning 2052 "无法配置 Folio 专用网络访问。本机相册仍可使用；请管理员只为本程序放行可信的专用网络，不要关闭防火墙。"
LangString FolioFirewallRemoveWarning 1033 "The Folio Private LAN firewall rule could not be removed. Ask your administrator to remove only that rule. Album libraries and user data are kept."
LangString FolioFirewallRemoveWarning 2052 "无法移除 Folio 专用局域网防火墙规则，请管理员仅移除本应用的同名规则。相册库和用户数据会保留。"
LangString FolioMustQuit 1033 "Folio is still running, or its stopped state could not be confirmed. Finish imports and choose Quit from Folio's tray/application menu, including other signed-in sessions, then rerun this installer. No application process has been stopped."
LangString FolioMustQuit 2052 "Folio 仍在运行，或无法确认已完全退出。请等待导入完成，并从托盘/应用菜单选择“退出”；其他登录会话也需退出后再重新运行安装器。安装器不会关闭或强制结束应用进程。"

# The default builder check may force-stop a tray-backed process.
!macro customCheckAppRunning
  Push $0
  Push $1
  StrCpy $1 0
  ${Do}
    nsProcess::_FindProcess /NOUNLOAD "${APP_EXECUTABLE_FILENAME}"
    Pop $0
    ${If} $0 == 603
      ${ExitDo}
    ${EndIf}
    IntOp $1 $1 + 1
    ${If} $0 != 0
      MessageBox MB_ICONEXCLAMATION|MB_OK "$(FolioMustQuit)" /SD IDOK
      SetErrorLevel 2
      Quit
    ${EndIf}
    ${If} $1 >= 20
      MessageBox MB_ICONEXCLAMATION|MB_OK "$(FolioMustQuit)" /SD IDOK
      SetErrorLevel 2
      Quit
    ${EndIf}
    Sleep 250
  ${Loop}
  Pop $1
  Pop $0
!macroend

!macro customInstall
  Push $0
  Push $1
  Push $R0
  StrCpy $R0 "1"
  nsExec::ExecToStack '"$SYSDIR\netsh.exe" advfirewall firewall show rule name="io.github.mi1wei.folio - Private LAN"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    nsExec::ExecToStack '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="io.github.mi1wei.folio - Private LAN"'
    Pop $0
    Pop $1
    ${If} $0 != 0
      StrCpy $R0 "0"
    ${EndIf}
  ${EndIf}
  ${If} $R0 == "1"
    nsExec::ExecToStack '"$SYSDIR\netsh.exe" advfirewall firewall add rule name="io.github.mi1wei.folio - Private LAN" dir=in action=allow program="$INSTDIR\Folio.exe" enable=yes profile=private remoteip=LocalSubnet protocol=TCP'
    Pop $0
    Pop $1
  ${EndIf}
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION|MB_OK "$(FolioFirewallInstallWarning)" /SD IDOK
  ${EndIf}
  Pop $R0
  Pop $1
  Pop $0
!macroend

!macro customUnInstall
  Push $0
  Push $1
  nsExec::ExecToStack '"$SYSDIR\netsh.exe" advfirewall firewall show rule name="io.github.mi1wei.folio - Private LAN"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    nsExec::ExecToStack '"$SYSDIR\netsh.exe" advfirewall firewall delete rule name="io.github.mi1wei.folio - Private LAN"'
    Pop $0
    Pop $1
    ${If} $0 != 0
      MessageBox MB_ICONEXCLAMATION|MB_OK "$(FolioFirewallRemoveWarning)" /SD IDOK
    ${EndIf}
  ${EndIf}
  Pop $1
  Pop $0
!macroend
