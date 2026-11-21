# GatherIQ — 100% Free Tier Deployment Guide

This guide details how to deploy GatherIQ using **exclusively free hosting tiers** with zero paid plans, zero Render database charges, and no unexpected billing.

---

## Architecture Overview (100% Free Services)

| Component | Provider | Free Tier Specification | Cost |
| :--- | :--- | :--- | :--- |
| **Frontend** | [Vercel](https://vercel.com) | Hobby Plan (Next.js, Edge Network, Global CDN) | **$0.00** |
| **Backend API** | [Render](https://render.com) | Free Web Service (Python 3.12, 512 MB RAM, Shared CPU) | **$0.00** |
| **Database** | [Neon](https://neon.tech) | Free Serverless PostgreSQL (0.5 GiB storage, auto-suspend) | **$0.00** |

---

## Step 1: Create Free PostgreSQL Database on Neon

Render no longer offers free persistent PostgreSQL databases (Render charges $7/mo for PostgreSQL). **Neon provides a permanent, generous free serverless PostgreSQL database.**

1. Go to [Neon Console](https://console.neon.tech) and sign up (no credit card required).
2. Click **Create Project**:
   - **Project Name:** `gatheriq`
   - **Database Name:** `gatheriq` (or default `neondb`)
   - **Region:** Choose `US East (Ohio)` or a region close to your Render deployment.
3. Once created, copy the **Connection string** from the Neon dashboard:
   ```
   postgresql://gatheriq_owner:your_password@ep-divine-pond-a5abcxyz.us-east-2.aws.neon.tech/gatheriq?sslmode=require
   ```
   *(Both direct connection and pooled connection `-pooler` URLs are supported).*
4. Keep this connection string for Step 2.

---

## Step 2: Deploy Backend to Render Free Web Service

You can deploy using the included **Render Blueprint (`render.yaml`)** or manually via the Render Dashboard.

### Option A: Render Blueprint (Recommended)
1. Go to [Render Dashboard](https://dashboard.render.com/) -> **New +** -> **Blueprint**.
2. Connect your `GatherIQ` repository (`main` branch).
3. Render reads `render.yaml` (configured with `plan: free` and zero paid databases).
4. Render will prompt you for:
   - `DATABASE_URL`: Paste your **Neon PostgreSQL connection string** from Step 1.
   - `CORS_ORIGINS`: Set to your Vercel frontend domain (e.g. `https://gatheriq.vercel.app`).
   - `SUPER_ADMIN_PASSWORD`: Enter your initial secure password for the platform Super Admin.
5. Click **Apply**. Render builds the service, runs database migrations, and provisions the Super Admin.

---

### Option B: Manual Render Dashboard Setup
1. In Render Dashboard, click **New +** -> **Web Service**.
2. Connect repository `https://github.com/Onwuegbulee/GatherIQ`.
3. Configure settings:
   - **Name:** `gatheriq-backend`
   - **Region:** Same region as your Neon database (e.g. `Oregon` or `Ohio`).
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Python 3`
   - **Build Command:**
     ```bash
     pip install --upgrade pip && pip install -r requirements.txt
     ```
   - **Start Command:**
     ```bash
     alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT
     ```
   - **Health Check Path:** `/health`
   - **Plan:** Select **Free** ($0/month).

---

## Step 3: Configure Environment Variables

### A. Render Backend Environment Variables
In the Render Web Service under **Environment**, configure:

| Variable | Required | Value | Purpose |
| :--- | :---: | :--- | :--- |
| `PYTHON_VERSION` | **Yes** | `3.12.8` | Enforces Python 3.12 compatibility |
| `ENVIRONMENT` | **Yes** | `production` | Enforces production mode and blocks SQLite |
| `DATABASE_URL` | **Yes** | *(Your Neon PostgreSQL connection string)* | GatherIQ normalizes `postgres://` and `postgresql://` to `postgresql+psycopg://` with SSL |
| `JWT_SECRET` | **Yes** | *(32+ character random secret)* | Signs access tokens. Generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `CORS_ORIGINS` | **Yes** | `https://your-app.vercel.app` | **Exact Vercel frontend domain** (no trailing slashes, no wildcard `*`) |
| `COOKIE_SECURE` | **Yes** | `true` | Required for HTTPS cookie transmission |
| `COOKIE_SAMESITE` | **Yes** | `none` | **Critical**: Allows cross-site cookies between Vercel and Render |
| `ALLOW_DEMO_COUNTS` | No | `false` | Disables simulated counting |
| `SUPER_ADMIN_EMAIL` | No | `superadmin@gatheriq.dev` | Initial admin email |
| `SUPER_ADMIN_NAME` | No | `Platform Super Admin` | Initial admin name |
| `SUPER_ADMIN_PASSWORD` | Optional | *(Your strong password)* | Auto-provisions Super Admin on first boot |

> [!TIP]
> After your first deployment provisions the Super Admin account, you can safely remove `SUPER_ADMIN_PASSWORD` from Render Environment Variables.

---

### B. Vercel Frontend Environment Variables
In the Vercel Project Settings under **Environment Variables**:

| Variable | Required | Value |
| :--- | :---: | :--- |
| `NEXT_PUBLIC_API_BASE_URL` | **Yes** | `https://your-backend.onrender.com` (Your Render Web Service URL, without trailing slash) |
| `NEXT_PUBLIC_WS_BASE_URL` | Optional | `wss://your-backend.onrender.com` (Derived automatically if omitted) |

---

## Free Tier Limitations & Technical Assessment

### 1. Render Free Service Spin-Down (Cold Starts)
- **Behavior:** Render free web services spin down after **15 minutes of inactivity**.
- **Impact:** The first request after sleep takes **~50 seconds** to wake up. Subsequent requests respond instantly.
- **Mitigation:** The frontend UI displays connection state and retries smoothly. If desired, a free uptime monitor (e.g., UptimeRobot) can ping `/health` every 10 minutes to prevent sleep during service hours.

### 2. Neon Free Serverless Scale-to-Zero
- **Behavior:** Neon free databases pause compute after **5 minutes of inactivity** to conserve free hours.
- **Impact:** First database queries after sleep experience a brief **~500 ms** wake-up latency, completely transparent to the user.

### 3. PyTorch / YOLOv8 / Ultralytics on 512 MB RAM (Crucial Assessment)
- **Technical Reality:**
  - Standard REST APIs, JWT Auth, Database queries, WebSockets, Church Management, and Settings consume **~65–90 MB RAM**.
  - Loading PyTorch (`torch`), OpenCV (`opencv-python-headless`), and Ultralytics (`ultralytics`) into memory consumes **~300–380 MB RAM**.
  - Executing real-time YOLOv8 person tracking inference on live 640x640 camera frames on CPU can spike transient RAM allocations to **600–850 MB**.
- **Render Free Tier Boundary:**
  - Render Free imposes a strict **512 MB cgroup memory cap** with zero swap.
  - If a burst of camera frames pushes memory above 512 MB, the Linux kernel terminates the process with an Out-of-Memory (OOM) kill (`Exit code 137`).
- **How GatherIQ Protects Your Deployment:**
  - GatherIQ **strictly refuses to fabricate fake AI counts**.
  - In `backend/app/cv/pipeline.py`, if deep learning libraries cannot initialize due to memory limits, the system catches the failure, logs the exact runtime state, and reports `is_genuine_ai: false` with `count_source: "unavailable"`.
  - The REST API, attendance session creation, and manual counting continue operating reliably without crashing.
- **Recommended Free-Tier AI Strategies:**
  1. **Frame Rate Throttling:** Ensure the live camera scanner samples frames at conservative intervals (e.g., 1 frame every 1–2 seconds rather than 30 FPS).
  2. **Starter Upgrade (If AI Video Streaming is Heavily Used):** Upgrading Render from Free (512 MB) to Starter ($7/mo, 1 GB RAM) provides comfortable headroom for continuous PyTorch inference while keeping the Neon database 100% free.
