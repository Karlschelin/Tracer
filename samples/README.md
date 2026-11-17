# Testklipp

| Klipp | Längd | Format | Bilder | Träffbild | Ljudtopp | Bollen följd |
|---|---|---|---|---|---|---|
| IMG_0178.mov | 6,8 s | 4K H.264, 30 fps, stående (rotation -90) | 205 | 51 | 1,742 s | bild 52–176 (125 punkter) |
| IMG_0180.mov | 4,0 s | 4K H.264, 30 fps, stående (rotation -90) | 121 | 20 | 0,726 s | bild 21–93 (73 punkter) |
| IMG_3297.mov | 6,4 s | 4K H.264, 30 fps, stående (rotation -90), ljud AAC 44,1 kHz | 191 | 70 | 2,366 s | bild 71–132 (61 punkter) |
| IMG_8435.mov | 7,8 s | 4K H.264, 30 fps, stående (rotation -90), ljud AAC 48 kHz | 235 | 35 | 1,194 s | bild 36–130 (90 punkter) |

I IMG_0178 finns ytterligare en ljudtopp vid ca 2,38 s, nästan lika stark som träffen. Detekteringen måste alltså klara störningar.

IMG_3297 och IMG_8435 är filmade på andra banor och andra dagar än de två första, och IMG_3297 med en annan telefonmodell. Båda är slag från gräs på fairway, bakom spelaren:

- **IMG_3297**: kameran står långt från spelaren, så bollen är liten (ca 10–11 px i diameter i 4K, mot ca 18 px i IMG_8435). Vid uppställningen ligger bollen bakom klubbhuvudet till och med bild 47, och den vita fläcken där är klubbladet, inte bollen. Bollen flyger mot trädraden och sedan mot en ljus, molnig himmel där den syns som en mörk prick. Toppen nås kring bild 120, och efter bild 132 försvinner bollen mot ett mörkare moln. Den syns inte på väg ner. Ljudtoppen är svagare än i de andra klippen, och det finns några små toppar mellan 1,1 och 1,7 s.
- **IMG_8435**: en vit peg står ca 85 px till höger om bollen. Torvbitar flyger åt höger efter träffen. Bollen går rakt upp genom trädraden mot blå himmel och moln, toppen nås kring bild 78, och bollen svänger sedan åt vänster och ner. Efter bild 130 är den borta mot vita moln. Kring bild 146–150 ändras exponeringen, och himlen blir ljusare.
- **Kameran ligger inte helt still** i någon av de nya filmerna. Bilden kryper ca 20–30 px under klippet (i IMG_8435 ca 0,6 px per bild nedåt vid bollen före träffen). Det spelar roll för bildskillnad över många bilder.

## Facit

Facit ligger som `IMG_xxxx.json` bredvid klippet. Alla fyra filerna är **utkast** (`"status": "utkast"`). IMG_0178 och IMG_0180 är framtagna med `tools/draft_facit.py`, och IMG_3297 och IMG_8435 på det sätt som beskrivs nedan. Granska dem i appens annoteringsläge och sätt status till Granskad.

```json
{
 "version": 1,
 "clip": "IMG_0178.mov",
 "width": 2160, "height": 3840,
 "fps": 30, "frameCount": 205,
 "status": "utkast",
 "impactFrame": 51,
 "ball": [{ "frame": 52, "x": 0.47009, "y": 0.62654, "source": "auto" }],
 "landing": null,
 "notes": ""
}
```

- **Bildindex** är 0-baserat. Bild n visas under tiden n/fps till (n+1)/fps. Samma index gäller i appen och i ffmpeg.
- **Koordinater** är normaliserade 0..1 i den visade (roterade) bilden, x åt höger och y nedåt. `width` och `height` är bildens storlek i pixlar efter rotation.
- **impactFrame** är den sista bilden där bollen ligger still. Träffen sker mellan den bilden och nästa.
- **ball** har högst en punkt per bild, sorterat på bild, och bara för bilder där bollen syns. Punkterna fram till och med träffbilden är bollen i vila. `source` är `auto` (bildanalys) eller `manuell` (satt eller rättad för hand).
- **landing** är `{ "frame", "x", "y" }`, eller `null` när landningen inte syns i klippet.
- **status** är `utkast` eller `granskad`.

## Vad utkasten bygger på

