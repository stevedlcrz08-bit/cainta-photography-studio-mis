# Cainta Photography Studio MIS — Complete Rebuild Prompt

## Overview

Build a **Photography Studio Management Information System** for Cainta, Rizal. This is a multi-role SaaS-like platform where a Super Admin approves photography studios, studio owners manage their business (bookings, payments, printing, proofing), and customers discover and book studio sessions online.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite 6, Tailwind CSS v4 |
| **Animations** | Framer Motion / `motion/react` v12 |
| **Icons** | `lucide-react` |
| **Charts** | `recharts` (BarChart, AreaChart, ComposedChart) |
| **Maps** | `leaflet` + `react-leaflet` |
| **PDF** | `jsPDF` |
| **Drag & Drop** | `@hello-pangea/dnd` |
| **Backend** | Express 4, Node.js, TypeScript (`tsx` dev / `esbuild` prod) |
| **Database** | MySQL (primary) via `mysql2` with in-memory mirror fallback to `db.json` |
| **Auth** | In-memory session tokens (8h TTL), bcryptjs, Google OAuth (tokeninfo endpoint) |
| **Email** | Nodemailer (Gmail SMTP / custom SMTP) |
| **Media** | Local filesystem (`protected-media/`) or Cloudinary (optional) |
| **Payments** | PayMongo API (GCash QR Ph via QR code + HMAC webhook) |
| **AI** | Google Gemini API (`@google/genai`) |
| **Realtime** | Server-Sent Events (SSE) for payment push notifications |
| **Deployment** | Firebase Hosting + Cloud Functions, Render.com (backend), Vercel (alternative) |
| **PWA** | `manifest.json` + install prompt component |

---

## User Roles

### 1. SUPER_ADMIN
- Stored in `users` table
- Full system access: approves/rejects studios, manages all users, views all bookings/payments/orders
- Configures CMS, theme, system settings, categories
- Manages audit logs and global FAQs
- Creates any user type directly

### 2. STUDIO_ADMIN
- Stored in `users` table with `studioId` reference
- Manages own studio profile, services, packages, add-ons, print products
- Views and manages own studio's bookings and payments
- Verifies payments (approve/reject proof of payment)
- Manages reviews, photo proofing galleries
- Configures weekly availability, blackout dates
- Manages staff members (STUDIO_STAFF)
- Downloads sales and booking reports

### 3. STUDIO_STAFF
- Stored in `users` table with `studioId` reference
- Read access to studio bookings and calendar
- Limited write: update booking status, checklists

### 4. CUSTOMER
- Stored in separate `customers` table
- Create/cancel/reschedule bookings and print orders
- Submit payment proofs
- Write reviews and manage favorites
- View photo proofing galleries

---

## Database Schema (MySQL)

### Core Tables

```sql
users (id, email, password_hash, full_name, role, studio_id, contact_number, address, created_at)
customers (id, email, password_hash, full_name, contact_number, address, created_at)
studios (id, name, owner_id, logo, cover_image, location, rating, review_count, starting_price,
         categories, description, address, contact_info, email, business_hours,
         is_approved, status, printing_available, latitude, longitude,
         business_permit, valid_id, other_docs, blocked_dates, created_at)
categories (id, name, description, created_at)
services (id, studio_id, name, description, category, base_price, duration_minutes,
          image, is_active, available_days, available_slots, requirements, created_at)
packages (id, studio_id, name, description, price, duration_minutes,
          edited_photos_count, included_prints, photographer_count,
          included_services, terms_and_conditions, image, is_active, created_at)
addons (id, studio_id, name, price, description, image, created_at)
bookings (id, studio_id, customer_id, service_id, package_id, booking_date, time_slot,
          addons, customer_name, customer_email, customer_phone, customer_notes,
          requirements_doc, status, total_amount, amount_paid, down_payment_amount,
          remaining_balance, payment_status, final_payment_status, payment_option,
          payment_due_at, cancellation_reason, cancelled_by, cancelled_at, created_at)
payments (id, gcash_session_id, booking_id, studio_id, customer_id, amount,
          payment_type, payment_method, payment_status, proof_of_payment,
          reference_number, gateway_transaction_id, fraud_score, payment_channel,
          payment_date, reviewed_by, reviewed_at, rejection_reason, created_at)
gcash_qr_sessions (id, payment_id, booking_id, print_order_id, studio_id, customer_id,
                   gateway, gateway_payment_intent_id, gateway_source_id,
                   gateway_checkout_url, qr_code_data, amount, payment_type,
                   status, expires_at, webhook_event_id, paid_at, created_at)
webhook_events (event_id, gateway, event_type, payment_id, session_id, raw_payload, processed_at)
print_products (id, studio_id, name, description, size, price, image, in_stock,
                estimated_hours, is_active, created_at)
print_orders (id, studio_id, customer_id, product_id, quantity, uploaded_photo, status,
              total_amount, payment_method, payment_status, proof_of_payment,
              reference_number, shipping_address, created_at)
reviews (id, studio_id, customer_id, customer_name, booking_id, rating, comment,
         status, reply, reply_at, created_at)
photo_proofings (id, booking_id, studio_id, customer_id, photos, watermark_text,
                 watermark_position, watermark_opacity, final_drive_link, status,
                 created_at, updated_at)
media_files (id, owner_id, entity_type, entity_id, purpose, original_name, mime_type,
             size_bytes, checksum, storage_key, access_status, created_at)
faqs (id, studio_id, question, answer, category, created_at)
notifications (id, user_id, studio_id, title, message, is_read, type, channel,
               recipient_contact, created_at)
audit_logs (id, user_id, user_email, action, entity_type, entity_id, timestamp, ip_address)
favorites (id, customer_id, studio_id, created_at)
cms_settings (id, key, value)
studio_availability (id, studio_id, day_of_week, opening_time, closing_time,
                     is_available, slot_duration_minutes, created_at, updated_at)
availability_blackouts (id, studio_id, blackout_date, start_time, end_time, reason,
                        is_recurring, recurrence_rule, created_at)
```

