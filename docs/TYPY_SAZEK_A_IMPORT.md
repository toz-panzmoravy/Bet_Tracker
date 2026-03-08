# Typy sázek a import z extension

## Jak systém pracuje s typy sázek

- **Backend** má tabulku `market_types` a **find_or_create**, který:
  1. Nejprve převede název od sázkovky na **kanonický název** (viz `backend/app/utils/market_type_mapping.py`), např. „Vítěz“ → „Vítěz zápasu“.
  2. Pak normalizuje (diakritika, mezery, fráze „v zápase“) a hledá nebo vytvoří jeden záznam.
- **Frontend** (stránka Import) při ukládání volá `findOrCreateMarketType({ name: market_label })` – backend tedy vždy používá mapování + normalizaci, takže „Vítěz“ (Betano) i „Vítěz zápasu“ (Tipsport) skončí u jednoho typu sázky.

## Mapování typů sázek (duplicity)

V **`market_type_mapping.py`** je slovník variant od sázkových kanceláří → jeden kanonický název. Při každém find_or_create se nejdřív provede tohle mapování, takže by neměly vznikat duplicity mezi sázkovkami. Pokud extension pošle novou variantu (např. anglický „Winner“), stačí ji doplnit do `RAW_TO_CANONICAL_MARKET_TYPE` s odkazem na správný kanonický název.

**Sázky na hráče:** Label často má tvar „Typ: Jméno hráče“ (např. „Vstřelí: Jan Novák“). Funkce **extract_base_market_label** bere jen část před první dvojtečkou, takže všechny „Vstřelí: XY“ se mapují na jeden kanonický typ **„Vstřelí hráč“**. Podobně „Počet gólů hráče“, „První gól (hráč)“, „Asistence hráče“, „Karty (hráč)“ – v DB tedy nevznikají stovky typů na každého hráče.

## Sjednocení už importovaných tiketů a vyčištění typů

Skript **`backend/scripts/normalize_market_types.py`** projde všechny tikety a přiřadí jim kanonický typ sázky (podle `market_label` nebo podle současného názvu typu). Typy sázek, které nemají žádný tiket, lze deaktivovat nebo smazat.

Spouštění z adresáře **backend** (s aktivním venv):

```bash
# Jen náhled – co by se změnilo
python -m scripts.normalize_market_types

# Provede přiřazení kanonických typů tiketům
python -m scripts.normalize_market_types --apply

# Navíc deaktivuje typy sázek s 0 tikety (zůstanou v DB, jen is_active=False)
python -m scripts.normalize_market_types --apply --deactivate-unused

# Navíc smaže typy sázek s 0 tikety (nevratné)
python -m scripts.normalize_market_types --apply --delete-unused
```

Doporučení: nejdřív spustit bez `--apply`, zkontrolovat výstup, pak `--apply` a případně `--deactivate-unused`. Smazání (`--delete-unused`) použít až když jste si jisti.

## Sporty při importu

Mapování sportů z extension (Tipsport, Betano, Fortuna) je sjednoceno v **`backend/app/utils/sport_mapping.py`** a vychází z **Ticket_Mapping**:

- **Fortuna**: kódy ikon `0i`, `00`, `0w`, `0m`, `07`, `0y`, `0x` → Basketbal, Fotbal, Hokej, Volejbal, Ragby, Házená, Tenis (Ragby→Rugby, Házená→Handball v DB).
- **Betano**: prefixy ikon BASK, ICEH, FOOT, HAND, TENN, ESPS.
- **Tipsport**: textový label + aliasy (házená→Handball, volejbal→Volejbal, ragby→Rugby).

Extension pro Fortuna posílá kód ikony z URL (např. `ufo-sprt-0i.png` → `0i`). Díky tomu by import neměl padat do „Ostatní“ u známých sportů z Ticket_Mapping.
