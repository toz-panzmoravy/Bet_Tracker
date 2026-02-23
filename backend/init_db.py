import sys
import os

# Přidat aktuální adresář do path
sys.path.append(os.getcwd())

from app.database import engine, Base
# Importovat modely, aby o nich Base věděl
from app.models.models import Bookmaker, Sport, League, Ticket, MarketType, AiAnalysis

def init_db():
    print("🚀 Inicializuji databázi (vytvářím tabulky)...")
    try:
        # PŘIDÁNO: Nejdřív všechno smažeme, aby se projevily změny schématu
        print("🗑️ Mažu staré tabulky...")
        Base.metadata.drop_all(bind=engine)
        
        # Vytvoření všech tabulek definovaných v modelech
        print("🏗️ Vytvářím nové tabulky...")
        Base.metadata.create_all(bind=engine)
        print("✅ Tabulky byly úspěšně vytvořeny.")
    except Exception as e:
        print(f"❌ Chyba při inicializaci: {e}")

if __name__ == "__main__":
    init_db()