### Migration Tables

```sql
booking_status_history (booking_id, from_status, to_status, changed_by, reason, created_at)
payment_status_history (payment_id, from_status, to_status, changed_by, reason, created_at)
refunds (booking_id, payment_id, amount, reason, status, requested_by, created_at)
payment_intents, payment_ledger, payment_receipts, payment_verifications
```

---

## Frontend Modules & Pages

### Navigation (SPA — `currentPage` state-based routing in `App.tsx`)

| Page Key | Component | Access |
|---|---|---|
| `landing` | LandingPage | Public |
| `directory` | StudioDirectory | Public |
| `studio` | StudioProfile | Public |
| `login` | Login | Public (redirect if logged in) |
| `customer` | CustomerDashboard | CUSTOMER only |
| `studio-dashboard` | StudioDashboard | STUDIO_ADMIN / STUDIO_STAFF |
| `admin` | AdminDashboard | SUPER_ADMIN only |

---

## Page Specifications

### LandingPage
- **Hero section**: full-screen background image (CMS-configurable), animated headline, subtitle, CTA buttons ("Book Now", "Explore Studios")
- **Studio spotlight cards**: top 6 approved studios with 3D tilt hover effect, rating, location, starting price, category tags
- **Category filter tabs**: filter studios by photography category
- **About section**: CMS-configurable title + description
- **Demo video lightbox**: admin-uploaded demo video (YouTube-style modal)
- **FAQ accordion**: expandable questions, loaded from database
- **Sound engine**: plays studio jingle on first user interaction (Web Audio API)
- **Custom pages in Navbar**: dynamically-added pages from CMS

### StudioDirectory
- **Studio grid** (default) and **map view** toggle
- **Search bar** with live filter by studio name/description/address
- **Category filter chips**
- **Price range slider** (min/max starting price)
- **Minimum rating slider**
- **Distance sort** (when user location is available)
- **Studio card** — logo, cover, name, location, rating stars, starting price, category pills, Book button, Favorite button
- **Map mode**: Leaflet map with studio pins, popup cards; haversine distance shown; Cainta corridor shortcuts
- **Studio count badge**

### StudioProfile
- **Cover photo** + **logo** header, studio name, rating, review count, address, contact, hours
- **Embedded Leaflet map** showing studio location
- **Tabs**:
  - **Services**: cards with image, name, description, price, duration, available days/slots
  - **Packages**: cards with image, price, duration, edited photos count, included prints, add-ons, terms
  - **Print Store**: product cards with image carousel, size, price, stock status, estimated turnaround
  - **Reviews**: star rating summary, individual review cards with studio reply support
- **"Book Now" button** — opens BookingWizard for this studio
- **"Order Prints" button** — opens PrintOrderWizard for this studio
- **Favorite toggle** (authenticated customers only)

### Login (combined Login + Register + Forgot Password)
- **Login tab**: email/password form, Google SSO button
- **Register tab**:
  - Customer: name, email, password, contact, address
  - Studio Admin: above + studio name, description, address, map pin (Leaflet), categories, starting price, business hours + document uploads (business permit, valid ID, supporting docs)
- **Forgot Password flow**: email → OTP input → new password
- **Quick role switcher** (dev/demo helper — pre-fills credentials for each role)

