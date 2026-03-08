import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers.tickets import router as tickets_router

logger = logging.getLogger(__name__)

from app.routers.stats import router as stats_router
from app.routers.ocr import router as ocr_router
from app.routers.ai import router as ai_router
from app.routers.meta import router as meta_router
from app.routers.market_types import router as market_types_router
from app.routers.settings import router as settings_router
from app.routers.tipsport_import import router as tipsport_import_router
from app.routers.betano_import import router as betano_import_router
from app.routers.fortuna_import import router as fortuna_import_router
from app.routers.import_preview import router as import_preview_router
from app.routers.analytics import router as analytics_router
from app.routers.live import router as live_router
from app.routers.sofascore_sync import router as sofascore_sync_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="BetTracker API",
    description="Osobní Bet Tracking & Analytics systém",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS – pro lokální vývoj povolíme všechny originy,
# aby nedocházelo k blokaci mezi localhost:3000 a localhost:15555
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tickets_router)
app.include_router(stats_router)
app.include_router(ocr_router)
app.include_router(ai_router)
app.include_router(meta_router)
app.include_router(market_types_router)
app.include_router(settings_router)
app.include_router(tipsport_import_router)
app.include_router(betano_import_router)
app.include_router(fortuna_import_router)
app.include_router(import_preview_router)
app.include_router(analytics_router)
app.include_router(live_router)
app.include_router(sofascore_sync_router)


@app.get("/")
def root():
    return {"app": settings.app_name, "status": "running"}
