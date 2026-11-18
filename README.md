# GatherIQ — AI-Powered Church Attendance Counting Platform

GatherIQ is a privacy-first, AI-powered attendance counting platform designed for churches and ministries. By leveraging computer vision and real-time tracking, GatherIQ counts total congregation attendance as an usher or administrator walks the room with a mobile camera—without recording members' identities, recognizing faces, or maintaining biometric databases.

---

## Non-Negotiable Privacy & Architectural Principles

1. **Total Person Count Only**: Counts people as aggregate attendees. Does not perform facial recognition, identity profiling, or membership tracking.
2. **No Raw Video Storage**: Video frames are processed in-memory over WebSockets for tracking and discarded immediately. No raw video files are saved to disk.
3. **Multi-Tenant Church Isolation**: Every domain entity (users, services, settings, attendance sessions) is scoped to an immutable church UUID. Cross-church data leakage is strictly blocked.
4. **Transparent AI Accounting**: The system clearly distinguishes genuine computer vision detections (`count_source="ai"`) from manual entries (`"manual"`) and demonstration counts (`"demo"`).

---

## Technology Stack

### Backend
* **Language & Runtime**: Python (FastAPI + Uvicorn)
* **ORM & Database**: SQLAlchemy 2.0 (Declarative Mapped Columns) with Alembic migrations
* **Database Engine**: PostgreSQL via `psycopg 3` (with seamless local development SQLite fallback)
* **Security & Auth**: Argon2id password hashing, PyJWT (HS256 short-lived access tokens), cryptographically secure refresh token rotation via HttpOnly cookies
* **Real-time Protocol**: WebSockets (`/api/ws/session/{session_id}`)
* **Computer Vision**: YOLO (COCO class 0: person) with ByteTrack multi-object tracking

### Frontend
* **Framework**: Next.js 14 (App Router, React 18, TypeScript 5)
* **Styling & UI**: Tailwind CSS 3.4, Lucide React, Geist Sans
* **Data Visualization**: Recharts 2.12 (Trend areas, bar charts, gauges, heatmaps)
* **Device APIs**: WebRTC (`navigator.mediaDevices.getUserMedia`), Screen Wake Lock API

---

## Directory Structure

```
GatherIQ/
├── app/                        # Next.js App Router (Pages & Layouts)
│   ├── (admin)/                # Authenticated dashboard, history, reports, services, settings
│   ├── attendance/             # Attendance session launch & live scanning HUD
│   ├── login/                  # Authentication & church onboarding
│   └── layout.tsx              # Root HTML & AppProvider context wrapper
├── components/                 # Reusable UI primitives, charts, scanner HUD
├── context/                    # Central AppContext state machine & API sync
├── hooks/                      # useAttendanceSession, useCamera, useWakeLock
├── lib/                        # API client, types, stats helpers, CSV exporter
├── backend/                    # FastAPI Backend Application
│   ├── alembic/                # Database migrations
│   ├── app/
│   │   ├── api/                # API Routers (auth, services, settings, sessions, reports, ws)
│   │   ├── cv/                 # Computer Vision pipeline (YOLO + ByteTrack)
│   │   ├── config.py           # Pydantic Settings
│   │   ├── database.py         # SQLAlchemy engine & session factory
│   │   ├── models.py           # Database entities (Church, User, Session, Service, etc.)
│   │   ├── rate_limit.py       # Sliding-window rate limiting
│   │   ├── schemas.py          # Pydantic request/response DTOs
│   │   ├── security.py         # Argon2, JWT, token rotation, current_user dependency
│   │   ├── sessions_service.py # Attendance session state machine & timing accrual
│   │   └── setup.py            # First-time church & admin provisioning
│   ├── tests/                  # Pytest test suite (auth, sessions, multi-tenancy, isolation)
│   └── requirements.txt        # Backend dependencies
├── .env.example                # Frontend environment template
└── package.json                # Frontend dependencies & scripts
```

---

## Getting Started

### 1. Backend Setup

#### Prerequisites
* Python 3.12+ (or compatible Python runtime)
* PostgreSQL (optional for production; SQLite is supported by default for local development)

#### Setup & Virtual Environment
```bash
cd backend

# Create virtual environment
python -m virtualenv .venv
# or: python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

#### Database Migrations
```bash
# Run migrations up to head
alembic upgrade head
```

#### Run Backend Tests
```bash
pytest -v
```

#### Start FastAPI Server
```bash
uvicorn app.main:app --reload --port 8000
```
API Documentation will be available at: `http://localhost:8000/docs`

---

### 2. Frontend Setup

#### Prerequisites
* Node.js 18.17+ or 20+
* npm or pnpm

#### Install & Run
```bash
# From the repository root
npm install

# Run TypeScript checks
npm run lint

# Start development server
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## Attendance Session State Machine

```
[ ready ] ───(start)───> [ recording ] ───(pause)───> [ paused ]
                             │                            │
                             │                         (resume)
                             │                            │
                             └────────────<───────────────┘
                             │
                          (end)
                             │
                             v
                        [ completed ]
                             │
                         (confirm)
                             │
                             v
                        [ confirmed ]
```

* **ready**: Session draft created with chosen service category and date.
* **recording**: Camera active, wake lock held, real-time object detection tracking attendees and accruing active duration.
* **paused**: Scanning temporarily paused. Timer stops accrual; camera state preserved.
* **completed**: Scanning concluded; final total people count and duration computed.
* **confirmed**: Verified and signed off by church administrator.
