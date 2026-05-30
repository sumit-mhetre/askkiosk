# ASK Kiosk - Windows Auto-Print Agent

Fully automatic printing on a Windows kiosk machine. No taps, no dialogs.

## How it works

The agent runs quietly on the Windows machine. It checks the backend every
few seconds for a job that's ready to print (a customer entered their code).
When one appears, it downloads the file and prints it silently to the
Windows default printer, then tells the backend it's done.

No printer IP needed. Windows owns the printer (USB, WiFi, or network),
the agent just prints to whatever is set as the default printer.

## One-time setup on the kiosk machine

1. Install Node.js (https://nodejs.org, the LTS version).
2. Install SumatraPDF (https://www.sumatrapdfreader.org). This is used to
   print PDFs with the right color and duplex settings the customer chose.
   It's free, lightweight (about 10 MB), and silent.
3. Connect your printer to the Windows machine and set it as the
   DEFAULT printer (Settings > Bluetooth & devices > Printers & scanners >
   pick your printer > Set as default).
4. Print a test page from Windows to confirm the printer works normally.
5. Copy the `kiosk-agent-windows` folder onto the machine.
6. Open a terminal in the folder and run `npm install` once to install
   the agent's dependencies (used for image -> PDF conversion).

## What the agent honours

- Number of copies (each file printed N times).
- Color or Black & White (sent to the printer as a print setting).
- Single-sided or Double-sided (long-edge duplex when chosen).
- Each file in a multi-file job uses its own settings.

If the printer doesn't physically support color or duplex, those settings
are ignored by the hardware. Use a color/duplex-capable printer for the
real product. The HP Smart Tank 589 supports both.

If SumatraPDF is installed somewhere unusual, set the SUMATRA_PATH env
var in start-agent.bat before running the agent.

## Running it

Option A (easiest): double-click `start-agent.bat`.

Option B (terminal):
```
cd kiosk-agent-windows
node agent.js
```

You should see:
```
==============================================================
 ASK Kiosk Windows Print Agent
 Backend: https://askkiosk.onrender.com
 Printer: (Windows default printer)
 Polling every 3000 ms. Leave this window open.
==============================================================
```

Leave that window open while the kiosk is in use.

## The full automatic flow

1. Customer scans QR, uploads, pays, gets a code (on their phone).
2. Customer enters the code on the kiosk screen.
3. The backend marks the job "ready to print."
4. The agent (running on this machine) sees it, downloads the file,
   and prints it automatically. No tap.
5. The phone screen updates to "Printed Successfully."

## Settings (optional)

Edit `start-agent.bat` to change:
- `PRINTER_NAME` : force a specific printer instead of the default.
- `KIOSK_ID`     : set this if you run multiple kiosks (each machine prints
  only its own kiosk's jobs).

## Make it start automatically on boot (for a real kiosk)

Put a shortcut to `start-agent.bat` in the Windows Startup folder:
1. Press Win+R, type `shell:startup`, press Enter.
2. Copy a shortcut to `start-agent.bat` into that folder.
Now the agent starts whenever the machine boots.

## Troubleshooting

**Nothing prints**
- Is the agent window open and showing "Polling every..."?
- Can you print a normal test page from Windows? If not, fix the printer
  in Windows first.
- Is the default printer set correctly?

**Prints the wrong printer**
- Set `PRINTER_NAME` in `start-agent.bat` to the exact printer name from
  Windows Printers & scanners.

**PDF prints but looks wrong / blank**
- The machine needs a default PDF handler that supports the Print verb
  (Adobe Reader or Edge both work). Install Adobe Reader if needed.
