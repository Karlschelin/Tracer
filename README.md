# Golf Tracer

En webbapp som ritar in golfbollens bana i en video. Linjen ritas fram i takt med att bollen flyger, från träffen till landningen.

All bearbetning sker i webbläsaren och videon laddas aldrig upp någonstans.

## Så används den

1. Välj en video. Bildfrekvensen läses av automatiskt (du kan välja den själv om det behövs).
2. Stega fram till träffögonblicket, tryck på **Markera träff här** och peka på bollen.
3. Spola till landningen, tryck på **Markera landning här** och peka ut var bollen landar. Du kan också skriva in tiden i luften för hand.
4. Toppen placeras automatiskt. Du kan peka ut den själv eller dra i punkterna.
5. Välj färg, tjocklek och glöd.
6. Tryck på **Exportera video**. Du får en mp4 i Safari och en webm eller mp4 i Chrome.

Stegknapparna (‹ ›) och piltangenterna flyttar exakt en bildruta. Skift + pil flyttar tio. ↶ och ↷ ångrar och gör om.

## Annotera (ta fram facit)

Knappen **Annotera** öppnar ett läge där du markerar bollens position bild för bild. Resultatet är facit som detekteringen mäts mot.

- Peka på bollen. En lupp visar videons egna pixlar. Håll kvar och dra för att finjustera, släpp för att sätta punkten. På pekskärm ligger punkten en bit ovanför fingret.
- Appen går vidare till nästa bild efter varje punkt. **Bollen syns inte här** tar bort punkten i bilden.
- **Träffen är i den här bilden** sätter träffbilden: den sista bilden där bollen ligger still.
- Vita punkter kommer från bildanalysen, röda är satta för hand.
- **Spara facit** skriver `samples/<klipp>.json` när appen körs med `npm run dev`. Annars laddas filen ner, och du lägger den i `samples/`.

Formatet beskrivs i `samples/README.md`.

## Utveckling

```sh
npm install
npm run dev        # http://localhost:5173, med testklippen från samples/ i en lista
npm test           # enhetstester (Vitest)
npm run e2e        # Playwright mot klippen i samples/
npm run build      # dist/index.html (en enda fil) och dist/artifact.html
```

`E2E_FULL=1 npm run e2e` jämför dessutom varje bildruta i båda klippen mot ffmpeg (tar ett par minuter).

`python3 tools/draft_facit.py samples/KLIPP.mov --ball x,y` tar fram ett utkast till facit med bildanalys (kräver ffmpeg och numpy). `x,y` är bollens ungefärliga pixelposition före träffen.

Koden ligger i `src/`, uppdelad enligt `CLAUDE.md`. Planen framåt finns i `docs/ROADMAP.md`.
