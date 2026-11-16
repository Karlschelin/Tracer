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
- `index.html` är en enda fil med inline CSS och JS, utan byggsteg (version 1, halvautomatisk).
- Banmodellen ligger i `pos()`. Höjden lättar av mot toppen och accelererar ner mot landningen. Sidled är ett andragradspolynom genom start, topp och landning. Alla punkter är normaliserade till 0..1.
- Exporten ritar video och linje på en canvas och spelar in med `MediaRecorder` (mp4 i Safari, webm i Chrome).
- `index.html` publiceras också som Claude-artifact. Den kopian får inte ha doctype, html-, head- eller body-taggar, och den sparar exporten via `claude.use('downloads')`.

## Målarkitektur (fas 1 i docs/ROADMAP.md)
Vite + TypeScript, ES-moduler:
```
src/
  app/        tillstånd (en store), stegflöde, undo/redo
  video/      laddning, bild-för-bild-stegning (requestVideoFrameCallback), bildavkodning
  trajectory/ banmodell, passning av modell till detekterade punkter
  detect/     träffdetektering (ljud + bild), bolldetektering, spårning
  render/     ritning av tracer-stilar (ren funktion: ctx, tid, bana, stil)
  export/     inspelning och kodning (MediaRecorder, senare WebCodecs)
  ui/         komponenter och design-tokens
tests/        enhetstester (Vitest) och e2e (Playwright) mot samples/
```
Regler: `render/` och `trajectory/` är rena funktioner utan DOM-beroenden, så att de kan testas. Tung bildanalys körs i en Web Worker.

## Test
- `samples/` innehåller korta klipp (3–8 s) och en `*.json` per klipp med facit: träffbild, bollens position per bild där den syns, och landningsbild/-punkt.
- Detekteringen ska rapportera fel i bildrutor för träffen och medelfel i pixlar för banan, mätt mot facit.
- E2E-test med Playwright: ladda klipp, kör flödet, exportera och kontrollera att utfilen har rätt längd och storlek.

## Design
Se `docs/DESIGN.md`. Kort: mörkt videoredigerings-UI, stor video, stegflöde längst ner och tracer-rött som enda accentfärg.
