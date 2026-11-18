import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import api_router
from app.config import get_settings
from app.database import Base, engine
from app.sessions_service import TransitionError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("gatheriq")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing GatherIQ database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("GatherIQ backend started successfully.")
    yield
    logger.info("GatherIQ backend shutting down.")


settings = get_settings()

app = FastAPI(
    title="GatherIQ API",
    description="AI-powered church attendance counting platform backend.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global Exception Handlers
@app.exception_handler(TransitionError)
async def transition_error_handler(request: Request, exc: TransitionError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": exc.message},
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": str(exc)},
    )


# Include API routers
app.include_router(api_router)


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "app": "GatherIQ",
        "version": "1.0.0",
    }