- Träffbilden är mätt på den vita fläcken där bollen ligger: den finns kvar till och med bild 51 respektive 20 och är borta i nästa bild.
- Bollen efter träffen är följd med trebildsdifferens och kontrollerad i förstorade utsnitt. Banan är jämn: andraderivatan mellan bilder i följd har median under 1 px och som mest 10 px (i 4K).
- I IMG_0178 ligger klubbhuvudet framför bollen i bild 0–31, så där finns inga punkter. Efter bild 176 blir bollen för svag för analysen, och från bild 179 är den skymd av spelarens keps.
- I IMG_0180 slutar utkastet vid bild 93. Bollen syns svagt en bit till och kan läggas till för hand.
- Landningen syns inte säkert i något av klippen, så `landing` är `null`.

## Hur utkasten för IMG_3297 och IMG_8435 togs fram

`tools/draft_facit.py` kördes först (`--ball 724,2834` respektive `--ball 1134,2842`), men det räckte inte:
- **Träffbilden blev en för tidig.** Skriptet sa 69 och 34. I bild 70 respektive 35 ligger klubban mot bollen, och bollen är kvar på viloplatsen. I bild 71 respektive 36 är bollen i luften. Skriptet mäter ljuset mitt på bollen, och det sjunker redan när klubban täcker halva bollen. Facit säger 70 och 35. Fas 2-detekteringen säger också 35 för IMG_8435.
- **Spårningen tog klubban för bollen** direkt efter träffen och tappade sedan banan efter två punkter. Bollen rör sig mycket långsammare än skriptet antar: ca 170 px per bild i IMG_3297 och 290 px i IMG_8435 i första bilden, och stegen krymper med 15–25 % per bild.

Därför gjordes flygningen så här. Startpunkterna (de tre första bilderna efter träffen) togs fram i förstorade utsnitt. Sedan följdes bollen med trebildsdifferens och en andragradsprediktion från de senaste punkterna. Avståndet mellan jämförelsebilderna växer när bollen går långsamt nära toppen (upp till sex bilder). Varje punkt är kontrollerad i 4x förstorade utsnitt. Bilder där bollen inte syns säkert har ingen punkt.

- **Vilopunkterna** är mätta bild för bild som tyngdpunkten av den ljusa fläcken, eftersom kameran kryper. I träffbilden (70/35) och i den första bilden där bollen syns intill klubban (48/15) är punkten kopierad från grannbilden.
- **IMG_3297**: punkter i bild 48–132. Bild 125 och 133 saknas (bara en mycket svag fläck).
- **IMG_8435**: punkter i bild 15–130. Bild 0–13 saknas (bollen delvis bakom klubban) och bild 14 saknas (helt skymd). I flygningen saknas 112–113, 126–128 och 131 och senare. Bild 109, 110 och 118 är satta för hand (`source: "manuell"`): bollen syns i utsnittet men spårningen missade den. Bild 133 hittades av spårningen men är för svag för att godkännas.
- **Banorna är jämna.** Andraderivatan mellan bilder i följd har median 1,4 px (IMG_3297) och 1,0 px (IMG_8435). De största värdena (31 och 75 px) ligger i de första bilderna, där bollen bromsar in snabbt i bild.
- **Landningen** syns inte i något av klippen, så `landing` är `null`.

**Bör granskas för hand:** IMG_3297 bild 71–73 (bollen rör sig snabbt och är utsmetad) och 126–132 (svag prick nära toppen). IMG_8435 bild 36–38 (utsmetad, och bild 36 ligger nära klubban), 109, 110, 118, 119, 123 och 129–130 (svaga eller satta för hand).

## Ljudet mot bilden

Stegen mellan bollens första lägen visar var i bildintervallet träffen sker: ungefär 0,3 bildrutor efter bild 51 i IMG_0178 och 0,8 efter bild 20 i IMG_0180. Ljudtoppen kommer i båda klippen ungefär en bildruta (30–35 ms) senare än så. Det är en skattning från två klipp, men den pekar på att träffen i bilden ligger ungefär en bildruta före ljudtoppen.

De nya klippen stämmer med det. I IMG_3297 ligger ljudtoppen vid bild 70,98 och klubban mot bollen i bild 70. I IMG_8435 ligger ljudtoppen vid bild 35,82 och klubban mot bollen i bild 35.

## Automatisk träff (fas 2), mätt mot utkasten

Mätt med `npx vitest run tests/unit/samples.detect.test.ts` (ffmpeg) och `npx playwright test tests/e2e/detect.spec.ts` (Chromium). Båda ger samma träffbild. Bollfelet skiljer sig med högst 0,1 px.