### CustomerDashboard
- **My Bookings tab**:
  - List of bookings with status badges, studio name, date/time, amount
  - Actions per status: Pay (opens GCash QR modal or manual payment form), Cancel, Reschedule
  - View photo proofing gallery when booking is Completed
  - Download booking receipt PDF
  - Submit review after completion
- **My Print Orders tab**:
  - Order cards with status, product, quantity, amount, payment status
  - Submit payment (GCash QR or manual proof)
  - Cancel order
- **Favorites tab**: saved studio cards with quick Book link

### StudioDashboard
Multiple tabs/sections:

- **Overview**: summary stats (total bookings, revenue, pending payments, active print orders), recent bookings table, quick actions
- **Bookings**:
  - Filterable list (by status, date, service)
  - Actions: view details, update status (Confirmed/Ongoing/Completed/No Show), assign staff, manage checklist
  - Verify pending payments (approve/reject + reason)
  - Record balance payment (on-site cash collection)
  - Issue refund
- **Calendar**: monthly/weekly booking calendar with booked slots highlighted; Google Calendar and .ics export
- **Print Orders**:
  - Order list with status pipeline
  - Update order status (Confirmed → Processing → Quality Check → Ready for Pickup → Completed)
  - Verify print payment
  - Record cash payment
- **Photo Proofing**:
  - Create proofing gallery for a completed booking
  - Upload watermarked photos
  - Configure watermark (text, position: center/bottom_right/repeat_diagonal, opacity)
  - View client selections and feedback
  - Deliver final Google Drive link
- **Reports**:
  - Sales summary (BarChart) — daily/weekly/monthly breakdown
  - Booking trend chart (AreaChart)
  - Daily closing report with breakdown by payment method (cash/GCash/bank)
  - Download report as PDF
- **Reviews**:
  - View all reviews (pending/approved/rejected)
  - Toggle review visibility
  - Post reply to review
  - Approve/reject pending reviews
- **Studio Management sub-tabs**:
  - **Profile**: edit studio name, logo, cover image, description, address, hours, categories, location coordinates
  - **Services**: CRUD for services (name, description, category, base price, duration, image, available days/slots, requirements)
  - **Packages**: CRUD for packages (name, description, price, duration, edited count, included prints, photographer count, terms)
  - **Add-ons**: CRUD for add-ons (name, price, description, image)
  - **Print Products**: CRUD for print products (name, size, price, image gallery, stock, estimated hours)
  - **Availability**: weekly availability editor (per day: open/close time, slot duration, open/closed toggle); blackout date management
  - **Staff**: invite/remove staff members
  - **GCash Config**: input GCash merchant name and number for manual GCash reference display
  - **FAQs**: add/delete FAQ entries for the studio's chatbot context
  - **Documents**: upload/view business permit, valid ID, supporting docs
  - **Account**: edit profile, change password

### AdminDashboard
Multiple sections:

- **Dashboard overview**: total studios, total users, total bookings, total revenue, monthly trend chart, pending approval queue count
- **Studios**:
  - **Pending queue**: list of studios awaiting approval, with document viewer (business permit, valid ID, other docs), Approve/Reject buttons
  - **All studios**: filterable table, edit, delete/archive, view details
  - **Register studio**: admin-initiated registration form (instantly approved)
- **Finance**:
  - All payments across all studios
  - All reviews (moderate: approve/reject)
- **Management**:
  - **Users**: list all users + customers; delete user; create user (admin-initiated)
  - **Categories**: CRUD for photography categories
  - **CMS**: edit landing page hero title, subtitle, hero background image, features section text, about section text
  - **Custom Pages**: drag-and-drop block-based page builder:
    - Block types: hero, text, gallery, FAQ, CTA, pricing
    - Create/edit/delete pages; toggle `isPublished` and `showInNavbar`
  - **Theme**: live theme customizer — primary color, accent color, background color, font family, header style
  - **Modules**: enable/disable Chatbot, Print Store, Booking, Map features; configure which nav items are hidden
  - **Audio**: upload/configure background jingle + enable/disable toggle
  - **Demo Video**: upload MP4 or set URL for the landing page demo video
  - **Audit Log**: searchable log of all system actions
  - **Account**: edit superadmin profile/password
  - **SMTP**: view Gmail SMTP config status; send test email

---

## Component Specifications

### Navbar
- Logo + studio name
- Navigation links (dynamically filtered by `hiddenNavItems` system setting + custom pages)
- Role-based links: Customer Dashboard | Studio Dashboard | Admin
- Notification bell with unread count badge (opens NotificationCenter panel)
- Favorites count badge (customers)
- Sound toggle icon
- Login/Logout button
- Mobile hamburger menu

