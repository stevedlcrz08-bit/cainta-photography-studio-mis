# Local Development Setup — Cainta Photography Studio MIS

This guide explains how to run the entire system on your local machine using XAMPP. Use this as a backup when the production environment (Firebase Hosting + Render backend) is unavailable — for example, during your capstone defense if the internet is down or Render cold-starts.

> **Production is not affected by anything in this guide.** The Firebase and Render deployment has its own environment variables configured directly on those platforms. Nothing here touches them.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [First-Time Setup](#3-first-time-setup)
4. [Running the System Locally](#4-running-the-system-locally)
5. [Verifying Everything Works](#5-verifying-everything-works)
6. [Feature Availability Locally](#6-feature-availability-locally)
7. [Switching Between Local and Production](#7-switching-between-local-and-production)
8. [Troubleshooting](#8-troubleshooting)
9. [Environment Variable Reference](#9-environment-variable-reference)

---

## 1. Architecture Overview

```
LOCAL (localhost)
─────────────────────────────────────────────────────
  Browser  →  http://localhost:3000
               │
               ▼
  Express server (server.ts, port 3000)
    ├── Serves the React frontend via Vite dev middleware
    ├── Handles all /api/* routes
    ├── Connects to XAMPP MySQL (localhost:3306)
    └── Stores uploaded media to protected-media/ folder

PRODUCTION (deployed)
─────────────────────────────────────────────────────
  Browser  →  https://one-cainta-photography-mis.web.app  (Firebase Hosting)
               │
               ▼  VITE_API_BASE_URL
  Express server on Render  →  MySQL on Railway
    └── Media stored on Cloudinary CDN
```

The key difference: locally everything runs as a single process on port 3000. The Vite dev proxy transparently forwards `/api/*` requests from the frontend to the same Express server — no separate frontend build needed.

---

## 2. Prerequisites

Install these before starting. Tick each one off.

| Tool | Version | Download |
|---|---|---|
| **XAMPP** | Any recent | https://www.apachefriends.org |
| **Node.js** | v20 or newer (v24 recommended) | https://nodejs.org |
| **npm** | Comes with Node | — |

Verify your versions:
```
node --version    # should print v20.x.x or higher
npm --version     # should print 10.x.x or higher
```

> XAMPP is only needed for its MySQL service. You do not need Apache.

---

## 3. First-Time Setup

Complete these steps once. After that, daily use is just two commands (see Section 4).

### Step 1 — Start XAMPP MySQL

1. Open the **XAMPP Control Panel**.
2. Click **Start** next to **MySQL**.
3. The MySQL row should turn green and show port **3306**.

> Apache is not required. Only MySQL needs to be running.

### Step 2 — Create the database

Open your browser and go to **http://localhost/phpmyadmin**.

In the SQL tab, run:
```sql
CREATE DATABASE IF NOT EXISTS cainta_photography_mis
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

Or create it from the **New** button in the left sidebar — name it exactly `cainta_photography_mis`.

### Step 3 — Import the database schema and data

The project includes a full SQL dump. In phpMyAdmin:

1. Select the `cainta_photography_mis` database in the left sidebar.
2. Click the **Import** tab.
3. Click **Choose File** and select `cainta_photography_mis.sql` from the project root.
4. Click **Go**.

This creates all tables and inserts the existing data (studios, users, services, packages, etc.).

> If the import fails partway, run `DROP DATABASE cainta_photography_mis;`, recreate it, and import again.

### Step 4 — Install Node dependencies

From the project root (where `package.json` lives):
```
npm install
```

This installs all frontend and backend dependencies. It only needs to run once, or again after `package.json` changes.

### Step 5 — Configure your local environment file

The file `.env.development` was created at the project root. Open it and fill in **only the values you need**:

**Required — fill these in:**
```
# If your XAMPP MySQL root has a password, set it here. Otherwise leave blank.
DB_PASSWORD=
```

**Optional but recommended for full functionality:**
```
# AI chatbot — get a free key at https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIza...

# Email sending — Gmail App Password (myaccount.google.com/apppasswords)
SMTP_EMAIL=your@gmail.com
SMTP_APP_PASSWORD=xxxx xxxx xxxx xxxx

# Google Sign-In — same Client ID as production
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```

**Leave blank for local — these fall back gracefully:**
- `PAYMONGO_*` — GCash QR payments will be unavailable; cash/manual payment still works.
- `CLOUDINARY_*` — Media uploads save to the local `protected-media/` folder instead.

> The `.env.development` file is git-ignored. Your credentials never get committed.

---

## 4. Running the System Locally

Every time you want to run locally, do these two things:

### Step 1 — Start XAMPP MySQL

Open XAMPP Control Panel → click **Start** next to **MySQL**.

### Step 2 — Start the application

Open a terminal in the project root and run:
```
npm run dev:local
```

Wait for this output:
```
📸 CAINTA PHOTOGRAPHY STUDIO MIS (LAN Access Ready)
➜ Local:   http://localhost:3000
➜ Network: http://192.168.x.x:3000
```

Then open **http://localhost:3000** in your browser.

That's it. The full system — frontend, backend, and database — is running locally.

### Accessing from other devices on the same Wi-Fi

The Network URL (e.g. `http://192.168.1.5:3000`) lets any phone, tablet, or laptop on the same network access the running system. Useful for demonstrating on a projector or testing on mobile.

### Stopping the server

Press `Ctrl + C` in the terminal. Then stop MySQL in XAMPP if you no longer need it.

---

## 5. Verifying Everything Works

After the server starts, open **http://localhost:3000** and check:

| Check | What to look for |
|---|---|
| Landing page loads | Hero image, studio listings appear |
| Studio directory | Studios from your local DB are listed |
| Login works | Can log in with a seeded account (e.g. superadmin) |
| AI Chatbot | Chat bubble appears; responds if `GEMINI_API_KEY` is set |
| File upload | Upload a studio logo — saved to `protected-media/` locally |
| Database writes | Create a booking — verify it appears in phpMyAdmin |

### Default superadmin credentials

Check the `add_superadmin.sql` file in the project root for the seeded superadmin email and password. Or query phpMyAdmin:
```sql
SELECT email, role FROM users WHERE role = 'SUPER_ADMIN' LIMIT 5;
```

---

## 6. Feature Availability Locally

| Feature | Local status | Notes |
|---|---|---|
| Frontend UI | ✅ Full | Served by Vite dev middleware with HMR |
| All API routes | ✅ Full | Same Express server as production |
| Authentication (email/password) | ✅ Full | Custom sessions, no Firebase Auth needed |
| Google Sign-In | ✅ If configured | Needs `GOOGLE_CLIENT_ID` in `.env.development` |
| MySQL database | ✅ Full | Via XAMPP — same schema as production |
| Media uploads | ✅ Full | Saved to `protected-media/` folder (no Cloudinary needed) |
| Existing media files | ✅ Full | `protected-media/` folder already has 53 files |
| AI Chatbot (Gemini) | ✅ If configured | Needs `GEMINI_API_KEY` — works with free tier key |
| Email (booking confirmations) | ✅ If configured | Needs Gmail App Password in `.env.development` |
| GCash QR payment (PayMongo) | ⚠️ If configured | Needs sandbox PayMongo keys; cash payment always works |
| PDF receipt generation | ✅ Full | jspdf runs entirely on the server, no external service |
| Firebase Hosting | N/A locally | Only used for production frontend hosting |
| Cloudinary CDN | ⚠️ Optional | Falls back to local disk automatically if not configured |

### About the AI chatbot locally

The chatbot calls Google's Gemini API directly over HTTPS — it works the same locally as in production, as long as:
- `GEMINI_API_KEY` is set in `.env.development`
- The machine running the server has internet access

If the machine has no internet, the chatbot will return a graceful "temporarily unavailable" message. All other features continue to work offline.

---

## 7. Switching Between Local and Production

The two environments are completely independent. No source code changes are needed to switch.

### To use the local backup:

```
npm run dev:local
```

Open **http://localhost:3000**

### To deploy/use production:

Production runs continuously on Firebase + Render. You don't need to "start" it. Just open:

```
https://one-cainta-photography-mis.web.app
```

### To rebuild and redeploy production (after code changes):

```
# Rebuild frontend and deploy to Firebase Hosting
npm run build:frontend
npm run deploy:hosting

# Or deploy everything (hosting + functions)
npm run deploy:firebase
```

### Summary of which env file does what:

| File | When it's used | Safe to commit? |
|---|---|---|
| `.env.development` | `npm run dev:local` — your local credentials | ❌ Never (git-ignored) |
| `.env` | `npm run dev` — fallback dev defaults | ❌ Never (git-ignored) |
| `.env.production` | `npm run build` / `npm run build:frontend` — baked into the Vite bundle | ✅ Yes (no secrets, only public API URL) |
| `.env.example` | Documentation template only — not loaded at runtime | ✅ Yes |

**The production Render backend** reads its environment variables from the Render dashboard (Environment tab), not from any `.env` file in the repo. Changing `.env.development` locally has zero effect on Render.

---

## 8. Troubleshooting

### "MySQL connection failed" on startup

- Make sure XAMPP MySQL is running (green in Control Panel, port 3306).
- Check `.env.development` — `DB_HOST` should be `127.0.0.1`, `DB_NAME` should be `cainta_photography_mis`.
- If your XAMPP MySQL root account has a password, set `DB_PASSWORD=yourpassword` in `.env.development`.
- The server will still start thanks to `ALLOW_LOCAL_BACKUP=true` — it falls back to `db.json`. But the database will be read-only (writes won't persist across restarts).

### "Port 3000 already in use"

Another process is using port 3000. Either stop it, or change the port:
```
# In .env.development, add:
PORT=3001
```
Then access the app at **http://localhost:3001**.

### Page loads but shows no studios or data

- The database import may not have completed. Go to phpMyAdmin and verify the `cainta_photography_mis` tables have rows.
- Check the terminal for `[Database] Hydration complete!` — it lists the counts of loaded records.

### Google Sign-In fails locally

- Add `http://localhost:3000` to the **Authorized JavaScript origins** in your Google Cloud Console OAuth credential.
- Make sure both `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` in `.env.development` have the same value.

### Chatbot says "temporarily unavailable"

- Set `GEMINI_API_KEY` in `.env.development` with a valid key starting with `AIza`.
- Get a free key at https://aistudio.google.com/app/apikey (no billing required for Gemini 2.5 Flash free tier).

### Uploaded images not showing

- Local uploads go to the `protected-media/` folder in the project root.
- The `/api/media/:id` endpoint serves them. Make sure you're accessing the app via `http://localhost:3000` (not a different port or IP) — the media URLs are relative.

### `npm run dev:local` command not found / fails

- Make sure you ran `npm install` first.
- Verify you are in the project root (where `package.json` is).
- Verify Node.js is v20 or newer: `node --version`

---

## 9. Environment Variable Reference

Full list of variables used by the system. See `.env.example` for descriptions of each one.

| Variable | Required locally? | Where to get it |
|---|---|---|
| `DB_HOST` | ✅ Yes | `127.0.0.1` for XAMPP |
| `DB_PORT` | ✅ Yes | `3306` (XAMPP default) |
| `DB_USER` | ✅ Yes | `root` (XAMPP default) |
| `DB_PASSWORD` | Only if set | XAMPP MySQL root password |
| `DB_NAME` | ✅ Yes | `cainta_photography_mis` |
| `ALLOW_LOCAL_BACKUP` | ✅ Yes | Set to `true` locally |
| `GEMINI_API_KEY` | Recommended | https://aistudio.google.com/app/apikey |
| `GOOGLE_CLIENT_ID` | Optional | Google Cloud Console |
| `VITE_GOOGLE_CLIENT_ID` | Optional | Same as above |
| `SMTP_EMAIL` | Optional | Your Gmail address |
| `SMTP_APP_PASSWORD` | Optional | Gmail App Password |
| `PAYMONGO_SECRET_KEY` | Optional | dashboard.paymongo.com |
| `PAYMONGO_PUBLIC_KEY` | Optional | dashboard.paymongo.com |
| `PAYMONGO_WEBHOOK_SECRET` | Optional | dashboard.paymongo.com |
| `PAYMONGO_MODE` | Optional | `sandbox` for testing |
| `CREDENTIAL_ENCRYPTION_KEY` | Optional | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CLOUDINARY_CLOUD_NAME` | Optional | cloudinary.com dashboard |
| `CLOUDINARY_API_KEY` | Optional | cloudinary.com dashboard |
| `CLOUDINARY_API_SECRET` | Optional | cloudinary.com dashboard |

All of these go in `.env.development` for local use. The production values are set separately in the Render dashboard and are never stored in this repository.
