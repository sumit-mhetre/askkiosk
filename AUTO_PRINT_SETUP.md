# ASK Kiosk - Automatic Printing Setup

This explains how fully automatic (no-tap) printing works and what you need
to do, for both Windows and Android kiosk devices.

## The core idea (read this first)

Your backend lives on Render (the internet). The printer lives on a local
WiFi. They cannot talk directly. So a small "agent" runs on the kiosk device
(which IS on the local WiFi) and does the printing.

The agent works by POLLING:
- It asks the backend every few seconds: "any job ready to print?"
- When a customer enters their code, the backend marks the job ready.
- The agent downloads the file and prints it automatically.
- The agent tells the backend done (or failed -> auto refund).

This design means: no hardcoded backend tricks, no open ports on the
internet, no manual steps for each print. The device just runs the agent
and has a printer. That is the whole setup.

## You have two agent options

### Windows agent (easiest, most reliable)
Folder: `kiosk-agent-windows`
- Runs on any Windows mini-PC or laptop behind the kiosk screen.
- Uses the Windows DEFAULT printer (USB, WiFi, or network). No printer IP
  to configure. Windows handles the printer.
- Prints silently, no dialog.
- Setup: install Node.js, set the printer as Windows default, run the agent.
- See `kiosk-agent-windows/README.md`.

### Android agent (for the Lenovo Tab M8 tablet)
Folder: `kiosk-agent-android`
- One app that shows the kiosk page AND prints automatically.
- Prints to the printer's IP over WiFi (port 9100).
- Must be compiled once in Android Studio and installed on the tablet.
- Needs the printer's IP set in the code.
- See `kiosk-agent-android/README.md`.

## Which should you use?

- For the fastest path to a working automatic kiosk: Windows agent with a
  cheap mini-PC. Least friction, most reliable, no app compiling.
- For the tablet-based design in your hardware mockup (Lenovo Tab M8):
  Android agent. More setup (Android Studio) but matches your cabinet design.

Both do the same job. You can start with Windows to prove it, then move to
Android for the final tablet build.

## What changed in the app to support this

- Backend: new endpoints the agent uses:
  - `GET  /api/agent/next-job`     agent polls this
  - `GET  /api/jobs/:id/file`      agent downloads the file
  - `POST /api/jobs/:id/print-result`  agent reports done/failed
- Kiosk page: entering a code now just marks the job "ready to print"
  (the agent does the actual printing). The phone screen then updates to
  "Printed Successfully" or "Print Failed / Refunded" automatically.

## Step-by-step: get automatic printing working

1. Deploy the updated backend and frontend (git push; Render auto-deploys).
2. Pick your device:
   - Windows: follow `kiosk-agent-windows/README.md`.
   - Android: follow `kiosk-agent-android/README.md`.
3. Connect a printer to that device (Windows default printer, or the
   printer IP for Android).
4. Start the agent.
5. Run the flow: phone uploads + pays + gets code; enter code on kiosk;
   the agent prints automatically.

That is the complete automatic workflow.
