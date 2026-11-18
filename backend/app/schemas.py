import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ==========================================
# Authentication & Tenant Onboarding Schemas
# ==========================================

class SetupRequest(BaseModel):
    church_name: str = Field(..., min_length=2, max_length=200)
    church_location: str = Field(default="", max_length=200)
    full_name: str = Field(..., min_length=2, max_length=200)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(default="", max_length=320)
    password: str = Field(default="", max_length=128)
    remember: bool = False


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    church_id: uuid.UUID
    full_name: str
    email: str
    role: str
    is_active: bool
    created_at: datetime


class ChurchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    location: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


# ==========================================
# Church Settings Schemas
# ==========================================

class ChurchSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    church_id: uuid.UUID
    attendance_target: int
    notify_on_save: bool
    notify_weekly: bool
    compact_tables: bool
    church_name: str = ""
    church_location: str = ""
    updated_at: datetime


class ChurchSettingsUpdate(BaseModel):
    attendance_target: int | None = Field(default=None, ge=1)
    notify_on_save: bool | None = None
    notify_weekly: bool | None = None
    compact_tables: bool | None = None
    church_name: str | None = Field(default=None, min_length=2, max_length=200)
    church_location: str | None = Field(default=None, max_length=200)


# ==========================================
# Service Categories Schemas
# ==========================================

class ServiceCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)


class ServiceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    church_id: uuid.UUID
    name: str
    description: str
    created_at: datetime
    session_count: int = 0
    average_attendance: int = 0


# ==========================================
# Attendance Session Schemas
# ==========================================

class SessionCreate(BaseModel):
    service_id: uuid.UUID | None = None
    service_name: str = Field(..., min_length=1, max_length=200)
    service_type: str = Field(..., min_length=1, max_length=120)
    attendance_date: date
    description: str = Field(default="", max_length=2000)


class SessionCountUpdate(BaseModel):
    total_count: int = Field(..., ge=0)
    count_source: Literal["demo", "manual", "ai"] = "manual"


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    church_id: uuid.UUID
    service_id: uuid.UUID | None = None
    service_name: str
    service_type: str
    attendance_date: date
    description: str
    total_count: int
    count_source: str | None = None
    status: str
    accumulated_seconds: int
    duration_seconds: int
    effective_seconds: int = 0
    started_at: datetime | None = None
    ended_at: datetime | None = None
    created_by: uuid.UUID
    created_by_name: str = ""
    created_at: datetime


class AnalyticsOverview(BaseModel):
    total_attendance: int
    total_sessions: int
    confirmed_sessions: int
    pending_sessions: int
    latest_attendance: int
    sunday_average: int
    growth_rate: float
    target_completion_pct: float
