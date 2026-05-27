# ASK Kiosk

Self-service document printing kiosk. Customers scan a QR on the kiosk, upload
a file from their phone, configure and pay, get a code, then enter that code on
the kiosk to print.

This repo has two parts:

- `backend/`  Node + Express + Prisma + Postgres API (job state machine,
  pricing, payment, claim and print).
- `frontend/` Vite + React + Tailwind. Two screens in one app:
  - `/`       the phone web app (opened by scanning the kiosk QR)
  - `/kiosk`  the kiosk/tablet screen (QR + code entry)

---

## Prerequisites

- Node.js 18+ (you have 22, fine)
- PostgreSQL running locally

---

## 1. Backend setup

```
cd backend
npm install
copy .env.example .env
```

Edit `.env` and set:
- `DATABASE_URL` with your real Postgres password
- `CODE_SECRET` to any long random string
- Razorpay keys are optional. If left as the placeholder, the backend runs in
  MOCK payment mode (payments auto-succeed) so you can test without an account.

Then:

```
npx prisma migrate dev --name init
npm run seed
npm run dev
```

Backend runs on http://localhost:5000
Health check: http://localhost:5000/api/health

Modes:
- Payment: MOCK until real Razorpay test keys are set in `.env`.
- Printing: SIMULATION until a printer IP is set on the kiosk (logs instead of
  printing). This lets you demo the full flow before hardware arrives.

---

## 2. Frontend setup

In a second terminal:

```
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173 and proxies `/api` to the backend.

- Phone app:  http://localhost:5173/
- Kiosk screen: http://localhost:5173/kiosk

To test on a real phone over the same WiFi, the dev server is exposed on your
LAN. Find your PC IP (ipconfig) and open `http://YOUR_PC_IP:5173/` on the phone.
For the QR on the kiosk to point at your PC, run the kiosk screen in a browser
on the tablet pointed at the same LAN URL.

---

## 3. Test the full flow (no hardware, no Razorpay needed)

1. Open the kiosk screen at `/kiosk`. It shows a QR and an Enter Code button.
2. On your phone (or another browser tab), open `/`. Upload a PDF or image.
3. Choose copies, color or B&W, single or double sided. See the live price.
4. Tap Pay and Get Code. In mock mode it succeeds instantly and shows a code.
5. On the kiosk screen, tap Enter Code, type the code, Submit.
6. In simulation mode the backend logs the print and the kiosk shows Success.

---

## 4. Connect to Git / GitHub

From the project root (`askkiosk`), if not already a repo:

```
git init
git add .
git commit -m "ASK Kiosk: backend and frontend"
```

To push to GitHub, create an EMPTY repo on GitHub (no README), then:

```
git remote add origin https://github.com/YOUR_USERNAME/askkiosk.git
git branch -M main
git push -u origin main
```

The `.gitignore` files keep `node_modules`, `.env`, `dist`, and `uploads` out
of Git. Your database password in `.env` is never committed.

---

## Settings

All tunable values (prices, limits, code rules, print retries) live in the
database `Setting` table and are seeded with defaults. They can be changed via
the settings API:

- `GET  /api/settings`
- `PUT  /api/settings` with `{ key, value }`

Defaults: B&W 1 per page, color 3 per page, double sided 1.5 per sheet,
color double 4.5 per sheet, max 50 sheets per job, 6 digit codes, 45 min expiry,
3 print retries then auto-refund.
