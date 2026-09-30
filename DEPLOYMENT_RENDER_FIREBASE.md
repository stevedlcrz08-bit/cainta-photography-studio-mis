# 🚀 Deployment Guide: Firebase Hosting (Frontend) + Render.com (Backend)

This guide walks you through deploying:
- **Frontend**: **Firebase Hosting** (100% Free Spark Plan, global Google CDN, no credit card required)
- **Backend**: **Render.com** (Free Web Service running Express Node.js API)
- **Database**: Cloud MySQL (Railway, Aiven, TiDB, or Google Cloud SQL)

---

## 🏗 Architecture Diagram

```
┌────────────────────────────────────────────────────────┐
│                      User Browser                      │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
  Static Assets │                        │ API Requests (/api/*)
  & React SPA   │                        │ (VITE_API_BASE_URL)
                ▼                        ▼
    ┌───────────────────────┐  ┌───────────────────────────────────┐
    │   Firebase Hosting    │  │            Render.com             │
    │  (React 19 + Vite SPA)│  │       (Express Node.js API)       │
    │  dist/                │  │  https://<service>.onrender.com   │
    └───────────────────────┘  └─────────────────┬─────────────────┘
                                                 │
                                                 │ MySQL Connection
                                                 ▼
                               ┌───────────────────────────────────┐
                               │       Managed Cloud MySQL DB      │
                               │   (Railway, Aiven, TiDB Cloud)    │
                               └───────────────────────────────────┘
```

---

## 📋 Part 1: Deploy Backend to Render.com

### Step 1: Push Your Code to GitHub / GitLab
Render connects directly to your Git repository:
1. Make sure your project is pushed to a GitHub or GitLab repository.
   ```bash
   git add .
   git commit -m "Configure Render and Firebase deployment"
   git push origin main
   ```

### Step 2: Create Web Service on Render
1. Sign up or log in at **[render.com](https://render.com/)** (Free, GitHub login supported).
2. Click **New +** &rarr; **Web Service**.
3. Select your GitHub repository (`cainta-photography-studio-mis`).
4. Configure the Web Service settings:
   - **Name**: `cainta-photography-mis-backend`
   - **Region**: `Singapore` *(Fastest for Philippines / Cainta)*
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
   - **Instance Type**: `Free`

### Step 3: Add Environment Variables in Render
In the **Environment Variables** section on Render, add:
| Key | Value / Description |
|---|---|
| `NODE_ENV` | `production` |
| `DB_HOST` | Hostname of your Cloud MySQL database |
| `DB_PORT` | `3306` |
| `DB_USER` | Database username |
| `DB_PASSWORD` | Database password |
| `DB_NAME` | `cainta_photography_mis` |
| `DB_SSL` | `true` (if your cloud provider requires SSL) |
| `ALLOW_LOCAL_BACKUP` | `false` |
| `FRONTEND_ORIGINS` | `https://one-cainta-photography-mis.web.app,https://one-cainta-photography-mis.firebaseapp.com,http://localhost:3000` |
| `GEMINI_API_KEY` | *(Optional) Your Gemini AI key* |
| `SMTP_EMAIL` | *(Optional) Your notification email* |
| `SMTP_APP_PASSWORD` | *(Optional) Your email app password* |
| `CLOUDINARY_CLOUD_NAME` | Your Cloudinary cloud name (e.g. `cainta-photography-studio`) |
| `CLOUDINARY_API_KEY` | Your Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Your Cloudinary API secret |

Click **Create Web Service**. Render will build and start your backend API!

### Step 4: Copy Your Render Backend URL
Once deployed, Render gives you a public URL at the top of the dashboard, for example:
`https://cainta-photography-mis-backend.onrender.com`

Test it in your browser:
`https://cainta-photography-mis-backend.onrender.com/api/studios`
It should return the studios JSON!

---

## 🌐 Part 2: Deploy Frontend to Firebase Hosting

Once you have your Render URL:

### Step 1: Set the API URL for Production Build
Create or update `.env.production` in your project root:
```env
VITE_API_BASE_URL=https://cainta-photography-mis-backend.onrender.com
```
*(Replace with your actual Render URL).*

### Step 2: Deploy to Firebase Hosting
In your terminal, run:
```powershell
npm run deploy:hosting
```
*(or `firebase deploy`)*

#### What happens:
1. `predeploy` runs `npm run build:frontend` with your production API URL baked in.
2. Firebase uploads your optimized `dist/` bundle to Google CDN.
3. Your frontend is live immediately at:
   - **`https://one-cainta-photography-mis.web.app`**
   - **`https://one-cainta-photography-mis.firebaseapp.com`**

---

## 🔒 CORS & Security
Your `server.ts` has CORS protection. By adding your Firebase domains (`https://one-cainta-photography-mis.web.app`) to `FRONTEND_ORIGINS` on Render, the frontend can securely send API requests, authorization tokens, and booking data.
