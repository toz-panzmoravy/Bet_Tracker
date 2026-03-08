# Kde najít začátek zápasu (event_date) u podporovaných sázkových kanceláří

Dokument popisuje, **kde v extension bereme čas začátku zápasu** u každé SK. Pokud SK změní HTML/CSS, je potřeba aktualizovat selektory zde a v `content.js`.

---

## Tipsport

| Místo | Kde najít začátek zápasu | Poznámka |
|-------|--------------------------|----------|
| **Detail tiketu** | V detailu tiketu (stránka `/tiket?idu=...`): bloky `[data-atid="ticketDetailBet"]`. Uvnitř kontejner s třídou obsahující `38d1266e` (např. `div.sc-38d1266e-1`), v něm dva prvky s třídou obsahující `whiteSpace-noWrap` – **první = datum, druhý = čas** (výkop). | Extension načítá detail přes `fetchTicketDetailKickoffTime(ticketHref)` (fetch nebo iframe), parsuje `parseKickoffFromDetailHtml(html)`. Z karty v seznamu máme jen čas sázky (`placed_at`), ne výkop – proto se u LIVE/Import volá `enrichTipsportTicketsWithKickoff()`, která pro tikety bez `event_start_at` otevře detail a doplní čas. |
| **Karta v seznamu** | Na kartě v seznamu Tipsport **není** zobrazen čas výkopu – jen datum/čas sázky. Ten se ukládá jako fallback `placed_at` / `event_start_at`, dokud není doplněn z detailu. | Pro správné „jen budoucí zápasy“ je potřeba mít vyplněný výkop z detailu. |

**Shrnutí:** Začátek zápasu u Tipsportu bereme **jen z detailu tiketu** (bloky sázek v detailu, datum + čas z `whiteSpace-noWrap`). Pokud Tipsport změní `data-atid="ticketDetailBet"` nebo třídy (např. `sc-38d1266e-1`), je nutné upravit `parseKickoffFromDetailHtml` v `content.js`.

---

## Betano

| Místo | Kde najít začátek zápasu | Poznámka |
|-------|--------------------------|----------|
| **Karta v seznamu / historie** | Na kartě: element **`.bet-event-date-time`** nebo **`[data-qa="bet-event-date-time"]`**. Text např. „Dnes 18:00“, „Zítra 14:00“ – parsuje `parseBetanoRelativeTime()`. | Čas výkopu je přímo na kartě, není nutné otevírat detail. |
| **Sidebar „Moje sázky“** | Stejný selektor `.bet-event-date-time` / `[data-qa="bet-event-date-time"]` v každé kartě. | `enrichBetanoTicketsWithSidebarEventTime()` doplní `event_start_at` ze sidebaru podle shody týmů. |
| **Homepage „Moje sázky“ (expand)** | Po rozkliknutí karty (toggle): opět **`.bet-event-date-time`** / **`[data-qa="bet-event-date-time"]`**. | `scrapeBetanoFromHomepageWithExpand()` čte tento element. |

**Fallback:** Pokud není výkop na kartě/sidebaru, použije se `placed_at` (datum/čas sázky).

**Shrnutí:** Začátek zápasu u Betana bereme z **jednoho typu elementu**: `.bet-event-date-time` nebo `[data-qa="bet-event-date-time"]`. Stačí jeden z nich; pokud Betano změní třídu nebo data-qa, je potřeba upravit v `content.js` na všech místech, kde se tento element hledá.

---

## Fortuna

| Místo | Kde najít začátek zápasu | Poznámka |
|-------|--------------------------|----------|
| **Detail tiketu (popup)** | Po rozkliknutí tiketu v přehledu: v detailu **`.betslip-leg-date span`** – každý `span` obsahuje text s datem/časem zápasu (např. relativní „Dnes 20:00“). | Extension volá `enrichFortunaTicketsWithDetailDate()`: pro každý tiket rozklikne kartu, počká na načtení, přečte `.betslip-leg-date span`, zavře. Časy parsuje `parseFortunaRelativeDate()`. |
| **Seznam (bez rozkliknutí)** | V seznamu Fortuna **nezobrazuje** čas výkopu na kartě – jen např. čas sázky. | Bez rozkliknutí nemáme výkop; proto se u LIVE/Import volá enrich, který rozklikne každý tiket. |

