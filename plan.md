# PG Management App — Implementation Plan

**Context:** A girls' PG with 6 rooms (5× 3-seater on floor 1, 1× 6-seater on the terrace). Admin (currently just the owner's parents) manages tenants, rent, electricity billing, documents, and police verification through a mobile-first PWA. No tenant-facing login in v1.

---

## 1. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite, PWA (manifest + service worker) | Installable on homescreen now, wrappable with Capacitor for app stores later |
| Styling | Tailwind CSS, using the token system in Section 2 | Fast to build, easy to keep consistent |
| Backend | Node.js + Express | Simple REST API, matches schema below |
| Database | PostgreSQL via Supabase | Relational fit for rooms/tenants/payments; free tier sufficient |
| File storage | Supabase Storage | Same platform as DB, row-level-security access control for private ID docs |
| OCR | Google Cloud Vision API | Free up to 1,000 units/month, well beyond this app's real volume |
| Auth | Supabase Auth, Google OAuth provider enabled | Ready-made, secure, supports role expansion later |
| Payments | UPI deep link / QR to owner's own VPA | No payment aggregator needed (direct bank-to-bank, no pooling) |
| Reminders | Server-side scheduled job (node-cron or Supabase Edge Function on a cron schedule) | Runs daily, checks date-matching logic in Section 5.3 |

---

## 2. Design System (read this before writing any UI code)

**Brief:** Utility dashboard for two non-technical users (older parents). Clarity and legibility beat visual flair. Avoid default "AI-generated" looks — specifically: no purple/violet gradients, no glassmorphism, no heavy drop-shadow card stacks, no centered-hero-with-blurry-blob layouts.

