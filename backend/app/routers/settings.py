from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppSettings
from app.schemas import AppSettingsOut, AppSettingsUpdate


router = APIRouter(prefix="/api/settings", tags=["Nastavení"])


def _get_singleton_settings(db: Session) -> AppSettings:
    """Vrátí (nebo vytvoří) jediný řádek s nastavením aplikace."""
    settings = db.query(AppSettings).first()
    if not settings:
        settings = AppSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/app", response_model=AppSettingsOut)
def get_app_settings(db: Session = Depends(get_db)):
    settings = _get_singleton_settings(db)
    return AppSettingsOut(bankroll=settings.bankroll)


@router.put("/app", response_model=AppSettingsOut)
def update_app_settings(data: AppSettingsUpdate, db: Session = Depends(get_db)):
    settings = _get_singleton_settings(db)
    update = data.model_dump(exclude_unset=True)

    if "bankroll" in update:
        settings.bankroll = update["bankroll"]

    db.add(settings)
    db.commit()
    db.refresh(settings)
    return AppSettingsOut(bankroll=settings.bankroll)

