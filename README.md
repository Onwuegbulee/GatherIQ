# ChurchCount AI: frontend

Point your camera at the congregation. Let AI detect and count the people. Get your attendance report.

Frontend only: Next.js 14 (App Router), React, TypeScript, Tailwind CSS, Lucide, Recharts.
UI primitives in `components/ui` follow shadcn/ui conventions (cva + tailwind-merge) and are self-contained;
run `npx shadcn@latest init` later if you want to swap in the official generated components.

## Run
    npm install
    npm run dev      # http://localhost:3000  (camera needs HTTPS or localhost)

Login is mocked: any valid email + a password of 6+ characters.
To test the scanner on a phone, expose the dev server over HTTPS (e.g. a tunnel) because mobile browsers block camera access on plain HTTP.

## UI v2 highlights
- Popups instead of page loads: New Attendance (modal), record details (side drawer), service add/edit (modal), notifications, row menus, date-range picker, global search (Ctrl/Cmd+K).
- Dashboard: animated stat cards with sparklines, men/women donut and stacked bars, goal gauges with needle, weekday radar, peak services, rotating insights computed from your records.
- History: KPI strip, 26-week calendar heatmap, status tabs, service chips, sortable columns, row selection and export, numbered pagination, mobile card layout.
- Men/women counts are demo test counters in the scanner and flow into the summary, history and reports.

## Structure
- `app/(admin)/…` dashboard, attendance/new|history|[id]|summary, services, reports, settings (shared sidebar layout)
- `app/attendance/live` mobile-first scanner with its own layout (no sidebar)
- `hooks/use-camera.ts` stream lifecycle, switching, errors, cleanup
- `hooks/use-attendance-session.ts` ready → recording ⇄ paused → processing → completed, timer, demo count
- `hooks/use-wake-lock.ts` keeps the screen awake while recording
- `context/app-context.tsx` auth, services, settings, saved records (localStorage), session draft/result (sessionStorage)
- `lib/mock-data.ts` sample records (labelled "Sample data" in the UI)

## Backend / AI hand-off
- Counter is a labelled DEMO counter with a manual test control. Feed real results through
  `receiveDetection(total)` in `use-attendance-session.ts` (e.g. from a WebSocket `onmessage`).
- Replace `login()`, `saveRecord()` and `MOCK_RECORDS` with API calls.
- Frames are never stored by the frontend.
