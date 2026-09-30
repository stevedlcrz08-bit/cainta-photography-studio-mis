# Fix: Dead Images — Integrate Cloudinary for Permanent Storage

## Problem
Ang images na ina-upload (studio logos, covers, payment proofs) ay naka-imbak sa **local disk** ng Render server:

```
MEDIA_ROOT = process.cwd() + "/protected-media"
```

Sa Render free tier, ang local disk ay **ephemeral (pansamantala)**:
- Mababura ang lahat ng files kapag nag-restart ang server
- Nag-re-restart ang Render free tier server araw-araw (automatic)
- Kaya lahat ng uploaded images ay nagiging **dead images** pagkatapos ng restart

## Solution: Cloudinary Integration

I-upload ang lahat ng files sa **Cloudinary** (permanent cloud storage) sa halip na sa local disk.

## Steps

### Step 1: Kumuha ng Cloudinary credentials (5 minuto)
1. Pumunta sa https://cloudinary.com → Sign Up (libre, walang credit card)
2. Dashboard → makikita ang **Cloud Name, API Key, API Secret**

### Step 2: Install Cloudinary package
```bash
npm install cloudinary
```

### Step 3: Modify `server.ts`
- Add Cloudinary import + config
- Update `saveProtectedMedia()` to upload to Cloudinary
- Update `GET /api/media/:id` to redirect to Cloudinary URL

### Step 4: Add env vars
- Sa `.env` locally
- Sa Render Dashboard → Environment

## Files to Modify
- `server.ts` — main changes
- `.env` — add 3 Cloudinary keys locally

## Verification
- Mag-upload ng image → dapat makita agad
- Mag-deploy ng bagong version → hindi dapat mawala ang image
