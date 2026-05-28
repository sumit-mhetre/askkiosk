# ASK Kiosk - Android Auto-Print Agent

A single Android app for the kiosk tablet (e.g. Lenovo Tab M8). It shows the
kiosk web page full-screen AND prints automatically in the background, no taps.

## Settings are on the device now (no recompiling)

You do NOT hardcode the printer IP anymore. The app has a built-in Setup
screen. The printer IP, kiosk page URL, backend URL, and kiosk ID are entered
on the tablet and saved on the device. One compiled APK works on every tablet;
you just type the printer IP during setup at each location.

## You must build this once in Android Studio

An Android app must be compiled into an APK. This needs Android Studio (free
from Google). This folder is the source project you compile once. After that,
the same APK installs on any tablet and you configure it on-screen.

## Build and install steps

1. Install Android Studio (https://developer.android.com/studio).
2. Open this `kiosk-agent-android` folder as a project (File > Open).
3. Let Gradle sync (downloads dependencies; needs internet; a few minutes).
4. Connect the tablet via USB. On the tablet, enable Developer Options
   (Settings > About > tap Build Number 7 times) and turn on USB Debugging.
5. Click Run (green triangle). The app installs and launches.
   Or Build > Build APK, copy the APK to the tablet, install it (allow
   "install from unknown sources").

## First run (on the tablet)

The Setup screen appears automatically the first time. Fill in:
- Backend URL (default already filled): https://askkiosk.onrender.com
- Kiosk Page URL (default already filled): https://askkiosk-app.onrender.com/kiosk
- Printer IP: your printer's address on the WiFi (REQUIRED)
- Printer Port: 9100 (leave as is)
- Kiosk ID: leave blank for a single kiosk

Tap "Test Printer Connection" to confirm the tablet can reach the printer.
Then tap "Save and Start". The kiosk screen loads and printing is automatic.


## Auto-Detect Printer (new)

On the Setup screen there is now an "Auto-Detect Printer" button. Tap it and
the app scans the WiFi network for printers (using Android Network Service
Discovery / mDNS). Detected printers are listed; the first one auto-fills the
IP, and you can tap the list to use it.

If auto-detect finds nothing (some printers do not advertise themselves, or
the feature is off in the printer settings), just type the IP manually in the
Printer IP field. Auto-detect is a convenience; manual entry always works.

Note: auto-detect must be tested on the real tablet + real printer. Whether
the HP Smart Tank 589 appears depends on it advertising the _pdl-datastream
or _ipp service on the network. If it does not show up, use manual IP.

## Change settings later

Long-press anywhere on the kiosk screen to reopen the Setup screen. Change the
printer IP (e.g. if you move to a new location) and Save. No recompiling.

## The full automatic flow

1. Customer scans the QR on the tablet, uploads, pays, gets a code.
2. Customer types the code on the tablet.
3. The app downloads the file and prints to the WiFi printer automatically.
4. The phone screen updates to "Printed Successfully".

## Notes

- Printer must support raw printing on port 9100 (most network/WiFi printers
  do, including most HP). Confirm the HP Smart Tank 589 accepts port 9100.
- Tablet and printer must be on the same WiFi.
- For kiosk lockdown so customers can't exit: use Android Screen Pinning
  (Settings > Security > Screen Pinning) or a dedicated kiosk launcher.
- To avoid the printer IP changing: use your own in-cabinet WiFi router with a
  DHCP reservation, or set a static IP on the printer. A future version can
  auto-discover the printer (mDNS) so no IP is needed at all.
