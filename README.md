# Golf Tracer

En webbapp som ritar in golfbollens bana i en video. Linjen ritas fram i takt med att bollen flyger, från träffen till landningen.

All bearbetning sker i webbläsaren och videon laddas aldrig upp någonstans. Appen är en enda fil, `index.html`, utan byggsteg.

## Så används den

1. Välj en video och ange bildfrekvens (30, 60, 120 eller 240 fps).
2. Stega fram till träffögonblicket, tryck på **Markera träff här** och peka på bollen.
3. Spola till landningen, tryck på **Markera landning här** och peka ut var bollen landar. Du kan också skriva in tiden i luften för hand.
4. Toppen placeras automatiskt. Du kan peka ut den själv eller dra i punkterna.
5. Välj färg, tjocklek och glöd.
6. Tryck på **Exportera video**. Du får en mp4 i Safari och en webm i Chrome.

## Köra lokalt

```sh
python3 -m http.server 8000
# öppna http://localhost:8000
```
