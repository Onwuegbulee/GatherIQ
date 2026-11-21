# GatherIQ — Render Backend Deployment Guide

This document describes how to deploy the GatherIQ FastAPI backend to [Render](https://render.com) using either the **Render Blueprint (`render.yaml`)** or manual setup in the Render Dashboard.

---

## 1. Quick Deploy via Render Blueprint (Recommended)

The repository includes a root `render.yaml` Blueprint specification. When you connect your repository to Render:

1. In the Render Dashboard, click **New +** -> **Blueprint**.
2. Select your `GatherIQ` repository (`main` branch).
3. Render will automatically detect `render.yaml` and configure:
   - **Web Service:** `gatheriq-backend` (Python 3.12.8, Root directory: `backend`)
   - **PostgreSQL Database:** `gatheriq-db` (Automatically provisions and links `DATABASE_URL`)
   - **Auto-generated Secrets:** `JWT_SECRET` (Cryptographically generated 32+ char key)
4. Render will prompt you for:
   - `CORS_ORIGINS`: Set this to your frontend URL (e.g., `https://gatheriq.vercel.app` or `https://gatheriq-frontend.onrender.com`).
   - `SUPER_ADMIN_PASSWORD`: Enter your desired initial password for the platform Super Admin.
5. Click **Apply**. Render will build and deploy the database and backend automatically.

---

## 2. Manual Render Dashboard Setup

If you prefer setting up the services manually in the Render Dashboard:

### Step A: Create a PostgreSQL Database
1. Go to **New +** -> **PostgreSQL**.
2. Configure:
   - **Name:** `gatheriq-db`
   - **Database:** `gatheriq`
   - **User:** `gatheriq_user`
   - **Region:** Choose the region closest to your users (e.g., `Oregon (US West)` or `Frankfurt (EU)`).
   - **Plan:** `Free` or `Starter`.
3. Click **Create Database**.
4. Once provisioned, copy the **Internal Database URL** (e.g. `postgres://gatheriq_user:password@dpg-xxx-a/gatheriq`).

### Step B: Create the FastAPI Web Service
1. Go to **New +** -> **Web Service**.
2. Connect your GitHub repository `https://github.com/Onwuegbulee/GatherIQ`.
3. Configure the service settings:
   - **Name:** `gatheriq-backend`
   - **Region:** Same region as your database.
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
   - **Plan:** `Starter` (recommended for computer vision packages like PyTorch and Ultralytics).

---

## 3. Required Environment Variables

Configure these in the Render Web Service under **Environment**:

| Variable Name | Required | Recommended Value / Description |
| :--- | :---: | :--- |
| `PYTHON_VERSION` | **Yes** | `3.12.8` (Enforces Python 3.12 compatibility for OpenCV, NumPy, and Ultralytics) |
| `ENVIRONMENT` | **Yes** | `production` (Prevents silent SQLite fallback and enables production security) |
| `DATABASE_URL` | **Yes** | Link to your Render PostgreSQL database (`Internal Database URL`). GatherIQ automatically normalizes `postgres://` to `postgresql+psycopg://`. |
| `JWT_SECRET` | **Yes** | 32+ character random secret. Generate using `python -c "import secrets; print(secrets.token_hex(32))"` |
| `JWT_ACCESS_MINUTES` | No | `15` (Default: 15 minutes) |
| `REFRESH_REMEMBER_DAYS`| No | `30` (Default: 30 days) |
| `REFRESH_SESSION_HOURS`| No | `12` (Default: 12 hours) |
| `CORS_ORIGINS` | **Yes** | Comma-separated list of allowed frontend origins without trailing slashes, e.g. `https://gatheriq.vercel.app` (must match your exact Vercel frontend domain; wildcards `*` are disallowed with credentials) |
| `COOKIE_SECURE` | **Yes** | `true` (Enforces HTTPS-only cookies in production) |
| `COOKIE_SAMESITE` | **Yes** | `none` (Required for cross-site HttpOnly cookies between Vercel and Render) |
| `ALLOW_DEMO_COUNTS` | No | `false` (Set to `false` in production for genuine AI counting) |
| `SUPER_ADMIN_EMAIL` | No | `superadmin@gatheriq.dev` (or your primary admin email) |
| `SUPER_ADMIN_PASSWORD` | **Yes** (Initial) | Secure password for initial Super Admin creation. Leave unset after provisioning or rotate via CLI. |
| `SUPER_ADMIN_NAME` | No | `Platform Super Admin` |

> [!NOTE]
> Render automatically injects `PORT` and `RENDER=true`. Uvicorn binds to `0.0.0.0:$PORT`.

---

## 4. Super Admin Provisioning

GatherIQ provides two zero-leakage mechanisms to provision the platform Super Admin without exposing passwords in source control:

### Method A: Automated Initial Boot (Environment Variable)
1. Set `SUPER_ADMIN_PASSWORD` in your Render Environment Variables.
2. When the backend starts up, it checks if the Super Admin user exists:
   - If missing: It creates the account with role `super_admin`, `must_change_password=True`, and your secure password.
   - If present: It makes no changes (idempotent).
3. Once provisioned, you can delete `SUPER_ADMIN_PASSWORD` from Render Environment Variables for maximum security.

### Method B: Interactive / Shell CLI
You can provision or reset the Super Admin account at any time using the Render Shell:
1. Open the **Shell** tab in the Render Dashboard for `gatheriq-backend`.
2. Run:
   ```bash
   python -m app.setup --email superadmin@gatheriq.dev
   ```
3. When prompted, securely type and confirm your new password (input is hidden).
4. To reset an existing admin's password:
   ```bash
   python -m app.setup --email superadmin@gatheriq.dev --reset-password
   ```

---

## 5. WebSockets in Production

The attendance scanning page connects over WebSockets at:
```
wss://<your-render-backend-url>/api/ws/session/<session_id>?token=<jwt_access_token>
```
- Render automatically terminates TLS (`wss://`) and proxies WebSocket traffic to Uvicorn on `$PORT`.
- Heartbeat ping/pong messages are supported natively to keep connections alive through reverse proxies.

---

## 6. Health Checks & Verification

Render will automatically query `/health` before routing live traffic:
```bash
curl https://<your-render-backend-url>/health
```
Expected response:
```json
{
  "status": "healthy",
  "app": "GatherIQ",
  "version": "1.0.0"
}
```
