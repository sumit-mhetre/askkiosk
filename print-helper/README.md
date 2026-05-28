# ASK Kiosk - Print Helper (Office Test Guide)

This tiny program runs on your laptop and bridges the kiosk web page to a
network printer on the local WiFi. Use it to test real printing at your
office without changing the backend on Render.

## What it does

1. The kiosk page (running in your laptop browser at the office) sends a
   "print this job" message to this helper.
2. The helper fetches the print-ready file from the backend on Render.
3. The helper pushes the file to the printer's IP on the local WiFi
   (TCP port 9100, the standard raw-print protocol).
4. The helper reports success or failure back; the backend updates the
   job state (PRINTED_OK or FAILED_REFUNDED with auto-refund).

## Prerequisites at the office

- Laptop on the same WiFi as the printer.
- Node.js installed on the laptop (any recent version).
- The office printer's IP address.

## How to find the printer's IP

Easiest options:
- Print a configuration sheet from the printer itself (most printers have
  a menu option for this; it lists the IP).
- Check the printer's display screen (Settings > Network usually shows it).
- Open your office router's admin page and look at connected devices.
- On Windows: Settings > Bluetooth & devices > Printers & scanners > pick
  the printer > Printer properties > Ports tab shows the IP for network
  printers.

You're looking for something like `192.168.1.50` or `10.0.0.42`.

## Setup (one-time)

1. Copy the `print-helper/` folder to your laptop.
2. Open a terminal in that folder.
3. Run `npm install` (nothing to install actually, but creates a clean
   node_modules folder if needed; you can skip if Node is recent enough).

## Running it at the office

Open a terminal in the `print-helper` folder.

Windows (cmd):

```
set PRINTER_IP=192.168.1.50
node print-helper.js
```

Windows (PowerShell):

```
$env:PRINTER_IP="192.168.1.50"
node print-helper.js
```

Linux / Mac:

```
PRINTER_IP=192.168.1.50 node print-helper.js
```

Replace `192.168.1.50` with the actual printer IP.

You should see:

```
==============================================================
 ASK Kiosk Print Helper running on http://localhost:5050
 Printer:  192.168.1.50:9100
 Backend:  https://askkiosk.onrender.com
 Health:   http://localhost:5050/health
==============================================================
```

Leave this terminal window open for the entire demo. Closing it stops
printing from working.

## Open the kiosk page

In your laptop's browser open:

```
https://askkiosk-app.onrender.com/kiosk
```

If the helper is running, the page will detect it automatically and use it
for printing. If the helper is NOT running, the kiosk shows a small red
"Printer link offline. Demo mode only." badge, and printing will be
simulated only.

## Test the full flow

1. Open `https://askkiosk-app.onrender.com/` on your phone (the QR shown on
   the kiosk also points here).
2. Upload a small PDF or image.
3. Choose options, pay (test mode), get the code.
4. Type the code on the kiosk page in your laptop browser.
5. The laptop helper fetches the file from Render and prints to the
   office printer.

## Common issues

**"Printer connection timed out"**
- The IP is wrong, or the printer is on a different network, or the
  printer has port 9100 disabled. Verify by pinging the IP from the same
  laptop: `ping 192.168.1.50` (replace with your IP). If ping fails, the
  network address is wrong or unreachable.

**"Fetch failed, HTTP 410"**
- The file was already deleted (job already printed) or the code was
  reused. Each code is one-time. Generate a fresh code.

**Helper status badge says offline**
- The helper isn't running, or it's running on a different machine than
  the kiosk page. The helper must be on the same machine as the browser.

## What's next (after the test)

Once this proves the print path works on the office printer, the same
logic gets ported to a small Android app for unattended deployment on
the Lenovo Tab M8. Same idea, different host.

## Optional: lock with a shared key

If you want to ensure only your kiosk page can call the helper (mostly
relevant once you're on a shared LAN), set a shared key:

```
set PRINTER_IP=192.168.1.50
set HELPER_KEY=any-long-random-string
node print-helper.js
```

And add the matching key to the kiosk page (we can wire this up if
needed; not necessary for the office test).