### BookingWizard (multi-step modal)
1. **Step 1 — Service Selection**: grid of service cards with image, name, description, price, duration; select one
2. **Step 2 — Package & Add-ons**: optional package selector (cards with price/duration/features); add-on checklist with quantity counters
3. **Step 3 — Date & Time**: calendar picker (blocks past dates, booked slots, blackout dates); available time slots grid derived from service `availableSlots` and studio availability
4. **Step 4 — Your Details**: pre-filled form (name, email, phone, notes); requirements doc file upload
5. **Step 5 — Payment**:
   - Payment option toggle: "Downpayment (30%)" or "Full Payment (100%)"
   - Payment method selector: Cash / GCash / Bank Transfer
   - GCash path → opens `GCashQRModal`
   - Manual path → reference number + proof image upload
   - Order summary sidebar with itemized total
6. Confirmation screen with booking ID and next steps

### PrintOrderWizard (multi-step modal)
1. **Step 1 — Select Product**: product cards with image carousel, size, price, estimated turnaround
2. **Step 2 — Upload Photo**: drag-and-drop image upload with preview
3. **Step 3 — Preview**: 3D frame/backdrop mockup rendered with the uploaded photo using CSS `perspective` transforms
4. **Step 4 — Payment**: GCash QR or manual proof upload; order summary with total

### GCashQRModal
- Displays base64 QR code image from PayMongo API
- 30-minute countdown timer (progress ring)
- Polling: calls `GET /api/payments/gcash/session/:id` every 4 seconds
- SSE listener: receives `payment.confirmed` event via `/api/payments/gcash/stream`
- On confirmed: shows success animation, closes modal, refreshes data
- **Manual fallback**: if QR is scanned but auto-confirm is delayed, customer can input reference number + upload receipt screenshot
- Cancel button clears session

### ClientGallery (Photo Proofing)
- Studio view:
  - Upload watermarked photos (JPEG/PNG, max 8MB each)
  - Configure watermark text, position (center/bottom_right/repeat_diagonal), opacity slider
  - View client's starred selections and feedback notes
  - Input final Google Drive link → click "Deliver Final Photos"
- Customer view:
  - Scrollable photo grid (blurred watermarks on proof thumbnails)
  - Star icon to favorite a photo
  - Text area for feedback/retouch notes per photo
  - "Submit Selections" button

### SystemCalendar
- Monthly grid view with color-coded booking status dots
- Agenda/list view toggle
- Click day → show bookings for that day in a side panel
- "Export to Google Calendar" button (opens Google Calendar URL)
- "Download .ics" button

### AvailabilityManager
- 7 rows (Sunday–Saturday)
- Per row: open/closed toggle, opening time input, closing time input, slot duration dropdown (30/60/90/120 min)
- Save changes persists to `studio_availability` table
- **Blackout dates** section: date picker + start/end time + reason + recurring toggle; table of existing blackouts with delete action

### CaintaStudioMap
- Leaflet map initialized over Cainta, Rizal (14.574°N, 121.111°E)
- Esri World Street Map tiles (fallback OSM)
- Studio pins with popup cards (logo, name, rating, CTA button)
- User location marker (if geolocation permitted)
- Haversine distance badge per studio
- Cainta landmark shortcuts: Robinsons Place, Cainta Rotonda, LRT-2 Masinag
- Zoom controls, "My Location" button

### Chatbot
- Floating chat bubble (bottom-right)
- Opens slide-up panel
- Studio-aware context when viewed from StudioProfile
- Parses Gemini responses for action tokens:
  - `[book_now:studioId]` → renders "Book Now" button
  - `[view_services:studioId]` → renders "View Services" button
  - `[go_page:pageName]` → renders navigation button
  - `[external_link:url|label]` → renders link button
- Typing indicator animation
- Message history (in-session)
- FAQ suggestions: questions that appear ≥2 times are surfaced in the Admin Dashboard's FAQ management

### NotificationCenter
- Slide-in panel from Navbar bell
- Filter tabs: All / Unread / Info / Success / Warning / Error
- Mark single or all as read
- Color-coded type badges

### MotionCard (shared components)
- `Interactive3DTiltCard`: Spring-physics 3D perspective tilt on mouse move, specular highlight layer, press scale feedback
- `MagnetButton`: Cursor-attraction magnetic offset on hover
- `ScrollReveal`: Intersection Observer entrance animations (fade-in-up, scale)
- `ScrollProgressBar`: Fixed top bar showing page scroll progress

### CustomPageView
- Renders `CustomPage.blocks` array:
  - `hero`: full-width background image, title overlay, subtitle, optional CTA button
  - `text`: rich text content in a centered column
  - `gallery`: responsive image grid
  - `faq`: accordion of question/answer pairs
  - `cta`: call-to-action box with button
  - `pricing`: pricing cards with title, price, description

