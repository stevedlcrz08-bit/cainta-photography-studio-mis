# Deployment Guide: Vercel (Frontend) + Firebase (Backend)

This guide walks you through deploying the **Cainta Photography Studio MIS** system using:
- **Vercel** for the React + Vite frontend SPA
- **Firebase Cloud Functions (2nd Gen)** for the Express backend API
- **Cloud MySQL** (Google Cloud SQL, Railway, PlanetScale, or Aiven) for the database

---

## 🏗 Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                   User Browser                   │
└───────────────┬──────────────────┬───────────────┘
                │                  │
                ▼                  ▼
    ┌───────────────────────┐  ┌───────────────────────────────────┐
    │  Vercel Edge Network  │  │  Firebase Cloud Functions (2nd Gen)│
    │  (React 19 + Vite SPA)│  │  (Express API: /api/*)             │
    │  dist/                │  │  Node.js 20                        │
    └───────────┬───────────┘  └─────────────────┬─────────────────┘
                │                                │
                │ Proxy Rewrite (/api/*)         │
                └────────────────────────────────┘
                                                 │
                                                 ▼
                               ┌───────────────────────────────────┐
                               │     Managed Cloud MySQL DB        │
                               │  (Google Cloud SQL / Railway etc) │
                               └───────────────────────────────────┘
```

---

## 📋 Prerequisites

1. **Node.js**: v20 or later installed on your system.
2. **Firebase CLI**: Install globally:
   ```bash
   npm install -g firebase-tools
   ```
3. **Vercel Account & CLI** (optional CLI):
   ```bash
   npm install -g vercel
   ```
4. **Cloud MySQL Database**:
   - Because Firebase Functions is serverless, your database must be hosted online with external connectivity.
   - Recommended options:
     - **Google Cloud SQL for MySQL** (Native in Google Cloud / Firebase)
     - **Railway MySQL** (Quick setup, accessible over public URL)
     - **Aiven for MySQL** or **TiDB Cloud**

---

## 🗄️ Step 1: Prepare the Cloud MySQL Database

1. **Create your MySQL database**:
   - Set the database name to: `cainta_photography_mis`
   - Note down the connection parameters:
     - `DB_HOST`: Hostname (e.g. `junction.proxy.rlwy.net` or `34.xxx.xxx.xxx`)
     - `DB_PORT`: Port (e.g. `3306` or assigned port)
     - `DB_USER`: Username (e.g. `root`)
     - `DB_PASSWORD`: Password
     - `DB_NAME`: `cainta_photography_mis`
     - `DB_SSL`: `true` (if your cloud provider requires SSL, e.g. Aiven, Railway, or Google Cloud)

2. **Import the seed schema and data**:
   Import `cainta_photography_mis.sql` into your cloud database:
   ```bash
   # Using standard mysql client:
   mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p<DB_PASSWORD> <DB_NAME> < cainta_photography_mis.sql
   ```
   *(Or import via phpMyAdmin, DBeaver, TablePlus, or your cloud provider's web import console).*

---

## 🔥 Step 2: Deploy Backend to Firebase Cloud Functions

> [!IMPORTANT]
> Firebase Cloud Functions requires your Firebase project to be on the **Blaze (Pay-as-you-go) plan** to allow outbound network connections to external MySQL databases. Firebase provides generous free quotas each month ($0 for light to moderate usage).

### 1. Log in to Firebase
```bash
firebase login
```

### 2. Connect Your Project
If you haven't created a Firebase project yet, create one in the [Firebase Console](https://console.firebase.google.com/).

Link your project in this repository:
```bash
firebase use --add
```
Select your Firebase project and name the alias `default`. (This updates `.firebaserc`).

### 3. Configure Backend Environment Variables
Firebase Functions supports environment variables and secrets.

#### Option A: Using `.env` file in `functions/` (Recommended for initial setup)
Create `functions/.env` with your production variables:
```env
DB_HOST=your-db-host.com
DB_PORT=3306
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=cainta_photography_mis
DB_SSL=true
DB_CONNECTION_LIMIT=3

# Frontend origin (your Vercel app domain once known, or '*' during setup)
FRONTEND_ORIGINS=https://*.vercel.app,http://localhost:3000

# Optional services
GEMINI_API_KEY=your_gemini_api_key_here
SMTP_EMAIL=your-notifications@gmail.com
SMTP_APP_PASSWORD=your-app-password
```

#### Option B: Using Firebase Secrets Manager (For high security)
```bash
firebase functions:secrets:set DB_PASSWORD
```

### 4. Build and Deploy Functions
From the project root directory:
```bash
# Build the functions bundle
npm run build:functions

# Deploy the functions to Firebase
firebase deploy --only functions
```

Once deployment completes, the Firebase CLI will output your function URL:
```
✔  functions[api(us-central1)]: Successful create operation.
Function URL (api): https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api
```
Copy this URL.

### 5. Verify the Firebase Backend
Test that the backend is live and responding:
```bash
curl https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api/api/studios
```
*(You should receive a JSON response with the seeded studios from your MySQL database).*

---

## ▲ Step 3: Deploy Frontend to Vercel

### 1. Update `vercel.json` API Destination
Open [`vercel.json`](vercel.json) in the project root. Replace `https://us-central1-YOUR_FIREBASE_PROJECT_ID.cloudfunctions.net` with your actual Firebase Function URL:

```json
{
  "version": 2,
  "framework": "vite",
  "buildCommand": "vite build",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api/api/$1"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

> [!TIP]
> This rewrite automatically proxies any `/api/*` request from your Vercel frontend directly to your Firebase Cloud Function. This means:
> - No CORS issues in the browser.
> - Zero changes needed in the frontend code.
> - Same-origin security for cookies and headers.

### 2. Deploy to Vercel

#### Deploying via GitHub (Recommended for continuous deployment):
1. Push your code to your GitHub repository.
2. Go to [vercel.com/new](https://vercel.com/new).
3. Import your repository.
4. Vercel will automatically detect the **Vite** framework.
5. (Optional) Set Environment Variable `VITE_API_BASE_URL` if you prefer direct API communication instead of proxying:
   - `VITE_API_BASE_URL`: `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/api`
6. Click **Deploy**.

#### Deploying via Vercel CLI:
```bash
# Install CLI and log in
vercel login

# Deploy production build
vercel --prod
```

### 3. Update Allowed Origins in Firebase
Once Vercel assigns your production domain (e.g., `https://cainta-photography-mis.vercel.app`):
1. Update `FRONTEND_ORIGINS` in your `functions/.env` to include:
   ```env
   FRONTEND_ORIGINS=https://cainta-photography-mis.vercel.app,https://*.vercel.app
   ```
2. Redeploy functions:
   ```bash
   firebase deploy --only functions
   ```

---

## 🔍 Step 4: Verification & Testing

1. **Visit your Vercel App URL** in a browser (e.g. `https://your-app.vercel.app`).
2. Verify that:
   - Studio directory loads all studios and images.
   - Search and category filters work properly.
   - Admin Login works using seeded administrator credentials.
   - Booking wizard calculates prices and communicates with `/api/bookings`.
   - AI Chatbot responds via `/api/chatbot/message`.

---

## 🛠️ Summary of Created / Modified Files

| File | Purpose |
|---|---|
| [`functions/package.json`](functions/package.json) | Firebase Functions dependencies & build scripts |
| [`functions/tsconfig.json`](functions/tsconfig.json) | TypeScript configuration for Cloud Functions |
| [`functions/src/index.ts`](functions/src/index.ts) | 2nd-Gen Firebase Function entrypoint (`api`) |
| [`firebase.json`](firebase.json) | Firebase deployment configuration |
| [`.firebaserc`](.firebaserc) | Firebase project alias configuration |
| [`vercel.json`](vercel.json) | Vercel SPA routing and `/api/*` Firebase proxy rules |
| [`src/utils/apiClient.ts`](src/utils/apiClient.ts) | Added `resolveApiUrl` & `VITE_API_BASE_URL` support |
| [`src/db/database.ts`](src/db/database.ts) | Optimized MySQL pool limits for serverless scaling |
| [`server.ts`](server.ts) | Serverless startup guard & wildcard/Vercel CORS support |
| [`package.json`](package.json) | Added `build:frontend` and `build:functions` helper scripts |
