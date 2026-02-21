from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers.tickets import router as tickets_router
from app.routers.stats import router as stats_router
from app.routers.ocr import router as ocr_router
from app.routers.ai import router as ai_router
from app.routers.meta import router as meta_router

settings = get_settings()

app = FastAPI(
    title="BetTracker API",
    description="Osobní Bet Tracking & Analytics systém",
    version="1.0.0",
)

# CORS – povolí Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routery
app.include_router(tickets_router)
app.include_router(stats_router)
app.include_router(ocr_router)
app.include_router(ai_router)
app.include_router(meta_router)


@app.get("/")
def root():
    return {"app": settings.app_name, "status": "running"}
