# Detekce LIVE tiketů na Tipsportu (extension)

## Primární detekce

- **Selektor:** `card.querySelector(".inDuKt")`
- **Podmínka:** element existuje a `textContent.trim() === "Live"`
- Tipsport typicky renderuje: `<div class="sc-837f7f43-0 inDuKt">Live</div>`

Pokud Tipsport změní layout a třída `.inDuKt` zmizí, detekce přestane fungovat bez záložní logiky.

## Záložní detekce (content.js)

1. **Podle data-atid:** `card.querySelector('[data-atid*="live" i]')` – pokud má Tipsport u LIVE badge atribut `data-atid` obsahující "live", použije se.
2. **Podle textu:** projít všechny `div` a `span` v kartě a najít prvek bez dětí, jehož `textContent.trim() === "Live"` (aby se nechytil např. "Live stream" z jiného kontextu).

## Kritické selektory pro celý scraper

| Účel        | Selektor / místo                    | Poznámka                          |
|-------------|-------------------------------------|-----------------------------------|
| LIVE badge  | `.inDuKt` nebo záložní (viz výše)   | Bez záložně při změně layoutu padá |
| Stav tiketu | `href="#i170"` (výhra), `#i173` (prohra), `#i172` (nevyhodnoceno), `#i243` (void) | V innerHTML karty |
| Vklad/kurz  | `div.sc-8da44c8-4.goKmrV` + label span | Změna tříd rozbije parsování     |
| Týmy        | `span.sc-8da44c8-1.bYmSBn` v řádcích s " - " | AKU má jinou strukturu           |

Při změně stránky Tipsportu je třeba tyto selektory zkontrolovat a případně aktualizovat.
