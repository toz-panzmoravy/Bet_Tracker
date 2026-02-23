import sys
import os

# Přidat aktuální adresář do path pro importy z 'app'
sys.path.append(os.getcwd())

from app.database import engine, SessionLocal
from app.models import Ticket, Bookmaker, Sport, League, AiAnalysis
from sqlalchemy import text

def reset_db():
    print("🧹 Čistím databázi (PostgreSQL)...")
    db = SessionLocal()
    try:
        # TRUNCATE smaže vše a RESTART IDENTITY vyresetuje ID (v Postgresu)
        # CASCADE se postará o cizí klíče
        db.execute(text("TRUNCATE TABLE ai_analyses, tickets, leagues, sports, bookmakers, market_types RESTART IDENTITY CASCADE"))
        db.commit()
        print("✅ Hotovo. Databáze je prázdná a ID resetována.")
    except Exception as e:
        db.rollback()
        print(f"❌ Chyba: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reset_db()
