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
| IMG_3297.mov | ljud + bild | **hittas inte** | – | – | 26 s |
| IMG_3297.mov | bara bild | **hittas inte** | – | – | 21 s |
| IMG_8435.mov | ljud + bild | 35 | 0 bildrutor | 2,4 px | 2,4 s |
| IMG_8435.mov | bara bild | 35 | 0 bildrutor | 3,8–3,9 px | 19 s |

**IMG_3297 klarar inte fas 2.** Detekteringen hittar ingen boll som försvinner, varken vid ljudtoppen eller i den rena bildsökningen. Den troliga orsaken är bollens storlek: ca 10,6 px i 4K blir ca 2,6 px i analysbilden (960 px på längsta sidan), och den minsta diameter som söks är 3 px (`dMin` i `src/detect/blobs.ts`). Det är inte rättat här. Det hör till fas 2 och ska mätas för sig. Felet i bollen för IMG_8435 (2,4–3,9 px) beror till en del på att facit i träffbilden är kopierat från bilden före, medan kameran kryper ca 0,6 px per bild.

Kravet i roadmappen är ±2 bildrutor och 10 px. Tiderna är från Chromium utan grafikkort (mjukvaruavkodning av 4K) och säger inget säkert om en iPhone.

Det här är också provat, med samma resultat (fel 0 bildrutor, bollfel högst 2,5 px räknat i 4K):
- klippen omkodade till 1080p och 720p,
- en mörk och kontrastfattig variant,
- klippen trimmade 0,5 s i början och med ljudet sänkt till 15 %,
- en inlagd falsk ljudtopp som är starkare än träffen (den väljs bort eftersom ingen boll försvinner där).

Den andra ljudtoppen i IMG_0178 (2,37 s) sammanfaller med att bagen gungar till. Den ger en svag kandidat i bilden men underkänns, eftersom fläcken bleknar över flera bilder i stället för att försvinna från en bild till nästa.

Begränsningar som mätningen inte täcker: facit är utkast som bygger på samma slags bildanalys, båda klippen är från samma plats, dag, matta och kameravinkel, och varianterna ovan är gjorda av samma två klipp. Boll på peg eller i gräs, annan bollfärg, flera bollar nära varandra, skakig kamera och 60–240 bilder per sekund är inte provade på riktiga klipp.
