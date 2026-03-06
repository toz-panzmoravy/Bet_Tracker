# Problém: najít tiket, přečíst obsah, zobrazit v extension

## Tři kroky

1. **Najít tiket** – na stránce Moje tikety vybrat kartičky tiketů.
2. **Přečíst obsah** – z karty (seznam) a případně z detailu tiketu (čas výkopu).
3. **Zobrazit v extension** – vykreslit data do panelu Upcoming / AKU strip.

---

## Kde to může selhat

### 1. Najít tiket (seznam)

- **URL:** Extension musí běžet na stránce, která obsahuje seznam (typicky `…/moje-tikety`). Detekce: `location.pathname` obsahuje `moje-tikety`.
- **DOM:** Tikety jsou `<a data-atid="ticketListItem...">` nebo `<a href*="/tiket?">`. Pokud Tipsport změní strukturu, selektory v `scrapeTipsportTicketsFromPage()` nic nenajdou.
- **Čas běhu:** Content script běží při `document_idle`. Pokud se seznam načítá až později (lazy load), karty můžou chybět. Řešení: po kliknutí na Refresh znovu volat scraper (už děláme).

### 2. Přečíst obsah

**Z karty (seznam):**  
Čteme přímo z DOM: zápas (Domácí – Hosté), datum/čas z hlavičky, vklad, kurz, stav (ikona). Pokud Tipsport změní třídy (např. `sc-8da44c8-1`, `jRyrAE`), prvky se nenajdou a pole zůstanou prázdná. Řešení: více záložních selektorů, popř. strukturní vyhledávání (např. podle `data-atid`).

**Z detailu tiketu (čas výkopu):**  
Tady je hlavní technický problém:

- Extension volá **`fetch(url_detailu_tiketu)`** a z odpovědi parsuje HTML.
- Pokud Tipsport **serverově vykresluje** celou stránku (SSR), v odpovědi je kompletní HTML včetně bloků s „Zítra“, „4:07“ atd. → náš parser to přečte.
- Pokud je detail tiketu **SPA** (React/Vue atd.), server pošle jen „skořápku“ (prázdný root + skripty). Skutečný obsah (včetně časů zápasů) se doplní až v prohlížeči po spuštění JS. V tom případě **v odpovědi `fetch()` ten obsah nikdy není** a parser vrátí `null`.
- Rozšíření nemůže „počkat na dokončení SPA“ v rámci jednoho `fetch()` – dostane jen první HTTP odpověď.

**Řešení pro SPA detail:**  
Nestačí jen `fetch()`. Je potřeba stránku detailu **skutečně načíst v prohlížeči**, nechat ji vykreslit a až pak přečíst DOM. Možnosti:

- **Skrytý iframe:** Na stránce Moje tikety vytvořit iframe s `src = URL detailu`. Po události load (+ krátké prodlevě kvůli SPA) přečíst `iframe.contentDocument.documentElement.innerHTML` a z toho parsovat časy. Stejná doména → přístup k obsahu iframe je možný.
- **Nová záložka:** Otevřít detail v pozadí, po načtení v té záložce spustit skript (content script tam už běží), přečíst DOM a výsledek poslat zpět. Je to složitější (komunikace mezi záložkami, řazení požadavků).

V této úpravě je doplněn **fallback přes iframe**: když `fetch()` vrátí HTML, ze kterého parser žádný čas výkopu nedostane, extension zkusí načíst stejnou URL do iframe, chvíli počká a z vykresleného DOMu čas přečte.

### 3. Zobrazit v extension

Jakmile máme data (seznam tiketů, event_start_at z karty nebo z detailu), vykreslení do panelu Upcoming / AKU strip je jen správné předání do stávajícího UI. Tady problém nebývá – chyba je téměř vždy v krocích 1 nebo 2 (nenalezené karty nebo nečitelný detail).

---

## Shrnutí

| Krok            | Možná příčina selhání              | Směr řešení                          |
|-----------------|------------------------------------|--------------------------------------|
| Najít tiket     | Špatná URL, změna DOM/selektorů   | Širší detekce URL, záložní selektory |
| Přečíst kartu   | Změna tříd na Tipsportu           | Více selektorů, data-atid            |
| Přečíst detail  | Detail je SPA, fetch má jen shell  | **Načíst stránku v iframe a číst DOM** |
| Zobrazit        | –                                  | Data už máme, jen je předat do UI   |

Hlavní problém u „přečíst jeho obsah“ je tedy typicky **detail tiketu vykreslený až v prohlížeči (SPA)**. Proto je potřeba místo pouhého `fetch()` použít načtení stránky (zde iframe) a čtení až z vykresleného dokumentu.
