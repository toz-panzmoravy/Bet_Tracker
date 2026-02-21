"""
Seed script – naplní databázi základními daty (sporty, ligy, bookmakeři).
Spustit: python -m app.seed
"""
from app.database import SessionLocal, engine, Base
from app.models import Bookmaker, Sport, League


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # ─── Bookmakeři ─────────────────
        if db.query(Bookmaker).count() == 0:
            bookmakers = [
                Bookmaker(name="Tipsport", currency="CZK"),
                Bookmaker(name="Fortuna", currency="CZK"),
                Bookmaker(name="Betano", currency="CZK"),
            ]
            db.add_all(bookmakers)
            db.commit()
            print("✅ Bookmakeři vytvořeni")

        # ─── Sporty ─────────────────────
        if db.query(Sport).count() == 0:
            sports = [
                Sport(name="Fotbal", icon="⚽"),
                Sport(name="Hokej", icon="🏒"),
                Sport(name="Tenis", icon="🎾"),
                Sport(name="Basketbal", icon="🏀"),
                Sport(name="Esport", icon="🎮"),
                Sport(name="Ostatní", icon="🏆"),
            ]
            db.add_all(sports)
            db.commit()
            print("✅ Sporty vytvořeny")

        # ─── Ligy ───────────────────────
        if db.query(League).count() == 0:
            # Najdeme ID sportů
            fotbal = db.query(Sport).filter(Sport.name == "Fotbal").first()
            hokej = db.query(Sport).filter(Sport.name == "Hokej").first()
            tenis = db.query(Sport).filter(Sport.name == "Tenis").first()
            basketbal = db.query(Sport).filter(Sport.name == "Basketbal").first()
            esport = db.query(Sport).filter(Sport.name == "Esport").first()

            leagues = [
                # Fotbal
                League(name="Premier League", sport_id=fotbal.id, country="Anglie"),
                League(name="La Liga", sport_id=fotbal.id, country="Španělsko"),
                League(name="Serie A", sport_id=fotbal.id, country="Itálie"),
                League(name="Bundesliga", sport_id=fotbal.id, country="Německo"),
                League(name="Ligue 1", sport_id=fotbal.id, country="Francie"),
                League(name="Fortuna Liga", sport_id=fotbal.id, country="Česko"),
                League(name="Champions League", sport_id=fotbal.id, country="Evropa"),
                League(name="Europa League", sport_id=fotbal.id, country="Evropa"),
                # Hokej
                League(name="NHL", sport_id=hokej.id, country="USA/Kanada"),
                League(name="Extraliga", sport_id=hokej.id, country="Česko"),
                League(name="KHL", sport_id=hokej.id, country="Rusko"),
                # Tenis
                League(name="ATP", sport_id=tenis.id),
                League(name="WTA", sport_id=tenis.id),
                # Basketbal
                League(name="NBA", sport_id=basketbal.id, country="USA"),
                League(name="Euroleague", sport_id=basketbal.id, country="Evropa"),
                # Esport
                League(name="CS2", sport_id=esport.id),
                League(name="League of Legends", sport_id=esport.id),
            ]
            db.add_all(leagues)
            db.commit()
            print("✅ Ligy vytvořeny")

        print("\n🎉 Seed dokončen!")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
