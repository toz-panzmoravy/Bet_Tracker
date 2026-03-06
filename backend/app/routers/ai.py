from typing import Optional, List
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import AiAnalysis
from app.services.stats_service import get_overview
from app.llm.client import analyze_stats
from app.schemas import AiAnalyzeRequest, AiAnalyzeResponse, AiAnalysisOut
from app.config import get_settings

router = APIRouter(prefix="/api/ai", tags=["AI Analýza"])
settings = get_settings()


@router.post("/analyze", response_model=AiAnalyzeResponse)
async def ai_analyze(req: AiAnalyzeRequest, db: Session = Depends(get_db)):
    """Původní synchronní AI analýza statistik – zachována pro Dashboard."""
    filters = req.filters or {}

    overview = get_overview(db, filters)
    aggregates = overview.model_dump(mode="json")

    analysis_text = await analyze_stats(aggregates, req.question)

    record = AiAnalysis(
        context=filters,
        aggregates=aggregates,
        model_name=settings.ollama_text_model,
        response_text=analysis_text,
        status="done",
    )
    db.add(record)
    db.commit()

    # Udržovat pouze posledních 5 analýz (starší se mažou)
    old_records = (
        db.query(AiAnalysis)
        .order_by(AiAnalysis.created_at.desc())
        .offset(5)
        .all()
    )
    if old_records:
        for r in old_records:
            db.delete(r)
        db.commit()

    return AiAnalyzeResponse(
        analysis_text=analysis_text,
        used_filters=filters,
        aggregates_summary=aggregates,
    )


@router.get("/analyses", response_model=List[AiAnalysisOut])
def list_analyses(
    limit: int = 5,
    db: Session = Depends(get_db),
):
    """Historie AI analýz (posledních N záznamů)."""
    return (
        db.query(AiAnalysis)
        .order_by(AiAnalysis.created_at.desc())
        .limit(limit)
        .all()
    )


async def _run_strategy_analysis_job(analysis_id: int, aggregates: dict) -> None:
    """Background job: zavolá LLM a uloží výsledek do AiAnalysis."""
    db = SessionLocal()
    try:
        analysis: Optional[AiAnalysis] = (
            db.query(AiAnalysis).filter(AiAnalysis.id == analysis_id).first()
        )
        if analysis is None:
            return

        analysis.status = "running"
        db.commit()

        try:
            analysis_text = await analyze_stats(aggregates, question=None)
            analysis.response_text = analysis_text
            analysis.status = "done"
            analysis.error_message = None
            db.commit()
        except Exception as exc:  # pylint: disable=broad-except
            analysis.status = "error"
            analysis.error_message = str(exc)
            db.commit()
            return

        # Udržovat pouze posledních 5 analýz (starší se mažou)
        old_records = (
            db.query(AiAnalysis)
            .order_by(AiAnalysis.created_at.desc())
            .offset(5)
            .all()
        )
        if old_records:
            for r in old_records:
                db.delete(r)
            db.commit()
    finally:
        db.close()


@router.post("/strategy-analysis/start", response_model=AiAnalysisOut)
async def start_strategy_analysis(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Spustí asynchronní AI meta‑analýzu nad všemi tikety.

    Vrátí záznam AiAnalysis se stavem \"pending\" a ID pro polling.
    """
    # Analýza vždy nad všemi tikety – bez filtrů
    overview = get_overview(db, filters=None)
    aggregates = overview.model_dump(mode="json")

    record = AiAnalysis(
        context=None,
        aggregates=aggregates,
        model_name=settings.ollama_text_model,
        response_text=None,
        status="pending",
        error_message=None,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    background_tasks.add_task(_run_strategy_analysis_job, record.id, aggregates)

    return record


@router.get("/strategy-analysis/{analysis_id}", response_model=AiAnalysisOut)
def get_strategy_analysis(
    analysis_id: int,
    db: Session = Depends(get_db),
):
    """Vrátí detail jedné AI analýzy (stav + případný výsledek)."""
    analysis = (
        db.query(AiAnalysis)
        .filter(AiAnalysis.id == analysis_id)
        .first()
    )
    return analysis