**Color tokens:**
```
--bg:            #FAF7F2   (warm off-white, not stark white)
--surface:       #FFFFFF   (cards)
--text-primary:  #2B2A28   (near-black, warm undertone)
--text-secondary:#6B6A66
--accent:        #B5495B   (muted berry/rose — primary actions, headers)
--success:       #4F7A5E   (sage green — rent paid, vacant-ok states)
--warning:       #C97F2A   (warm amber — pending states, soft alerts)
--border:        #E7E2D8
```
Do not use purple, indigo, or violet anywhere. Do not use terracotta (#D97757-ish) as the primary accent — pick the berry tone above instead.

**Typography:**
- Headings/UI labels: **Manrope** (geometric, friendly, highly legible at small sizes)
- Body/data/numbers: **Work Sans** (humanist, clear for tabular rent/meter data)
- No serif display font — this is a utility app, not a marketing page.

**Layout principles:**
- Flat design: solid colors + 1px borders, not shadows, to indicate cards/sections
- Large tap targets (minimum 44px height) everywhere — this is the #1 rule given the users
- 2-column max grid on mobile; never cram more than one primary action per screen
- Border-radius: consistent 8–10px, not 20px+ "bubbly" corners
- One accent color used deliberately (berry for primary actions/branding); success/warning colors reserved only for status, never decoration
- No animation beyond simple fades/transitions (150–200ms) on step changes — no scroll-reveal effects, this isn't a marketing site

**Signature element:** the room-grid dashboard (Section 6.1) is the one visual identity piece — color-coded room cards with seat-fill counts. Keep everything else quiet and functional around it.

---

## 3. Database Schema

```sql
-- Property-wide settings (single row or key-value table)
settings
  id
  electricity_rate_per_unit   decimal
  total_parking_spots         int
  updated_at

users  -- admin/staff accounts
  id
  email
  google_id
  full_name
  role            enum('admin','staff','tenant')  -- only 'admin' used in v1, others reserved
  created_at

rooms
  id
  room_number     text unique
  floor           int
  capacity        int          -- 3 or 6
  has_ac          boolean
  seat_rent       decimal      -- rent per tenant/seat in this room
  ac_charge       decimal      -- additional monthly charge if a tenant opts into AC
  created_at
  updated_at

tenants
  id
  room_id                 FK -> rooms
  full_name
  phone_number
  address                  -- OCR-filled, editable
  id_proof_type            enum('aadhaar','pan','passport','driving_license')
  id_proof_number
  ac_opted                 boolean
  has_vehicle              boolean
  vehicle_number           text nullable
  check_in_date            date  -- defaults to today, cannot be future
  check_out_date           date nullable
  status                   enum('active','vacated')
  security_deposit_amount  decimal nullable  -- unused in v1, reserved for later
  created_at
  updated_at

tenant_documents
  id
  tenant_id       FK -> tenants
  doc_type        enum('id_proof_front','id_proof_back','photo','other')
  file_url        text  -- Supabase Storage path
  ocr_raw_data    jsonb nullable  -- raw OCR output, kept even after user edits
  uploaded_at

rent_payments
  id
  tenant_id       FK -> tenants
  billing_month   date  -- first of the month
  seat_rent       decimal
  ac_charge       decimal
  electricity_charge decimal
  total_amount    decimal
  amount_paid     decimal
  status          enum('pending','paid')   -- NOTE: no "overdue" status, per explicit decision
  paid_date        date nullable
  created_at
  updated_at

meter_readings
  id
  room_id             FK -> rooms
  reading_date        date
  reading_value       int
  active_tenant_ids    int[]   -- snapshot of tenants present in the room as of this reading
                                -- (needed for the period-based split calc — see Section 5.2)
  triggered_by         enum('routine','checkout')
  created_at

gate_log
  id
  tenant_id       FK -> tenants nullable  -- null if visitor isn't visiting a specific tenant
  visitor_name    text nullable
  in_time         timestamp
  out_time        timestamp nullable
  created_at

police_verification
  id
  tenant_id           FK -> tenants unique
  status              enum('pending','submitted','verified')
  submitted_date      date nullable
  verified_date       date nullable
  reference_number    text nullable
  notes               text nullable
  created_at
  updated_at
```

---

## 4. Auth & Roles

- Use **Supabase Auth** with the **Google OAuth provider** enabled. Only allowlisted Google accounts (the parents' emails) can log in for now — enforce this via a check against the `users` table on first login, not an open signup.
- Every user row has a `role` column (`admin` / `staff` / `tenant`), but only `admin` is used in v1. This means:
  - Route guards should check `role === 'admin'` rather than "is logged in," so adding `staff` with restricted permissions later doesn't require rebuilding auth — just adding new role checks.
  - Do not build a signup flow. Admin accounts are added manually (directly in the Supabase table) for now.

---

## 5. Core Business Logic

### 5.1 Rent Calculation (per tenant, per month)
```
total_amount = seat_rent
             + (ac_charge if tenant.ac_opted else 0)
             + electricity_charge   (see 5.2)
```
Status is binary: `pending` until an admin manually marks it `paid`. **No overdue/grace-period logic — explicitly not wanted.**

### 5.2 Electricity Splitting (period-based, recursive)
This is the trickiest piece — implement carefully:

1. A room's meter readings for a given month are ordered by date. Each **consecutive pair of readings defines a period**.
2. `units_used_in_period = reading[n].reading_value - reading[n-1].reading_value`
3. `charge_for_period = units_used_in_period * settings.electricity_rate_per_unit`
4. This charge is split **evenly** among the tenants listed in `reading[n].active_tenant_ids` (the snapshot of who was present during that period).
5. A tenant's total electricity charge for the month = **sum of their share across every period they appear in** that month.
6. **Trigger:** whenever a tenant's `check_out_date` is set, prompt the admin: "Record a meter reading for this room now?" — this is what closes the current period and opens the next one. Skipping this breaks the fairness of the split entirely, so make this prompt hard to miss (not a silent background nudge).
7. This logic must handle **any number of mid-month checkouts** in the same room — it's the same 2-reading-pair rule repeated N+1 times for N checkouts, not a special case.

### 5.3 Rent Reminders
- Trigger condition: a reminder fires when **today's day-of-month matches the tenant's `check_in_date` day-of-month**, rolling forward every month from their original move-in date.
- Edge case: if a tenant moved in on the 31st (or 29th/30th) and the current month is shorter, clamp to the last valid day of that month (e.g., Feb 28th/29th).
- Since there's no SMS/WhatsApp integration in v1, this reminder surfaces as an **in-app notification / push notification** (PWA supports web push) — not an external message.
- Reminder copy should be plain and direct, e.g. "Rent for [Tenant Name], Room 101 is due today" — no jargon.

### 5.4 File Upload Validation & Compression
- **Client-side:** compress image before upload — resize longest edge to ~1800px, re-encode JPEG at 75–80% quality (use `browser-image-compression` or Canvas API). This preserves OCR legibility while cutting file size.
- **Client-side:** reject non-image/non-PDF files immediately with a plain-language message ("Please choose a photo or PDF").
- **Server-side (mandatory, not optional):** independently reject any file over **8 MB** and any non-image/non-PDF MIME type, regardless of what the client already did — client checks can be bypassed.

### 5.5 OCR + Editable Autofill Flow
1. Tenant document uploaded → sent to Google Cloud Vision API for text extraction.
2. Apply regex against Aadhaar's known layout (12-digit number pattern, "Address:" block, DOB pattern) to extract: full name, address, Aadhaar number, and phone number if present.
3. Store the **raw OCR text** in `tenant_documents.ocr_raw_data` regardless of what happens next.
4. Pre-fill the review screen (Section 6, Step 4) with extracted values in **editable fields** — never auto-submit without the admin seeing and confirming them.

---

## 6. Screens (build in this order)

1. **Login** — Google OAuth button only, no email/password form
2. **Room dashboard** (home screen) — grid of 6 room cards, each showing seats filled/capacity, tenant names, rent status (paid/pending only). Vacant/available-seat rooms are tappable to start onboarding; full rooms are not.
3. **Tenant onboarding wizard** (4 steps):
   - Step 1: Choose room (occupied/full rooms grayed out)
   - Step 2: Tenant details — name, mobile, move-in date (defaults to today, cannot be future), AC toggle, "has vehicle" toggle (reveals vehicle number field if checked — show a soft warning if `total_parking_spots` is already met, but don't block)
   - Step 3: Upload ID document (compressed client-side, then OCR runs)
   - Step 4: Review & confirm — editable OCR-filled fields (address, phone, ID number)
4. **Room/tenant detail view** — full tenant profile, documents, rent history, police verification status, meter reading history for that room
5. **Police verification tab** — list of all tenants with status (pending/submitted/verified), editable inline
6. **Meter reading entry** — admin enters a new reading for a room (routine, or triggered by a checkout prompt)
7. **Settings** — electricity rate per unit, total parking spots, room rent/capacity/AC config (admin can edit anything, per original requirement)
8. **Gate log** — simple running list, add visitor/tenant in-out entries

---

## 7. API Endpoints (REST)

```
POST   /auth/callback                     -- Google OAuth callback
GET    /rooms                             -- dashboard data (occupancy, rent status)
GET    /rooms/:id
PATCH  /rooms/:id                         -- edit rent/capacity/AC config

POST   /tenants                           -- onboard new tenant
GET    /tenants/:id
PATCH  /tenants/:id                       -- edit any field
POST   /tenants/:id/checkout              -- sets check_out_date, triggers meter reading prompt

POST   /tenants/:id/documents             -- upload (compressed) file, runs OCR, returns extracted fields
GET    /tenants/:id/documents

GET    /rooms/:id/meter-readings
POST   /rooms/:id/meter-readings          -- new reading, snapshots active_tenant_ids

GET    /tenants/:id/rent                  -- rent history
POST   /rent/:id/mark-paid

GET    /police-verification
PATCH  /police-verification/:tenant_id

GET    /gate-log
POST   /gate-log

GET    /settings
PATCH  /settings
```

---

## 8. Environment Variables

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   -- backend only, never exposed to client
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_CLOUD_VISION_API_KEY=
```

---

## 9. Deployment

- Frontend: Vercel or Netlify (free tier)
- Backend: Render or Railway (free/low-cost tier)
- Database + Storage + Auth: Supabase (free tier — note: pauses after 7 days with zero activity; fine for daily-use admin app, but worth knowing)

---

## 10. Explicitly Out of Scope for v1 (do not build these yet)

- "Raise a complaint" feature
- WhatsApp/SMS reminders (in-app/push only for now)
- Security deposit tracking (field reserved in schema, no UI)
- Bed-level granularity beyond room capacity (rooms already support multiple tenants; no separate "bed" entity needed)
- Overdue/grace-period rent logic (status is just pending/paid)
- Tenant-initiated writes of any kind — no profile self-edit, no document upload, no "I paid" claim
- In-app payment. UPI deep links and QR were researched and deliberately deferred: the link itself is trivial (`upi://pay?pa=…&am=…`, no SDK, no KYC, no fees) but it has **no callback and no webhook**, so the app never learns whether payment happened and reconciliation stays manual either way. Only a payment gateway auto-marks paid, at the cost of KYC, ~2% fees and money-handling risk.

---

## 11. Shipped after v1

Three audiences now share one origin. See `backend/migrations/004_tenant_portal.sql`.

**Public site — `/`**
Static marketing page. All copy, pricing, amenities, rules and photos live in `frontend/src/content/pg.js` — **edit there, never in the JSX**, and keep tier prices in sync with the `rooms` table by hand. It is deliberately not database-backed: Supabase's free tier pauses after 7 idle days, which is exactly when a prospective tenant would be looking. The only public write is `POST /enquiries` (honeypot + length caps + 5/hour per IP), read back at `/admin/enquiries`.

**Office app — `/admin/*`**
Unchanged behaviour, moved off `/` to make room for the public site.

**Resident portal — `/me/*`** (roles: `tenant`)
Read-only. `GET /me/summary`, `/me/rent`, `/me/profile`, `/me/documents/:docId/signed-url`.

> **The rule that makes this safe:** no portal route accepts a tenant id. The row is resolved from `req.user.id` by `requireTenant()` in `backend/routes/me.js` and nothing else. Adding an `:id` param to anything under `/me` would undo that in one line.

Withheld from every `/me` response even though it is the resident's own record: `id_proof_number`, `ocr_raw_data`, storage `file_url`. Roommates are first names only.

**Identity linking.** An admin types a Google address into `tenants.login_email` (Portal Access card on the tenant detail page). On that person's first sign-in, `GET /me` binds `tenants.user_id` and promotes `users.role` from `viewer` to `tenant`. It can only ever assign `tenant`, only from `viewer`, and only where an admin already wrote the address — see the header comment in `routes/me.js`. The residual risk is a typo, which is why the admin UI shows the linked Google account's real display name and a Revoke button.

**Roles are now:** `admin` (everything), `gatekeeper` (desk work), `tenant` (own record via `/me`), `viewer` (nothing, the default). `staff` remains a dead enum value.