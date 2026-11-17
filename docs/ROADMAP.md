# Roadmap

Varje fas ska vara klar och testad innan nästa börjar. "Klart när" är acceptanskriteriet.

## Fas 0 – Testdata (görs av användaren)
- 5–10 korta klipp i `samples/`, gärna olika klubbor och ljus. Trimma dem i Bilder-appen till ca 3–6 s så att de blir små.
- Facit-JSON per klipp. Fas 1 bygger ett annoteringsläge i appen som tar fram facit.

## Fas 1 – Struktur och grund (genomförd)
- Flytta till Vite + TypeScript enligt målarkitekturen i CLAUDE.md. Beteendet ska vara oförändrat.
- Frame-exakt stegning med `requestVideoFrameCallback` och automatisk fps-avläsning.
- Annoteringsläge: klicka bollens position bild för bild och exportera som facit-JSON.
- **Klart när:** alla befintliga funktioner fungerar, Playwright-testet passerar och facit finns för samples.
- **Läge:** koden, testerna och facit-utkast finns. Utkasten är framtagna med bildanalys och ska granskas i annoteringsläget (status `utkast` → `granskad`) innan de används som facit i fas 2–3.

## Fas 2 – Automatisk träff (genomförd)
- Hitta träffen via ljudtoppen (klickljudet) i ljudspåret, med bildskillnad runt bollen som reserv eller bekräftelse. I de två testklippen ligger ljudtoppen ungefär en bildruta efter träffen i bilden (se `samples/README.md`).
- Hitta bollen vid uppställning: liten, ljus, rund fläck nära mattan i bilderna före träffen.
- **Klart när:** träffen hittas inom ±2 bildrutor och bollen inom 10 px på alla samples.
- **Läge:** på båda klippen hittas träffbilden exakt (fel 0 bildrutor) och bollen inom 2 px, både med ljud och med enbart bild, i webbläsaren och i mätningen med ffmpeg. Facit är fortfarande utkast från bildanalys och underlaget är två klipp från samma plats och dag. Fler klipp (annan klubba, annat ljus, boll på peg eller gräs) behövs innan resultatet går att lita på brett. Mätvärden och begränsningar står i `samples/README.md`.

## Fas 3 – Automatisk bollspårning
- Kandidater per bild: skillnad mot föregående bild eller bakgrundsmodell, filtrera fram små ljusa fläckar och maska bort spelaren.
- Koppla ihop kandidaterna till en bana med Kalmanfilter eller RANSAC-passning mot banmodellen (fysikbegränsad: bollen kan inte vända).
- Bollen tappas ofta mot himlen. Extrapolera med den passade modellen och skatta landningen.
- **Klart när:** medelfelet mot facit är under ca 1,5 % av bildhöjden på samples och linjen ser rätt ut för ögat.

## Fas 4 – Hela flödet automatiskt
- Välj video, appen analyserar och visar resultatet, användaren godkänner eller justerar och exporterar.
- Visa hur säker detekteringen är. Vid låg säkerhet guidas användaren till manuell markering.

## Fas 5 – Polish
- Fler tracer-stilar (TV, neon, minimal) och datatext (bärlängd skattas ej, endast flygtid).
- Exportformat 9:16 och 1:1, snabbare export (WebCodecs), PWA för installation på hemskärmen.

## Senare / ev.
- ML-modell (liten YOLO via ONNX Runtime Web) om den klassiska bildanalysen inte räcker. Den tränas på facit-datan.
