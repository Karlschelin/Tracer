# Design

## Riktning
Ett verktyg för att redigera video, inte en webbsida. Videon är huvudsaken och kontrollerna ska synas så lite som möjligt. Känslan är TV-grafik från golfsändningar: kondenserad versal-typografi och en enda stark accent (tracer-röd).

## Tokens (behåll, utöka bara)
- Färger: `--bg`, `--panel`, `--fg`, `--muted`, `--line`, `--accent`, `--stage`, `--ok`. Mörkt tema är förstahandsvalet för redigeringsvyn. Ljust ska fungera.
- Typsnitt: Barlow Condensed (rubriker/etiketter), Barlow (text), JetBrains Mono (tider, siffror).
- Rundning 8–10 px, inga skuggor utom på flytande element över videon.

## Layout (mobil först)
1. **Video överst**, så stor som möjligt.
2. **Filmremsa/tidslinje** under videon med miniatyrbilder. Markörer för träff (vit) och landning (röd) syns direkt på remsan och kan dras.
3. **Ett steg i taget** längst ner (bottom sheet): Välj video → Träff → Landning → Justera → Exportera. Visa bara aktuellt stegs kontroller. Desktop kan visa sidopanelen som nu.
4. **Exportvy** med förhandsvisning, framsteg och en tydlig Spara-knapp.

## Interaktion
- **Förstoringslupp** när man pekar ut bollen, så att fingret inte täcker den. Pekpunkten hamnar ovanför fingret.
- Fäst automatiskt mot närmaste ljusa fläck (snap) när man placerar start och landning.
- Ångra/gör om. Haptik är inte möjligt i webben, så använd tydliga visuella kvitton.
- Spela-knappen och stegning är stora (minst 44 px).

## Tracer-stilar
- **TV:** röd/gul linje med vit kärna och glöd. Linjen tunnas av mot slutet (perspektiv).
- **Neon:** tjock glöd, mättad färg.
- **Minimal:** tunn vit linje utan glöd.
Linjen ska bli något smalare ju längre bort bollen är, eftersom det säljer djupet.
