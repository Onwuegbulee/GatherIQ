from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.cv import router as cv_router
from app.api.services import router as services_router
from app.api.settings import router as settings_router
from app.api.sessions import router as sessions_router
from app.api.reports import router as reports_router
from app.api.sessions import router as sessions_router
from app.api.superadmin import router as superadmin_router
from app.api.ws import router as ws_router

api_router = APIRouter(prefix="/api")

api_router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
api_router.include_router(services_router, prefix="/services", tags=["Services"])
api_router.include_router(settings_router, prefix="/settings", tags=["Settings"])
api_router.include_router(sessions_router, prefix="/sessions", tags=["Attendance Sessions"])
api_router.include_router(reports_router, prefix="/reports", tags=["Reports & Analytics"])
api_router.include_router(superadmin_router, prefix="/superadmin", tags=["Super Admin"])
api_router.include_router(cv_router, prefix="/cv", tags=["Computer Vision"])
api_router.include_router(ws_router, prefix="/ws", tags=["Real-time CV WebSocket"])
