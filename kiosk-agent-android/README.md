# ASK Kiosk - Android Auto-Print Agent

A single Android app for the kiosk tablet (e.g. Lenovo Tab M8). It shows the
kiosk web page full-screen AND prints automatically in the background, no taps.

## What it does

1. Opens the kiosk page (QR + code entry) full-screen in a WebView.
2. Polls the backend every few seconds for jobs ready to print.
3. When a customer enters their code, the app downloads the file and sends
   it to the printer over the local WiFi (raw port 9100), automatically.
4. Reports success/failure back to the backend.

## Important: you must build this in Android Studio

Unlike the web parts, an Android app must be compiled into an APK. This needs
Android Studio (free from Google). I cannot produce a ready APK for you; this
is the source project you compile once.

## Before you build, set your config

Open `app/src/main/java/com/askkiosk/agent/MainActivity.kt` and edit the top:

```
private val BACKEND_URL = "https://askkiosk.onrender.com"
private val KIOSK_PAGE = "https://askkiosk-app.onrender.com/kiosk"
private val KIOSK_ID = ""            // blank = active kiosk
private val PRINTER_IP = "192.168.1.50"   // YOUR printer's IP
private val PRINTER_PORT = 9100
```

The one value you must set correctly is PRINTER_IP, the printer's address on
the WiFi. Find it from the printer's display or a printed config sheet.

## Build and install steps

1. Install Android Studio (https://developer.android.com/studio).
2. Open this `kiosk-agent-android` folder as a project (File > Open).
3. Let Gradle sync (it downloads dependencies; needs internet, takes a few
   minutes the first time).
4. Connect the Lenovo Tab M8 to the PC with a USB cable.
5. On the tablet: enable Developer Options (Settings > About > tap Build
   Number 7 times) and turn on USB Debugging.
6. In Android Studio, pick the tablet as the device and click Run (green
   triangle). The app installs and launches on the tablet.

Alternatively, Build > Build APK, then copy the APK to the tablet and install
it (you must allow "install from unknown sources").

## Running as a kiosk

- The app keeps the screen on and shows the kiosk page full-screen.
- For true kiosk lockdown (so customers can't exit the app), use Android
  Screen Pinning: Settings > Security > Screen Pinning, then pin the app.
  Or use a dedicated kiosk launcher app.

## The full automatic flow

1. Customer scans the QR shown on the tablet, uploads, pays, gets a code.
2. Customer types the code on the tablet.
3. The app sees the job, downloads the file, prints to the WiFi printer.
4. The phone screen updates to "Printed Successfully."

No taps on the tablet for printing.

## Notes and limits

- The printer must support raw printing on port 9100 (most network/WiFi
  laser and ink-tank printers do, including most HP models). Confirm your
  HP Smart Tank 589 accepts port 9100; if it only supports IPP, tell the
  developer and the print method can be switched to IPP.
- The tablet and printer must be on the same WiFi.
- This version uses a hardcoded printer IP for simplicity. A later version
  can auto-discover the printer on the network (mDNS) so no IP is needed.
- `usesCleartextTraffic` is enabled so raw 9100 works; the backend calls are
  still HTTPS.
