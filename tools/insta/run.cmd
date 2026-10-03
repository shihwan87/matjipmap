@echo off
rem Windows launcher. If "python" is the Microsoft Store alias, AppData\Roaming is hidden
rem from it, so the Claude executable (desktop-app bundle or npm global) cannot be found.
rem Re-running through the real python.exe the alias reports avoids that.
rem (ASCII only: cmd.exe reads this file in the system code page.)
setlocal
for /f "delims=" %%p in ('python -c "import sys;print(sys.executable)"') do set "PY=%%p"
if "%PY%"=="" set "PY=python"
"%PY%" "%~dp0run.py" %*
