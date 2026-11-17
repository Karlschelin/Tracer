# Golf Tracer – instruktioner för Claude

## Vad vi bygger
En webbapp som tar en golfvideo filmad med mobil och lägger in en "shot tracer", alltså en lysande linje som följer bollen. Linjen ritas fram i takt med bollens flygning, från träffen till landningen, som i TV-sändningar. Slutmålet är att appen hittar träffen och bollen **helt automatiskt**. Den halvautomatiska varianten, där man klickar ut start, topp och landning, ska finnas kvar som reserv och som ett sätt att korrigera.

Primär användare: en golfare som filmar sina slag med iPhone på stativ, bakom spelaren längs spellinjen ("down the line") och oftast i stående format. Huvudplattformen är Safari på iPhone.

## Principer
- **All bearbetning sker lokalt i webbläsaren.** Videon laddas aldrig upp till någon server.
- **Mobilen först.** Allt ska gå att göra med tummen på en iPhone. Desktop är andrahand.
- **Gränssnittet är på svenska** och skrivs ur användarens perspektiv, till exempel "Markera träff här", inte "Set impact timestamp".
- **Mät i stället för att gissa.** Ändringar i detektering och banpassning ska verifieras mot klippen i `samples/` med siffror (se Test).

## Nuvarande läge
- Fas 1 och 2 i `docs/ROADMAP.md` är genomförda. Fas 1: Vite + TypeScript, bildexakt stegning, automatisk fps, annoteringsläge, facit-utkast och e2e-tester. Fas 2: automatisk träff och boll vid uppställning (`src/detect/`), knappen "Hitta träffen automatiskt" i steg 2. Bollspårning (fas 3) finns inte än.
- Facit i `samples/` är fortfarande utkast från bildanalys (status `utkast`), inte granskade av en människa.
- Träffdetekteringen (`detectImpact` i `src/detect/impact.ts`): ljudtoppar ger kandidater, bilden bekräftar genom att hitta en ljus, rund, isolerad fläck som ligger still före och är borta efter, och en halvering ger exakt bildruta. Utan användbart ljud söks klippet igenom i bilden var 0,2 s. Trösklarna är andelar av bildens ljusomfång, inte absoluta nivåer.
- Banmodellen ligger i `pos()` i `src/trajectory/model.ts`. Höjden lättar av mot toppen och accelererar ner mot landningen. Sidled är ett andragradspolynom genom start, topp och landning. Alla punkter är normaliserade till 0..1.
- Exporten ritar video och linje på en canvas och spelar in med `MediaRecorder` (mp4 i Safari, webm eller mp4 i Chrome).
- `npm run build` ger `dist/index.html` (en enda fil) och `dist/artifact.html`. Artifact-kopian får inte ha doctype, html-, head- eller body-taggar, och den sparar filer via `claude.use('downloads')` (`src/export/save.ts`).

## Arkitektur
Vite + TypeScript, ES-moduler:
```
src/
  app/        tillstånd (en store med ångra/gör om), delat sammanhang
  video/      bildklocka: fps-avläsning och stegning på bildindex (requestVideoFrameCallback); bildrutor till analysen
  trajectory/ banmodell, senare passning av modell till detekterade punkter
  detect/     träffdetektering (ljud + bild) och boll vid uppställning; Web Worker för tung analys; (fas 3) spårning
  render/     ritning av tracer, hjälplinjer, facit-punkter och lupp (rena funktioner: ctx, tid, bana, stil)
  export/     inspelning (MediaRecorder, senare WebCodecs) och sparande av filer
  annotate/   facit-formatet (rena funktioner) samt läsning och sparande
  ui/         koppling mot DOM: scen, kontroller, annoteringspanel, stilar och design-tokens
tests/        enhetstester (Vitest) i unit/ och e2e (Playwright) mot samples/ i e2e/
tools/        draft_facit.py: utkast till facit med ffmpeg + numpy
```
Regler: `render/`, `trajectory/`, `video/fps.ts`, `annotate/facit.ts` och `detect/` (utom `decodeAudio.ts` och `workerClient.ts`) är rena funktioner utan DOM-beroenden, så att de kan testas. Detekteringen läser bilder genom gränssnittet `FrameSource`: videon i webbläsaren, ffmpeg i enhetstesterna. Tung bildanalys körs i en Web Worker (`detect/worker.ts`), med direkt körning som reserv.

Bildrutor: index är 0-baserat. Appen söker alltid till mitten av en ruta, `(n + 0,5) / fps`, och läser av visad ruta från `mediaTime`. Bildruta n i appen är samma bild som bildruta n i ffmpeg (mätt för alla rutor i båda klippen), så facit, verktyg och app delar index.

## Test
- `samples/` innehåller korta klipp (3–8 s) och en `*.json` per klipp med facit: träffbild, bollens position per bild där den syns, och landningsbild/-punkt. Formatet står i `samples/README.md`.
- Detekteringen ska rapportera fel i bildrutor för träffen och medelfel i pixlar för banan, mätt mot facit. Träffen mäts i `tests/unit/samples.detect.test.ts` (ffmpeg) och `tests/e2e/detect.spec.ts` (webbläsare); båda skriver ut felen.
- E2E-test med Playwright (`npm run e2e`): ladda klipp, kör flödet, exportera och kontrollera att utfilen har rätt längd och storlek. Testerna sparar facit i `.tmp/`, aldrig i `samples/`.
- Kör `npm test`, `npm run e2e` och `npm run build` före commit.

## Design
Se `docs/DESIGN.md`. Kort: mörkt videoredigerings-UI, stor video, stegflöde längst ner och tracer-rött som enda accentfärg.
