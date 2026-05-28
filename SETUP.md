# ASK Kiosk - Multi-Operator Update

Adds operators (kiosk owners), each owning multiple kiosks. A code works
across all kiosks of the SAME operator, but never across different operators.
Plus a super admin page to manage operators, kiosks, and per-kiosk QR codes.

## Files in this update

New:
- backend/src/services/authService.js      JWT + password hashing + requireRole
- backend/src/controllers/adminController.js  admin login, operator/kiosk CRUD
- backend/prisma/seedAdmin.js               create first super admin + adopt existing kiosks
- frontend/src/pages/AdminPage.jsx          the /admin page

Changed:
- backend/prisma/schema.prisma   adds SuperAdmin, Operator; links Kiosk + Job to operator
- backend/package.json           adds jsonwebtoken + bcryptjs
- backend/src/index.js           (unchanged logic; keep your auto-refund version)
- backend/src/routes/index.js    adds /admin routes
- backend/src/controllers/jobController.js  operator-scoped claim + kioskId on upload
- frontend/src/main.jsx          adds /admin route
- frontend/src/lib/api.js        kioskId support + admin API methods
- frontend/src/pages/PhoneFlow.jsx   reads ?kiosk=ID from URL
- frontend/src/pages/KioskScreen.jsx reads its own ?kiosk=ID, scopes claim

## IMPORTANT: deploy order (migration is involved)

The new schema is backward-safe: operatorId on Kiosk and Job is NULLABLE, so
existing rows won't break. Still, follow this order.

### 1. Local: install new deps and apply schema
```
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name add_operators
npm run seed:admin
```
`seed:admin` creates a super admin and a default operator, and assigns any
existing kiosks/jobs to that default operator so nothing is orphaned.

Default credentials (CHANGE THESE):
- Super admin: admin@askkiosk.local / admin123
- You can override with env vars ADMIN_EMAIL, ADMIN_PASSWORD before running.

### 2. Render: update env and build command
On the backend service, the build command must also run the admin seed and
apply the schema. Use:
```
npm install && npx prisma generate && npx prisma db push --accept-data-loss && node prisma/seed.js && node prisma/seedAdmin.js
```
Add a new env var:
- JWT_SECRET = a long random string

Then push to GitHub; Render redeploys. The db push adds the new tables/columns;
seedAdmin creates the admin and adopts existing kiosks.

NOTE: `db push --accept-data-loss` is safe here because the new columns are
nullable additions; it will not drop your existing data. (It only warns because
of the flag name.)

### 3. Frontend: nothing special
Push triggers the static site rebuild. The /admin route works via your existing
rewrite rule (/* -> /index.html).

## How to use it

1. Go to https://askkiosk-app.onrender.com/admin and log in as super admin.
2. Add an Operator (e.g. "Sumit").
3. Add Kiosks under that operator (e.g. "Location B", "Location C").
4. Each kiosk shows a QR code and a Kiosk ID.
   - Print the QR and place it on that kiosk.
   - Put the Kiosk ID into that kiosk tablet's app settings (or open the kiosk
     screen as /kiosk?kiosk=KIOSK_ID).
5. A customer at Location B scans its QR, uploads, pays, gets a code. That code
   works at Location B AND Location C (same operator), but not at any other
   operator's kiosk.

## How the scoping works

- Upload: the phone app reads ?kiosk=ID from the QR and sends it. The job is
  tagged with that kiosk's operatorId.
- Claim: the kiosk identifies itself (its own ?kiosk=ID). The backend accepts
  the code if the job's operatorId matches this kiosk's operatorId. The job is
  then routed to THIS kiosk to print.
- Result: codes are valid across one operator's kiosks only.

## Security note

This adds basic JWT auth for the admin. Still pending (future): operator login
portal, rate limiting, wrong-code lockout. The admin password must be changed
from the default after first login (re-seed with your own ADMIN_PASSWORD env,
or add a change-password endpoint later).