### InstallPrompt
- Detects `beforeinstallprompt` event (Android Chrome) → shows banner with Install button
- On iOS Safari: shows modal with "Tap Share → Add to Home Screen" instructions
- Dismissed state persisted in `localStorage`

---

## Backend API Endpoints

### Authentication

```
POST /api/auth/login              — email + password → session token
POST /api/auth/register           — customer or studio-admin registration
POST /api/auth/google             — Google OAuth tokeninfo verification
GET  /api/auth/session            — validate current token, return user
POST /api/auth/logout             — invalidate token
PUT  /api/auth/account            — update profile or change password
POST /api/auth/forgot-password    — send 6-digit OTP to email
POST /api/auth/verify-reset-otp   — verify OTP → return reset token
POST /api/auth/reset-password     — set new password using reset token
POST /api/auth/verify-email       — verify email with token
```

### Studios

```
GET    /api/studios                            — list approved studios (all if ?includePending + SUPER_ADMIN)
GET    /api/studios/:id                        — single studio with services, packages, addons, reviews, print products
POST   /api/studios                            — create studio (SUPER_ADMIN)
PUT    /api/studios/:id                        — update studio (owner or SUPER_ADMIN)
DELETE /api/studios/:id                        — archive studio (SUPER_ADMIN)
PUT    /api/studios/:id/approve                — approve studio (SUPER_ADMIN)
PUT    /api/studios/:id/reject                 — reject studio (SUPER_ADMIN)
GET    /api/studios/:id/staff                  — list studio staff
POST   /api/studios/:id/staff/invite           — invite staff member
DELETE /api/studios/:id/staff/:staffId         — remove staff
GET    /api/studios/:studioId/availability     — get weekly schedule
POST   /api/studios/:studioId/availability     — create availability row
PUT    /api/studios/:studioId/availability/:id — update availability row
DELETE /api/studios/:studioId/availability/:id — delete availability row
GET    /api/studios/:studioId/blackouts        — list blackout dates
POST   /api/studios/:studioId/blackouts        — add blackout date
DELETE /api/studios/:studioId/blackouts/:id    — remove blackout date
GET    /api/studios/:studioId/services         — get services
POST   /api/studios/:studioId/services         — create service
PUT    /api/studios/:studioId/services/:id     — update service
DELETE /api/studios/:studioId/services/:id     — delete service
POST   /api/studios/:studioId/packages         — create package
PUT    /api/studios/:studioId/packages/:id     — update package
DELETE /api/studios/:studioId/packages/:id     — delete package
POST   /api/studios/:studioId/addons           — create addon
PUT    /api/studios/:studioId/addons/:id       — update addon
DELETE /api/studios/:studioId/addons/:id       — delete addon
```

### Bookings

```
GET  /api/bookings                      — role-filtered list
GET  /api/bookings/:id                  — single booking
POST /api/bookings                      — create booking (CUSTOMER)
PUT  /api/bookings/:id/status           — update status (studio admin+)
PUT  /api/bookings/:id/cancel           — cancel with reason (customer)
PUT  /api/bookings/:id/reschedule       — reschedule to new date/time
PUT  /api/bookings/:id/requirements     — upload requirements doc
PUT  /api/bookings/:id/assign-staff     — assign staff member
PUT  /api/bookings/:id/checklist        — update pre-shoot checklist
POST /api/bookings/:id/balance-payment  — record balance payment (studio admin)
```

### Payments

```
GET  /api/payments                              — role-filtered list
POST /api/payments                              — submit manual payment proof (CUSTOMER)
PUT  /api/payments/:id/verify                   — approve or reject payment (studio admin)
PUT  /api/payments/:id/refund                   — process refund (studio admin)
POST /api/payments/gcash/create-qr              — create PayMongo payment intent + QR
GET  /api/payments/gcash/stream                 — SSE for real-time payment confirmation
GET  /api/payments/gcash/session/:id            — poll session status (4s interval)
POST /api/payments/gcash/submit-proof           — attach manual receipt to GCash session
POST /api/webhooks/paymongo                     — PayMongo webhook (HMAC verified, raw body)
```

### Print

```
GET    /api/print-products                          — list products (optional ?studioId=)
POST   /api/print-products                          — create product
PUT    /api/print-products/:id                      — update product
DELETE /api/print-products/:id                      — delete product
GET    /api/print-orders                            — role-filtered list
POST   /api/print-orders                            — create order (CUSTOMER)
PUT    /api/print-orders/:id/status                 — update order status
PUT    /api/print-orders/:id/cancel                 — cancel order
POST   /api/print-orders/:id/payment                — submit payment proof
PUT    /api/print-orders/:id/payment/verify         — verify payment
PUT    /api/print-orders/:id/payment/record-cash    — record cash payment
```

