import enum
import re

class BetCategory(str, enum.Enum):
    MATCH_RESULT = "vysledek" # 1, 0, 2, 10, 02, 12, vítěz zápasu
    OVER_UNDER = "over_under" # počet gólů, bodů, gemů...
    HANDICAP = "handicap"     # asijské i normální handicapy
    SPEC_STATS = "statistiky" # rohy, karty, střelci
    COMBO = "kombi"           # výsledek + góly
    OTHER = "ostatni"

def normalize_market_type(market_type: str) -> BetCategory:
    if not market_type:
        return BetCategory.OTHER
    
    label = market_type.lower().strip()
    
    # Kombinované sázky (vyhodnotit nejdříve)
    if any(x in label for x in ["výsledek zápasu a", "výsledek a góly", "vítěz zápasu a"]):
        return BetCategory.COMBO
    
    # 1X2 / Vítěz / Výsledek
    if any(x in label for x in ["součet", "vítěz zápasu", "vítěz zapasu", "výsledek zápasu", "výsledek", "vítěz 1.", "vítěz setu"]):
        # Pozor na "počet gólů" nebo "handicap" které by se mohly skrýt v obecném "výsledek zápasu"
        # Ale obvykle jsou to samostatné stringy.
        if "handicap" in label:
            return BetCategory.HANDICAP
        if any(x in label for x in ["počet gólů", "počet bodů", "počet setů", "více než", "méně než"]):
            return BetCategory.OVER_UNDER
        return BetCategory.MATCH_RESULT

    # Počet / Over Under
    if any(x in label for x in ["počet gólů", "počet bodů", "počet gemů", "počet setů", "počet her", "více než", "méně než"]):
        return BetCategory.OVER_UNDER
        
    # Handicap
    if "handicap" in label:
        return BetCategory.HANDICAP
        
    # Statistiky
    if any(x in label for x in ["počet rohů", "počet žlutých karet", "střelec"]):
        return BetCategory.SPEC_STATS
        
    return BetCategory.OTHER

def get_category_label(category: BetCategory) -> str:
    labels = {
        BetCategory.MATCH_RESULT: "Výsledek / Vítěz",
        BetCategory.OVER_UNDER: "Počet (Góly/Body)",
        BetCategory.HANDICAP: "Handicap",
        BetCategory.SPEC_STATS: "Statistiky (Rohy/Karty)",
        BetCategory.COMBO: "Kombinované sázky",
        BetCategory.OTHER: "Ostatní"
    }
    return labels.get(category, "Neznámý")