| Klipp | Väg | Träffbild | Fel | Bollfel | Tid i Chromium |
|---|---|---|---|---|---|
| IMG_0178.mov | ljud + bild | 51 | 0 bildrutor | 1,2 px | 4,7 s |
| IMG_0178.mov | bara bild | 51 | 0 bildrutor | 1,2 px | 18 s |
| IMG_0180.mov | ljud + bild | 20 | 0 bildrutor | 2,0 px | 5,0 s |
| IMG_0180.mov | bara bild | 20 | 0 bildrutor | 2,0 px | 12 s |
| IMG_3297.mov | ljud + bild | 70 | 0 bildrutor | 1,8 px | – |
| IMG_3297.mov | bara bild | 70 | 0 bildrutor | 2,4 px | – |
| IMG_8435.mov | ljud + bild | 35 | 0 bildrutor | 2,4 px | 2,4 s |
| IMG_8435.mov | bara bild | 35 | 0 bildrutor | 3,8–3,9 px | 19 s |

**IMG_3297 rättat i fas 3, steg 0.** Bollen är liten (ca 2,6 px i analysbilden) men hittades redan av `findVanished`. Felet låg i bekräftelsen: i träffbilden (70) ligger klubban mot bollen och skymmer en del av den, så ljuset mitt på bollen ligger mellan "kvar" och "borta", och halveringen underkände kandidaten. Nu godtas en enda halvljus bild om bilden före är helt ljus eller bilden efter helt mörk. För att den regeln inte ska släppa igenom sådant som bara passerar förbi (i IMG_3297 en hand eller ett skaft vid bild 160) krävs också att platsen efteråt har samma ljus som omgivningen, inte blir tydligt mörkare. Bildsökningen prövar nu de åtta bästa kandidaterna i stället för fyra. Övriga klipp är oförändrade (samma träffbild och bollfel). Tiderna i Chromium för IMG_3297 är inte mätta om.

Kravet i roadmappen är ±2 bildrutor och 10 px. Tiderna är från Chromium utan grafikkort (mjukvaruavkodning av 4K) och säger inget säkert om en iPhone.

Det här är också provat, med samma resultat (fel 0 bildrutor, bollfel högst 2,5 px räknat i 4K):
- klippen omkodade till 1080p och 720p,
- en mörk och kontrastfattig variant,
- klippen trimmade 0,5 s i början och med ljudet sänkt till 15 %,
- en inlagd falsk ljudtopp som är starkare än träffen (den väljs bort eftersom ingen boll försvinner där).

Den andra ljudtoppen i IMG_0178 (2,37 s) sammanfaller med att bagen gungar till. Den ger en svag kandidat i bilden men underkänns, eftersom fläcken bleknar över flera bilder i stället för att försvinna från en bild till nästa.

Begränsningar som mätningen inte täcker: facit är utkast som bygger på samma slags bildanalys, båda klippen är från samma plats, dag, matta och kameravinkel, och varianterna ovan är gjorda av samma två klipp. Boll på peg eller i gräs, annan bollfärg, flera bollar nära varandra, skakig kamera och 60–240 bilder per sekund är inte provade på riktiga klipp.

## Automatisk bollbana (fas 3), mätt mot utkasten

Mätt med `npm run measure:track` (ffmpeg, `tests/unit/samples.track.test.ts`): först den automatiska träffen med ljud, sedan spårningen från den. Felet är avståndet mellan den passade banan och facit vid varje bild där facit har en punkt, som andel av bildhöjden (3840 px). "I spåret" är bilder där spårningen själv hittade bollen, "extrapolerat" är bilder där banan bara bygger på modellen.

| Klipp | Medelfel | Störst | I spåret | Extrapolerat | Spårpunkter | Säkerhet | Flygtid |
|---|---|---|---|---|---|---|---|
| IMG_0178.mov | **1,28 %** (49 px) | 7,1 % | 0,48 % (92 bilder) | 3,5 % (33) | 92 | 0,60 | 6,6 s |
| IMG_0180.mov | **1,01 %** (39 px) | 4,0 % | 0,53 % (53) | 2,3 % (20) | 53 | 0,56 | 4,0 s |
| IMG_3297.mov | **0,25 %** (9 px) | 0,8 % | 0,18 % (42) | 0,39 % (19) | 42 | 0,85 | 6,1 s |
| IMG_8435.mov | **0,74 %** (28 px) | 2,0 % | 0,29 % (44) | 1,2 % (46) | 44 | 0,76 | 5,3 s |

Alla fyra ligger under målet på 3 % och under roadmappens 1,5 %. Samma mätning i Chromium (`tests/e2e/track.spec.ts`) gav 0,24–1,50 % (se nedan). Avkodningen i webbläsaren skiljer sig något från ffmpeg, så spårpunkterna blir inte exakt desamma.

### Hur det fungerar

