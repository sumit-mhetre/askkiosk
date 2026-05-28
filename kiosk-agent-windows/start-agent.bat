@echo off
REM ASK Kiosk Windows Print Agent launcher
REM Edit the values below, then double-click this file to start.

set BACKEND_URL=https://askkiosk.onrender.com
REM Leave KIOSK_ID blank to use the active kiosk, or set it for multi-kiosk.
set KIOSK_ID=
REM Leave PRINTER_NAME blank to use the Windows default printer.
set PRINTER_NAME=

node agent.js
pause