### Photo Proofing

```
GET  /api/photo-proofing/booking/:bookingId — get gallery for booking
POST /api/photo-proofing                    — create gallery (studio admin)
PUT  /api/photo-proofing/:id/photos         — add/update photos + watermark settings
PUT  /api/photo-proofing/:id/deliver        — set final Google Drive link
```

### Media

```
POST /api/media       — upload file (base64 body → local/Cloudinary; returns /api/media/ID URL)
GET  /api/media/:id   — serve file (access-status check; binary response with mime type)
```

### Reviews

```
GET  /api/reviews                           — public approved reviews
POST /api/reviews                           — submit review (authenticated)
GET  /api/studio/reviews                    — all reviews for studio (owner view)
PUT  /api/studio/reviews/:id/visibility     — toggle visibility
PUT  /api/studio/reviews/:id/reply          — post studio reply
PUT  /api/reviews/:id/approve               — admin approve
PUT  /api/reviews/:id/reject                — admin reject
```

### CMS & System Settings

```
GET  /api/cms                       — key-value CMS map (public)
POST /api/cms                       — update CMS content (SUPER_ADMIN)
GET  /api/admin/settings            — system settings (SUPER_ADMIN)
POST /api/admin/settings            — update settings (SUPER_ADMIN)
GET  /api/system/audio              — public audio URL + enabled flag
GET  /api/system/demo-video         — public demo video URL
GET  /api/admin/smtp-status         — SMTP health check
POST /api/admin/send-test-email     — send test email
```

### Custom Pages

```
GET    /api/custom-pages       — list all pages (public)
POST   /api/custom-pages       — create page (SUPER_ADMIN)
PUT    /api/custom-pages/:id   — update page
DELETE /api/custom-pages/:id   — delete page
```

### Categories, Users, Favorites, Notifications, Audit

```
GET    /api/categories                  — list (public)
POST   /api/categories                  — create (SUPER_ADMIN)
PUT    /api/categories/:id              — update
DELETE /api/categories/:id              — delete
GET    /api/users                       — all users + customers (SUPER_ADMIN)
DELETE /api/users/:id                   — delete user
GET    /api/customers                   — customers only (SUPER_ADMIN)
PUT    /api/admin/users/:id/status      — suspend/approve user
POST   /api/admin/register-studio       — admin-initiated studio registration
POST   /api/admin/create-user           — create user of any role
GET    /api/favorites                   — customer favorites
POST   /api/favorites                   — add favorite
DELETE /api/favorites                   — remove favorite
GET    /api/notifications               — user notifications
PUT    /api/notifications/:id/read      — mark read
PUT    /api/notifications/mark-read     — bulk mark read
POST   /api/notifications/dispatch      — send notification (admin)
GET    /api/audit-logs                  — all logs (SUPER_ADMIN)
GET    /api/audit-events                — filtered events
```

### Reports

```
GET /api/reports/sales          — revenue summary with optional studioId + date range
GET /api/reports/bookings       — booking count trends + status breakdown
GET /api/reports/daily-closing  — same-day closing report by payment method
```

### Chatbot / FAQs

```
POST /api/chatbot/message                       — proxy to Gemini AI with studio context
GET  /api/chatbot/faqs                          — list FAQs (optional ?studioId=)
POST /api/chatbot/faqs                          — add FAQ
DELETE /api/chatbot/faqs/:id                    — delete FAQ
GET  /api/chatbot/faq-suggestions               — AI-learned suggestions (frequency ≥ 2)
POST /api/chatbot/faq-suggestions/:id/approve   — promote to FAQ
```

---

## Business Logic Rules

### Booking Rules
- Only CUSTOMER role can create bookings
- Studio must have `status = 'approved'`
- Booking date must be today or future
- Check studio weekly availability (day open/close times)
- Check blackout dates
- Check existing bookings for time-range overlap: `(StartA < EndB) AND (EndA > StartB)`
- Time slot must fall within the service's `availableSlots` and `availableDays`
- Downpayment = 30% of total; Full Payment = 100%
- Payment due within 24 hours or booking auto-expires
- Booking auto-confirmed when downpayment is verified
- Status flow: `Pending → Awaiting Payment → Confirmed → Ongoing → Completed / Cancelled / Rescheduled / No Show / Expired`
- Auto-expire background job runs every 60 seconds

### Payment Verification Rules
- Only studio admin or super admin can approve/reject payments
- Rejection requires a reason
- Duplicate reference number detection (case-insensitive)
- Receipt PDF emailed to customer on approval
- Booking status updates automatically when payment is verified

