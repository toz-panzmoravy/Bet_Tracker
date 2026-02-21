from typing import Optional, List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AiAnalysis
from app.services.stats_service import get_overview
from app.llm.client import analyze_stats
from app.schemas import AiAnalyzeRequest, AiAnalyzeResponse, AiAnalysisOut
from app.config import get_settings

router = APIRouter(prefix="/api/ai", tags=["AI Analýza"])
settings = get_settings()


@router.post("/analyze", response_model=AiAnalyzeResponse)
async def ai_analyze(req: AiAnalyzeRequest, db: Session = Depends(get_db)):
    """AI analýza statistik – pošle agregáty do Ollama."""
    filters = req.filters or {}

    # Získat agregáty
    overview = get_overview(db, filters)
    aggregates = overview.model_dump(mode="json")

    # Zavolat LLM
    analysis_text = await analyze_stats(aggregates, req.question)

    # Uložit do DB
    record = AiAnalysis(
        context=filters,
        aggregates=aggregates,
        model_name=settings.ollama_text_model,
        response_text=analysis_text,
    )
    db.add(record)
    db.commit()

    return AiAnalyzeResponse(
        analysis_text=analysis_text,
        used_filters=filters,
        aggregates_summary=aggregates,
    )


@router.get("/analyses", response_model=List[AiAnalysisOut])
def list_analyses(
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """Historie AI analýz."""
    return (
        db.query(AiAnalysis)
        .order_by(AiAnalysis.created_at.desc())
        .limit(limit)
        .all()
    )
