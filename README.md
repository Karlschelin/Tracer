# Golf Tracer

En webbapp som ritar in golfbollens bana i en video. Linjen ritas fram i takt med att bollen flyger, från träffen till landningen.

All bearbetning sker i webbläsaren och videon laddas aldrig upp någonstans.

## Så används den

1. Välj en video. Bildfrekvensen läses av automatiskt (du kan välja den själv om det behövs).
2. Tryck på **Hitta träffen automatiskt**. Appen lyssnar efter klickljudet, hittar bollen i bilden och ställer sig på träffbilden. Blir det fel: stega fram till träffögonblicket, tryck på **Markera träff här** och peka på bollen.
3. Tryck på **Hitta bollbanan automatiskt**. Appen följer bollen och fyller i topp, landning och tid i luften. Landningen syns sällan i videon och är då uppskattad. Vill du hellre göra det själv: spola till landningen, tryck på **Markera landning här** och peka ut var bollen landar. Du kan också skriva in tiden i luften för hand.
4. Toppen placeras automatiskt. Du kan peka ut den själv eller dra i punkterna.
5. Välj färg, tjocklek och glöd.
6. Tryck på **Exportera video**. Du får en mp4 i Safari och en webm eller mp4 i Chrome.

Stegknapparna (‹ ›) och piltangenterna flyttar exakt en bildruta. Skift + pil flyttar tio. ↶ och ↷ ångrar och gör om.

## Testa på mobilen

Appen körs på datorn och du öppnar den i Safari på iPhone. Videon skickas bara mellan telefonen och sidan i telefonens webbläsare, den laddas inte upp till datorn eller någon annanstans.

**En gång på datorn**
1. Installera Node.js 22 (LTS) från nodejs.org om du inte har det. Kontrollera med `node -v` (20.19 eller senare, eller 22.12 eller senare).
2. Hämta koden och rätt gren:
   ```sh
   git clone https://github.com/karlschelin/tracer.git
   cd tracer
   git checkout claude/wonderful-volta-fq4of4
   npm install
   ```
   Har du redan en kopia: `git fetch && git checkout claude/wonderful-volta-fq4of4 && git pull && npm install`.

**Varje gång**
1. Kör `npm run mobil` på datorn. Den skriver ut två adresser. Använd den som börjar med **Network**, till exempel `http://192.168.1.23:5173/`.
2. Se till att telefonen är på samma wifi som datorn. Öppna adressen i Safari på telefonen.
3. Frågar datorn (Mac) om `node` får ta emot inkommande anslutningar: välj Tillåt.
4. Låt datorn vara vaken medan du testar. `Ctrl+C` i terminalen stoppar servern.

**Det här kan du prova**
- **Automatiskt:** tryck på *Välj video*, välj ett klipp i Bilder, tryck på *Hitta träffen automatiskt* och sedan *Hitta bollbanan automatiskt*. Justera topp och landning genom att dra i punkterna, och exportera.
- **För hand:** stega till bilden där klubban träffar bollen (‹ ›), tryck på *Markera träff här* och peka på bollen. Videon scrollas upp av sig själv när appen väntar på att du ska peka. Gör sedan likadant med *Markera landning här* och *Placera topp*.
- ↶ ångrar, så du kan växla mellan automatiskt och för hand på samma klipp.

**Om något inte fungerar**
- Sidan laddar inte på telefonen: kontrollera att båda är på samma nät. Gästnät och vissa jobbnät låter inte enheter nå varandra. Prova då telefonens personliga hotspot med datorn ansluten till den.
- Analysen tar tid: i testerna på en dator utan grafikkort tar bollbanan 50–80 s för ett 4K-klipp. Hur lång tid det tar på en iPhone är inte mätt än. Kortare klipp (trimma i Bilder till ca 3–6 s) går fortare.
- Hittar appen inte träffen eller bollbanan visar den ett meddelande, och du kan markera för hand.

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
npm run mobil      # samma, men nåbar från telefonen på samma wifi (se Testa på mobilen)
npm run measure:track  # bollspårningen mot facit, medelfel per klipp
npm test           # enhetstester (Vitest)
npm run e2e        # Playwright mot klippen i samples/
npm run build      # dist/index.html (en enda fil) och dist/artifact.html
```

`npm test` mäter också träffdetekteringen mot facit med ffmpeg (hoppas över om ffmpeg saknas), och `npm run e2e` gör samma mätning i webbläsaren. `?ljud=av` i adressen stänger av ljudanalysen, för att prova sökningen i enbart bilden.

`E2E_FULL=1 npm run e2e` jämför dessutom varje bildruta i båda klippen mot ffmpeg (tar ett par minuter).

`python3 tools/draft_facit.py samples/KLIPP.mov --ball x,y` tar fram ett utkast till facit med bildanalys (kräver ffmpeg och numpy). `x,y` är bollens ungefärliga pixelposition före träffen.

Koden ligger i `src/`, uppdelad enligt `CLAUDE.md`. Planen framåt finns i `docs/ROADMAP.md`.