**Fallback:** Pokud enrich nepřečte čas, použije se `placed_at` (čas z atributu `datetime` u prvku s časem v řádku).

**Shrnutí:** Začátek zápasu u Fortuny bereme **jen z detailu tiketu** (popup po rozkliknutí) z elementu **`.betslip-leg-date span`**. Pokud Fortuna změní třídu `.betslip-leg-date` nebo strukturu, je nutné upravit `enrichFortunaTicketsWithDetailDate` v `content.js`.

---

## Doplnění do Ticket_Mapping

Doporučení: do souboru **Ticket_Mapping** (nebo do tohoto dokumentu) doplň konkrétní **aktuální HTML/selectory** od každé SK (např. zkopírovaný kus HTML s elementem pro datum/čas výkopu), aby při změně designu SK bylo jasné, co hledat a kde to v kódu měnit.

---

# Zobrazení jen budoucích zápasů (bez historických)

## Overlay

- **„Vsazené – zápas nezačal“:** zobrazují se **jen** tikety, u nichž je `event_date` **v budoucnu** a zároveň v nastaveném časovém okně (např. příštích 24 h). Podmínka: `d && d <= end && d > now`.
- **„Právě hraje (live)“:** zobrazují se tikety, které už začaly (`event_date` v minulosti), ale **nejdéle 120 minut** od začátku – po 120 min se tiket ze sekce „Právě hraje“ skryje (neukazujeme „historické“ proběhlé zápasy v live).
- **„Ostatní aktivní“:** tikety bez `event_date` nebo s `event_date >= now` (aby se neukazovaly tikety s výkopem v minulosti jako „ostatní“).

Tikety s **event_date v minulosti** a zápas už běží déle než 120 min **se v overlay vůbec nezobrazují** – jsou vyfiltrovány. Tím pádem overlay zobrazuje jen „budoucí“ (sekce Vsazené) a „právě běžící“ (live do 120 min), ne staré historické zápasy.

## Frontend stránka /live

- Zobrazuje tikety s **is_live=true** a **status=open** (otevřené live tikety). Neřeší zde explicitně „jen budoucí“ – stránka LIVE je určena pro právě běžící zápasy. Historické (uzavřené) se tam nedostanou díky filtru `status: "open"`.

## API

- Endpoint `GET /api/tickets` nemá parametr „pouze budoucí“. Filtrování probíhá na straně overlay/frontendu podle `event_date`. Pokud by bylo potřeba v API vracet jen tikety s `event_date >= now`, lze doplnit parametr např. `event_from=now` a v dotazu přidat `Ticket.event_date >= now`.

---

## Shrnutí odpovědí

1. **Víme u všech SK, kde najít začátek zápasu?**  
   - **Ano.** Tipsport = detail tiketu (bloky sázek, datum+čas). Betano = na kartě/sidebaru (`.bet-event-date-time`). Fortuna = detail po rozkliknutí (`.betslip-leg-date span`). Pokud něco u SK změníte nebo přidáte novou SK, doplň do Ticket_Mapping (nebo sem) konkrétní selektor/HTML.

2. **Dokážeme správně zobrazovat jen future zápasy a ne historické?**  
   - **Ano.** V overlay se historické zápasy (výkop v minulosti a už ne v „live“ okně 120 min) nezobrazují. Sekce „Vsazené – zápas nezačal“ obsahuje jen tikety s `event_date` v budoucnu. Pokud bys chtěl stejné chování i v API (např. pro jiné klienty), lze doplnit filtr `event_from=now`.
