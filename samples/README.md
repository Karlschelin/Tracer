# Testklipp

| Klipp | Längd | Format | Bilder | Träffbild | Ljudtopp | Bollen följd |
|---|---|---|---|---|---|---|
| IMG_0178.mov | 6,8 s | 4K H.264, 30 fps, stående (rotation -90) | 205 | 51 | 1,742 s | bild 52–176 (125 punkter) |
| IMG_0180.mov | 4,0 s | 4K H.264, 30 fps, stående (rotation -90) | 121 | 20 | 0,726 s | bild 21–93 (73 punkter) |

I IMG_0178 finns ytterligare en ljudtopp vid ca 2,38 s, nästan lika stark som träffen. Detekteringen måste alltså klara störningar.

## Facit

Facit ligger som `IMG_xxxx.json` bredvid klippet. De två filerna här är **utkast** (`"status": "utkast"`), framtagna med `tools/draft_facit.py`. Granska dem i appens annoteringsläge och sätt status till Granskad.

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

## Ljudet mot bilden

Stegen mellan bollens första lägen visar var i bildintervallet träffen sker: ungefär 0,3 bildrutor efter bild 51 i IMG_0178 och 0,8 efter bild 20 i IMG_0180. Ljudtoppen kommer i båda klippen ungefär en bildruta (30–35 ms) senare än så. Det är en skattning från två klipp, men den pekar på att träffen i bilden ligger ungefär en bildruta före ljudtoppen.

## Automatisk träff (fas 2), mätt mot utkasten

| Klipp | Väg | Träffbild | Fel | Bollfel | Tid i Chromium |
|---|---|---|---|---|---|
| IMG_0178.mov | ljud + bild | 51 | 0 bildrutor | 1,2 px | 3,4 s |
| IMG_0178.mov | bara bild | 51 | 0 bildrutor | 1,2 px | 14 s |
| IMG_0180.mov | ljud + bild | 20 | 0 bildrutor | 2,0 px | 3,9 s |
| IMG_0180.mov | bara bild | 20 | 0 bildrutor | 2,0 px | 9 s |

Kravet i roadmappen är ±2 bildrutor och 10 px. Tiderna är från Chromium utan grafikkort (mjukvaruavkodning av 4K) och säger inget säkert om en iPhone.

Det här är också provat, med samma resultat (fel 0 bildrutor, bollfel högst 2,5 px räknat i 4K):
- klippen omkodade till 1080p och 720p,
- en mörk och kontrastfattig variant,
- klippen trimmade 0,5 s i början och med ljudet sänkt till 15 %,
- en inlagd falsk ljudtopp som är starkare än träffen (den väljs bort eftersom ingen boll försvinner där).

Den andra ljudtoppen i IMG_0178 (2,37 s) sammanfaller med att bagen gungar till. Den ger en svag kandidat i bilden men underkänns, eftersom fläcken bleknar över flera bilder i stället för att försvinna från en bild till nästa.

Begränsningar som mätningen inte täcker: facit är utkast som bygger på samma slags bildanalys, båda klippen är från samma plats, dag, matta och kameravinkel, och varianterna ovan är gjorda av samma två klipp. Boll på peg eller i gräs, annan bollfärg, flera bollar nära varandra, skakig kamera och 60–240 bilder per sekund är inte provade på riktiga klipp.