### GCash QR Payment Anti-Fraud (4 Layers)
1. HMAC-SHA256 webhook signature verification (timing-safe compare)
2. Idempotency guard via `webhook_events` table
3. Amount integrity check (gateway amount must match session amount ±0.01)
4. Fraud score flagging (from PayMongo response)

### Print Order Status Flow
```
Pending → Confirmed → Processing → Quality Check → Ready for Pickup → Completed
                                                 → Out for Delivery → Completed
```
Can be cancelled at any stage before Completed.

### Booking Status Transitions

```
Pending           → Awaiting Payment, Cancelled, Expired
Awaiting Payment  → Pending, Confirmed, Cancelled, Expired
Confirmed         → Ongoing, Completed, Rescheduled, Cancelled
Rescheduled       → Confirmed, Cancelled
Ongoing           → Completed, No Show
Completed         → (terminal)
```

### Media Security Rules
- All uploads: MIME type validation, max 8MB, SHA-256 checksum deduplication
- Access control statuses: `quarantined → active` (after validation passes)
- **Public purposes** (no auth required): STUDIO_LOGO, STUDIO_COVER, SERVICE_IMAGE, PACKAGE_IMAGE, ADDON_IMAGE, PRINT_PRODUCT_IMAGE, SYSTEM_DEMO_VIDEO, HERO_BACKGROUND
- **Private purposes** (requires auth + ownership check): PAYMENT_PROOF, PRINT_UPLOAD, PROOF_PHOTO, BOOKING_REQUIREMENT, BUSINESS_PERMIT, OWNER_VALID_ID

---

## Design System

### Color Palette
| Token | Value | Usage |
|---|---|---|
| Primary | `#2c2a29` | Navbar, dark backgrounds, text |
| Accent | `#d97706` | CTAs, highlights, badges (amber-600) |
| Background | `#faf9f6` | Page background (warm off-white) |

All three are runtime-configurable by Super Admin via theme settings.

### Typography
- System font stack (`sans` / `serif` / `mono` — configurable)
- Bold display headings with high contrast on dark backgrounds
- Gold accent for CTAs and highlights

### UI Patterns
- Card-based layouts with subtle shadows
- 3D tilt hover on studio cards and feature cards
- Shimmer/skeleton loading states
- Animated page transitions via `AnimatePresence`
- Progress indicators in multi-step wizards
- Status badges with color coding:
  - Pending → amber / Confirmed → green / Cancelled → red / Completed → blue

### Responsive Design
- Mobile-first with Tailwind breakpoints (`sm`, `md`, `lg`, `xl`)
- Collapsible sidebar/drawer on mobile
- Bottom sheet modals on small screens

---

## Environment Variables

```env
# Database
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=cainta_photography_mis
DB_SSL=false
DB_CONNECTION_LIMIT=10
ALLOW_LOCAL_BACKUP=false

# Server
NODE_ENV=development
PORT=3000
FRONTEND_ORIGINS=http://localhost:5173

# Frontend (Vite)
VITE_API_BASE_URL=http://localhost:3000

# Google
GEMINI_API_KEY=
GOOGLE_CLIENT_ID=

# Email (Gmail SMTP)
SMTP_EMAIL=
SMTP_APP_PASSWORD=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
EMAIL_FROM_NAME=Cainta Photography Studio MIS

# Cloudinary (optional)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# PayMongo (GCash)
PAYMONGO_SECRET_KEY=
PAYMONGO_PUBLIC_KEY=
PAYMONGO_WEBHOOK_SECRET=
PAYMONGO_MODE=sandbox

# Security
CREDENTIAL_ENCRYPTION_KEY=
```

---

## Project Folder Structure

```
cainta-photography-studio-mis/
├── src/
│   ├── App.tsx                    # Root: routing state, auth, master data fetch
│   ├── main.tsx                   # React entry
│   ├── index.css                  # Global CSS
│   ├── pages/
│   │   ├── LandingPage.tsx
│   │   ├── StudioDirectory.tsx
│   │   ├── StudioProfile.tsx
│   │   ├── Login.tsx
│   │   ├── CustomerDashboard.tsx
│   │   ├── StudioDashboard.tsx
│   │   ├── AdminDashboard.tsx
│   │   └── AccountSettings.tsx
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── BookingWizard.tsx
│   │   ├── PrintOrderWizard.tsx
│   │   ├── GCashQRModal.tsx
│   │   ├── ClientGallery.tsx
│   │   ├── SystemCalendar.tsx
│   │   ├── AvailabilityManager.tsx
│   │   ├── CaintaStudioMap.tsx
│   │   ├── Chatbot.tsx
│   │   ├── NotificationCenter.tsx
│   │   ├── CustomPageView.tsx
│   │   ├── MotionCard.tsx
│   │   ├── CustomAudioPlayer.tsx
│   │   ├── InstallPrompt.tsx
│   │   └── RescheduleModal.tsx
│   ├── db/
│   │   ├── database.ts            # MySQL pool + in-memory mirror + mapping functions
│   │   └── types.ts               # All TypeScript interfaces and enums
│   └── utils/
│       ├── apiClient.ts           # fetch wrapper with auth headers
│       ├── pdfGenerator.ts        # jsPDF receipts and reports
│       ├── soundEffects.ts        # Web Audio API engine
│       ├── calendarSync.ts        # Google Calendar + .ics export
│       └── leafletConfig.ts       # Leaflet icon fix
├── server.ts                      # Entire Express API backend
├── migrations/                    # Incremental SQL migration files
├── protected-media/               # Local media storage
├── public/
│   ├── Cainta Photography Studio.mp3
│   └── icons/
├── functions/src/index.ts         # Firebase Cloud Functions wrapper
├── api/index.ts                   # Vercel serverless wrapper
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── firebase.json
├── render.yaml
└── vercel.json
```

