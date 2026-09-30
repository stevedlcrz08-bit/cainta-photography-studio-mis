# 🚀 Complete Firebase Deployment Guide (Frontend + Backend)

This guide walks you through deploying the **Cainta Photography Studio MIS** system **entirely onto Firebase**:
- **Firebase Hosting**: Serves the high-performance React 19 + Vite SPA with global Google CDN caching.
- **Firebase Cloud Functions (2nd Gen)**: Runs the Express.js backend API (/api/*) in a serverless Node 20 environment.
- **Unified Single-Domain Routing**: Firebase Hosting automatically proxies `/api/**` to Cloud Functions on the same origin (zero CORS configuration required).
- **Cloud MySQL Database**: Connected directly to Firebase Cloud Functions for all relational data.

---

## 🏗 Architecture Diagram

```
                              ┌───────────────────────────┐
                              │  Client Browser / Mobile  │
                              └─────────────┬─────────────┘
                                            │
                             https://<project-id>.web.app
                                            │
                                            ▼
                             ┌─────────────────────────────┐
                             │       Firebase Hosting      │
                             │   (Global Google CDN Edge)  │
                             └──────┬───────────────┬──────┘
                                    │               │
              Static Assets / SPA   │               │ /api/** (Proxy Rewrite)
              (/* -> /index.html)   │               │
                                    ▼               ▼
                         ┌──────────────────┐  ┌─────────────────────────┐
                         │ React 19 Frontend│  │ Firebase Cloud Functions │
                         │ (dist/ bundle)   │  │ (2nd Gen, Node 20)       │
                         └──────────────────┘  │ Express API (/api/*)    │
                                               └────────────┬────────────┘
                                                            │
                                                            ▼
                                               ┌─────────────────────────┐
                                               │ Managed Cloud MySQL DB  │
                                               │ (Google Cloud SQL,      │
                                               │  Railway, Aiven, TiDB)  │
                                               └─────────────────────────┘
```

---

## 📋 Prerequisites

1. **Node.js**: v20 or higher installed.
2. **Firebase CLI**:
   ```bash
   npm install -g firebase-tools
   ```
3. **Firebase Project**:
   - Go to the [Firebase Console](https://console.firebase.google.com/).
   - Ensure your project is created (e.g., `one-cainta-photography-mis`).
   - **Upgrade to Blaze (Pay-as-you-go) Plan**:
     > [!IMPORTANT]
     > Google requires the Blaze plan for Cloud Functions that make outbound network calls to external MySQL databases. Firebase provides generous free tier quotas each month ($0 for light to moderate usage).
4. **Cloud MySQL Database**:
   Because Firebase Cloud Functions runs in a serverless container in Google Cloud, your MySQL database must be accessible over the internet.
   - **Recommended Providers**:
     - **Railway MySQL** (Quickest setup: `railway.app`)
     - **Google Cloud SQL for MySQL** (Native in Google Cloud / same region)
     - **Aiven for MySQL** (`aiven.io`)
     - **TiDB Cloud** (`tidbcloud.com`)

---

## 🗄️ Step 1: Set Up Cloud MySQL Database

1. Create a MySQL database instance on your cloud provider.
2. Note your connection details:
   - `DB_HOST`: Hostname / IP (e.g. `junction.proxy.rlwy.net` or `34.xxx.xxx.xxx`)
   - `DB_PORT`: Port (e.g. `3306`)
   - `DB_USER`: Username (e.g. `root`)
   - `DB_PASSWORD`: Password
   - `DB_NAME`: `cainta_photography_mis`
   - `DB_SSL`: `true` (if your cloud provider requires SSL)
3. Import the database schema and seed data into your cloud database:
   ```bash
   # From your project root:
   mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p<DB_PASSWORD> cainta_photography_mis < cainta_photography_mis.sql
   ```
   *(Or import `cainta_photography_mis.sql` via phpMyAdmin, TablePlus, DBeaver, or your provider's web console).*

---

## ⚙️ Step 2: Configure Firebase Backend Environment Variables

Firebase Functions reads environment variables from `functions/.env` during deployment.

1. Create a `functions/.env` file (copy from `functions/.env.example`):
   ```bash
   cp functions/.env.example functions/.env
   ```
2. Fill in your production credentials:
   ```env
   # Database Credentials (pointing to your cloud MySQL)
   DB_HOST=your-cloud-mysql-host.com
   DB_PORT=3306
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   DB_NAME=cainta_photography_mis
   DB_SSL=true
   DB_CONNECTION_LIMIT=3
   ALLOW_LOCAL_BACKUP=false

   # Runtime Settings
   NODE_ENV=production
   FRONTEND_ORIGINS=https://one-cainta-photography-mis.web.app,https://one-cainta-photography-mis.firebaseapp.com

   # Optional External Integrations
   GEMINI_API_KEY=your_gemini_api_key
   SMTP_EMAIL=your_email@gmail.com
   SMTP_APP_PASSWORD=your_google_app_password
   EMAIL_FROM="Cainta Photography MIS" <your_email@gmail.com>

   # GCash / PayMongo (Optional)
   PAYMONGO_SECRET_KEY=sk_live_xxxx
   PAYMONGO_PUBLIC_KEY=pk_live_xxxx
   PAYMONGO_MODE=sandbox
   ```

---

## 🚀 Step 3: Deploy to Firebase

### 1. Log in to Firebase
```bash
firebase login
```

### 2. Verify Active Firebase Project
```bash
firebase use
```
It should show: `Active project: one-cainta-photography-mis (default)`.
*(If not, run `firebase use one-cainta-photography-mis`).*

### 3. Deploy Everything (Frontend + Backend)
Run the automated deployment script:
```bash
npm run deploy:firebase
```
Or directly using Firebase CLI:
```bash
firebase deploy
```

#### What happens automatically during deployment:
1. `hosting.predeploy` runs `npm run build:frontend` → produces fresh `dist/` bundle.
2. `functions.predeploy` runs `npm --prefix functions run build` → compiles `functions/lib/index.js`.
3. Firebase deploys Cloud Function `api` (2nd Gen, region `us-central1`).
4. Firebase deploys Firebase Hosting (`dist/`) with rewrites to `api`.
5. Outputs your live URLs:
   - Hosting URL: `https://one-cainta-photography-mis.web.app`
   - Alternative URL: `https://one-cainta-photography-mis.firebaseapp.com`

---

## 🎯 Modular Deployments (Fast Updates)

When you only changed the frontend or backend, you can deploy individually:

### Deploy Frontend Only:
```bash
npm run deploy:hosting
# or: firebase deploy --only hosting
```

### Deploy Backend Functions Only:
```bash
npm run deploy:functions
# or: firebase deploy --only functions
```

---

## 🌐 Step 4: Custom Domain Setup (Optional)

To connect your own domain (e.g. `caintaphotography.com` or `app.caintaphotography.com`):
1. Go to **Firebase Console** → **Hosting**.
2. Click **Add Custom Domain**.
3. Enter your domain name and follow the DNS verification instructions:
   - Add the TXT record for ownership verification.
   - Add the `A` records or `CNAME` records provided by Firebase.
4. Firebase automatically provisions and renews a free **SSL certificate** within a few hours.

---

## 📊 Step 5: Monitoring and Logs

View live logs from your backend API anytime:

```bash
# View recent logs in your terminal:
firebase functions:log

# Stream live real-time logs:
firebase functions:log --only api
```

You can also view rich logs, execution graphs, and latency metrics in the [Google Cloud Console Logs Explorer](https://console.cloud.google.com/logs).

---

## 🛠️ Summary of Files Configured

| File | Purpose |
|---|---|
| [firebase.json](file:///c:/xampp/htdocs/cainta-photography-studio-mis/firebase.json) | Firebase Hosting config, SPA rewrites, and `/api/**` proxy to Cloud Function `api` |
| [.firebaserc](file:///c:/xampp/htdocs/cainta-photography-studio-mis/.firebaserc) | Project alias mapping to `one-cainta-photography-mis` |
| [functions/src/index.ts](file:///c:/xampp/htdocs/cainta-photography-studio-mis/functions/src/index.ts) | Cloud Functions entrypoint (onRequest handler with region `us-central1`) |
| [functions/package.json](file:///c:/xampp/htdocs/cainta-photography-studio-mis/functions/package.json) | Cloud Functions dependencies for cloud container build |
| [functions/.env.example](file:///c:/xampp/htdocs/cainta-photography-studio-mis/functions/.env.example) | Environment variables template for Cloud Functions backend |
| [server.ts](file:///c:/xampp/htdocs/cainta-photography-studio-mis/server.ts) | Express server adapted for serverless execution and temp media storage |
| [src/db/database.ts](file:///c:/xampp/htdocs/cainta-photography-studio-mis/src/db/database.ts) | Database connection pool configured with serverless connection limits |
| [package.json](file:///c:/xampp/htdocs/cainta-photography-studio-mis/package.json) | Added `deploy:firebase`, `deploy:hosting`, `deploy:functions` scripts |
