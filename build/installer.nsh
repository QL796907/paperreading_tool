; Runs before the default process check. cmd.exe taskkill/tasklist mangles a
; non-ASCII image name, so the previously shipped exe stays locked and the
; installer keeps reporting that the app cannot be closed.
; Stop every process whose executable lives in the install directory, then
; fall through to the stock check (paper-glossary.exe).
;
; This file is included before allowOnlyOneInstallerInstance.nsh. That file
; skips getProcessInfo.nsh once customCheckAppRunning exists, so include it
; here or ${GetProcessInfo} is an invalid command.
!include "getProcessInfo.nsh"
Var pid

!macro customCheckAppRunning
  StrCpy $R8 "$INSTDIR"
  ${If} $R8 != ""
    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object ExecutablePath -like '$R8\*' | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
    Pop $R8
    Sleep 800
  ${EndIf}
  !insertmacro _CHECK_APP_RUNNING
!macroend