---

## Key Integration Notes

### PayMongo GCash QR Flow
1. `POST /api/payments/gcash/create-qr` → call PayMongo `/payment_intents` → call `/payment_methods` (type: `qrph`) → attach method to intent → extract `next_action.code.image_url` (base64 QR)
2. Store QR session in `gcash_qr_sessions` with 30-min expiry
3. Frontend polls every 4s via `GET /api/payments/gcash/session/:id`; also subscribes to SSE via `GET /api/payments/gcash/stream`
4. PayMongo sends webhook `payment.paid` → verify HMAC → check idempotency → verify amount → mark session paid → update booking → push SSE to customer

### Google Gemini Chatbot
- System prompt includes: platform context, studio services/packages/FAQs, available action tokens
- Response parsed by frontend regex to convert `[action_token:params]` to interactive React buttons
- FAQ suggestion store (in-memory Map) tracks question frequency; suggestions appear in Admin FAQ panel

### Dual-Mode Database
- On startup: attempt MySQL connection → load all rows into in-memory arrays
- Reads: always from in-memory (fast)
- Writes: simultaneously to MySQL (parameterized query) and in-memory array
- Fallback: if MySQL fails and `ALLOW_LOCAL_BACKUP=true`, load from `db.json`; writes go to `db.json`

### Media Upload Pipeline
- Upload body: `{ fileData: "data:image/png;base64,...", purpose: "...", entityType: "...", entityId: "..." }`
- Server: parse MIME + base64 → validate type/size → SHA-256 checksum (dedup) → save to `protected-media/MEDIA-xxx.ext` or Cloudinary → insert `media_files` row with `access_status = 'active'`
- Serve: `GET /api/media/:id` checks `access_status`, checks caller's ownership, returns binary or Cloudinary redirect

### Server-Sent Events (SSE) for Real-Time Payments
- Customer connects to `GET /api/payments/gcash/stream` (persistent HTTP connection)
- Server stores `res` object in `sseClients` Map keyed by `userId`
- When payment webhook fires: `broadcastSSE(userId, { type: 'payment.confirmed', ... })`
- Heartbeat ping every 25s to prevent proxy timeout disconnects
- Frontend closes SSE connection when payment modal is dismissed

### Security Patterns
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`
- `Cache-Control: no-store` on all `/api/` responses
- Login rate limiting: 5 attempts → 15-minute lockout per IP+email key
- Timing-safe HMAC comparison (`crypto.timingSafeEqual`) for webhook signature
- OTP reset codes: hashed with SHA-256, 10-minute expiry, max 5 attempts
- Password reset tokens: 32-byte random hex, 15-minute expiry
- Session invalidation on password change

---

## Default Seed Data (Categories)

```
Portrait Photography     — Professional close-up and profile pictures
Graduation Photography   — Celebrate milestones with premium cap and gown sessions
Wedding Photography      — Timeless storytelling of your special union
Family Photography       — Cherish precious bonding moments in crisp frames
Self-Shoot Studio        — Express yourself freely behind a private clicker
ID/Passport Photography  — Official, compliant photos in instant minutes
```

## Default CMS Content

```
heroTitle:          "Frame Your Story. <br /> Book Cainta Studios."
heroSubtitle:       "Discover accredited photography studios in Cainta, Rizal..."
heroBackground:     (uploaded image URL)
aboutTitle:         "Pristine Studio Lighting & Retouching"
aboutDescription:   "Experience the difference of calibrated Profoto strobes..."
featuresTitle:      "Spotlight Studios in Cainta, Rizal"
featuresSubtitle:   "Explore photography styles and packages suited to your milestones."
```
