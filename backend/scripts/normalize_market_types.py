"""
Skript: Sjednocení typů sázek u již importovaných tiketů a vyčištění nevyužívaných.

Projde všechny tikety, přiřadí jim kanonický typ sázky (dle market_type_mapping),
případně vytvoří nový. Typy sázek bez tiketů lze deaktivovat nebo smazat.

Použití (z adresáře backend):
  python -m scripts.normalize_market_types              # jen náhled (dry-run)
  python -m scripts.normalize_market_types --apply      # provede úpravy tiketů
  python -m scripts.normalize_market_types --apply --deactivate-unused   # + deaktivuje typy s 0 tikety
  python -m scripts.normalize_market_types --apply --delete-unused      # + smaže typy s 0 tikety (POZOR)
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

# Cesta k backendu (parent of scripts/) kvůli importu app
_backend = Path(__file__).resolve().parent.parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

from app.database import SessionLocal
from app.models import Ticket, MarketType
from app.routers.market_types import get_or_create_canonical_market_type


def run(dry_run: bool = True, deactivate_unused: bool = False, delete_unused: bool = False):
    db = SessionLocal()
    try:
        tickets = db.query(Ticket).all()
        # Raw název: přednostně market_label, jinak název aktuálně přiřazeného typu
        updates = []
        created_types = []

        for t in tickets:
            raw = (t.market_label or "").strip()
            if not raw and t.market_type_id:
                mt = db.query(MarketType).filter(MarketType.id == t.market_type_id).first()
                if mt:
                    raw = (mt.name or "").strip()
            if not raw:
                continue
            mt, created = get_or_create_canonical_market_type(db, raw)
            if created:
                created_types.append(mt.name)
            if mt and mt.id != t.market_type_id:
                updates.append((t.id, t.market_label or "(z typu)", mt.name, mt.id))
                if not dry_run:
                    t.market_type_id = mt.id

        if not dry_run and updates:
            db.commit()

        # Počet tiketů podle market_type_id
        count_by_type = defaultdict(int)
        for t in db.query(Ticket).filter(Ticket.market_type_id != None).all():
            count_by_type[t.market_type_id] += 1

        unused = []
        for mt in db.query(MarketType).filter(MarketType.is_active == True).all():
            n = count_by_type.get(mt.id, 0)
            if n == 0:
                unused.append((mt.id, mt.name))

        # Výstup
        print("=== Náhled změn (tikety → kanonický typ sázky) ===")
        if not updates:
            print("Žádné tikety k úpravě (všechny již mají správný typ nebo nemají market_label).")
        else:
            for tid, raw, canonical, mid in updates[:30]:
                print(f"  tiket {tid}: {raw!r} → {canonical!r} (id={mid})")
            if len(updates) > 30:
                print(f"  ... a dalších {len(updates) - 30} tiketů.")
            if not dry_run:
                print(f"\nProvedeno: {len(updates)} tiketů aktualizováno.")
            else:
                print(f"\n[DRY-RUN] K provedení by se upravilo {len(updates)} tiketů. Spusťte s --apply.")

        if created_types:
            print(f"\nNově vytvořené typy sázek: {created_types}")

        print("\n=== Typy sázek bez tiketů (kandidáti na deaktivaci/smazání) ===")
        if not unused:
            print("Žádné.")
        else:
            for mid, name in unused:
                print(f"  id={mid}: {name!r}")
            if not dry_run and (deactivate_unused or delete_unused):
                for mid, name in unused:
                    mt = db.query(MarketType).filter(MarketType.id == mid).first()
                    if mt:
                        if delete_unused:
                            db.delete(mt)
                            print(f"  Smazán: {name!r}")
                        else:
                            mt.is_active = False
                            print(f"  Deaktivován: {name!r}")
                db.commit()
            elif dry_run and unused:
                print(f"\n[DRY-RUN] K deaktivaci: {len(unused)} typů. Použijte --deactivate-unused nebo --delete-unused s --apply.")

    finally:
        db.close()


def main():
    p = argparse.ArgumentParser(description="Sjednocení typů sázek u tiketů a vyčištění nevyužívaných.")
    p.add_argument("--apply", action="store_true", help="Skutečně provést změny (jinak jen náhled)")
    p.add_argument("--deactivate-unused", action="store_true", help="Deaktivovat typy sázek s 0 tikety (vyžaduje --apply)")
    p.add_argument("--delete-unused", action="store_true", help="Smazat typy sázek s 0 tikety (vyžaduje --apply)")
    args = p.parse_args()
    dry_run = not args.apply
    if (args.deactivate_unused or args.delete_unused) and not args.apply:
        print("Pro deaktivaci/smazání nevyužívaných typů je potřeba --apply.")
        sys.exit(1)
    if args.deactivate_unused and args.delete_unused:
        print("Zvolte jen jednu z voleb: --deactivate-unused nebo --delete-unused.")
        sys.exit(1)
    run(dry_run=dry_run, deactivate_unused=args.deactivate_unused, delete_unused=args.delete_unused)


if __name__ == "__main__":
    main()
