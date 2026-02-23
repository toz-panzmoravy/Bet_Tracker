import sys
import os
from sqlalchemy import text

# Přidat aktuální adresář do path
sys.path.append(os.getcwd())

from app.database import engine, Base
from app.models.models import market_type_sports

def update_db():
    print("🚀 Vytvářím chybějící tabulku market_type_sports...")
    try:
        # Vytvoření pouze chybějících tabulek
        Base.metadata.create_all(bind=engine, tables=[market_type_sports])
        
        # Defaultně přiřadit všechny existující market_types ke všem sportům
        with engine.connect() as conn:
            # Zjistíme jestli už tam něco je
            res = conn.execute(text("SELECT count(*) FROM market_type_sports")).scalar()
            if res == 0:
                print("📝 Přidávám výchozí vazby (všechny sporty pro všechny typy)...")
                conn.execute(text("""
                    INSERT INTO market_type_sports (market_type_id, sport_id)
                    SELECT mt.id, s.id 
                    FROM market_types mt, sports s
                """))
                conn.commit()
                print("✅ Výchozí vazby vytvořeny.")
            else:
                print("ℹ️ Tabulka už obsahuje data, přeskakuji výchozí plnění.")
                
        print("✅ Hotovo.")
    except Exception as e:
        print(f"❌ Chyba: {e}")

if __name__ == "__main__":
    update_db()