1. **Kandidater** (`src/detect/candidates.ts`): varje bild efter träffen i 960 px (längsta sidan), gråskala. Trebildsskillnad mot bilden 1 och 3 bildrutor före och efter: det som skiljer sig från båda grannarna åt samma håll. Både ljusa fläckar (bollen mot mark och träd) och mörka (bollen mot ljus himmel) tas med. Före jämförelsen flyttas grannbilderna så att de ligger rätt mot mittbilden: förskjutningen mäts med summan av absoluta skillnader inom ±2 px och förfinas till delar av en pixel. Det tar hand om att kameran kryper. Stora fläckar (spelaren, klubban) sorteras bort på ytan. Tröskeln följer bildens brusnivå.
2. **Spår** (`src/detect/track.ts`): hypoteser startas från par av kandidater 1–3 bilder efter träffen som ligger i linje med bollens viloplats och rör sig uppåt. Varje hypotes förlängs bild för bild med en förutsägelse (krympande steg direkt efter träffen, sedan andragradspolynom genom de senaste punkterna) och en lucka som växer när bollen saknas. De fyra längsta hypoteserna passas mot banmodellen, och den med flest punkter nära sin passade bana vinner (RANSAC-tanken). Det sorterar bort torvbitarna i IMG_8435 och klubban i genomsvingen i IMG_3297, som annars kan ge längre spår än bollen.
3. **Passning** (`src/trajectory/fit.ts`): banmodellen `pos()` med en ny parameter, perspektiv (`warp()` i `model.ts`): bollen flyger bort från kameran och går därför allt långsammare i bilden. Utan perspektiv (0) är modellen exakt som förut. Start ligger fast i den automatiska träffens boll. Topp, landning, flygtid, när toppen nås, perspektiv och träfftiden inom träffbilden passas med Nelder–Mead och Huber-förlust (avvikande punkter väger mindre). Det som inte syns hålls på plats av svaga antaganden: toppen efter ca 40 % av flygtiden, flygtid kring 5 s (1,2–9 s), landning strax under en horisont nära mitten av bilden och nära toppen i sidled.
4. **Extrapolering**: den passade banan plockar upp punkter som spåret missade och fortsätter efter att bollen tappats. Landningen och flygtiden är skattade, inte uppmätta, eftersom landningen inte syns i något klipp.

### Beslut och skäl

- **Analysupplösning 960 px**, samma som träffdetekteringen. Bollen i luften är 1–4 px där. Högre upplösning kostar 2–4 gånger så mycket tid per bild.
- **Bildavstånd 1 och 3.** Att lägga till 6 gav inga fler träffar på bollen, bara längre tid: nära toppen i IMG_8435 är bollen ca 1 px och −10 gråvärden, och den hamnar bland 1000–2000 brusfläckar oavsett avstånd.
- **Toppen vid 40 % av flygtiden** i antagandet, inte 50 %. Modellen passad mot hela facit ger 35–50 %, och 40 % gav minst fel både normalt och när en av de första bilderna efter träffen saknar kandidat (största fel 2,1 % i det provet, mot 3,5 % med 50 %). Värdet är alltså valt på samma fyra klipp som det mäts på.
- **Säkerheten** (0..1) väger antal punkter (20 räcker), hur länge bollen följts (0,8 s räcker) och hur nära punkterna ligger banan. Under 0,25 fylls inget i och appen ber användaren markera själv. Mellan 0,25 och 0,5 fylls banan i med en varning. Alla fyra klipp ligger på 0,55–0,85.
- Knappen fungerar också efter en **manuell träff**: då antas den markerade bilden vara den sista där bollen ligger kvar.

### Begränsningar

- **Nedstigningen syns nästan aldrig.** Spåret tappar bollen strax efter toppen i tre av fyra klipp (mot moln eller för liten), och resten av banan är modellen. Det största felet ligger där: upp till 7 % i IMG_0178 i slutet av facit. Landningen och flygtiden är skattningar, och den skattade flygtiden avgör hur länge linjen ritas.
- **Fyra klipp, samma slags slag.** Alla är filmade bakom spelaren, med fullsving och bollen som går rakt upp i bilden. Låga slag, chippar, starkt skruvade slag och kamera från sidan är inte provade. Antagandena (horisont, toppens läge) är valda för det här.
- **Facit är utkast** framtaget med liknande bildanalys, så felet är mätt mot något som kan ha samma systematiska fel.
- **Tid.** I Chromium utan grafikkort tar spårningen 50–80 s per klipp, nästan helt avkodning och sökning i 4K-videon (en sökning per bild). I ffmpeg 9–18 s. Tiden på en iPhone är inte mätt.
