# LÄS MIG FÖRST

*Skriven {{DATUM}}. Den här disken hör till användaren {{ANVANDARE}}.*

Det här är en backupdisk, uppsatt med verktyget Livboj
(github.com/Criterio-inc/livboj). Den är byggd för att du som läser
ska kunna få tillbaka det som betyder något, även om du inte är
teknisk och även om det gått många år.

## Vad finns på disken?

Mappen `{{ARKIVMAPP}}` är ett krypterat och versionerat arkiv, skapat
med programmet restic. Det innehåller de mappar och filer som diskens
ägare valt att skydda: dokument, bilder, databaser och annat som bara
fanns på datorn.

## Återställa

**På ägarens egen Mac är det enklast så här:** öppna appen **Livboj**
i Program-mappen och välj "Återställ filer". Den frågar vad du vill
hämta och lägger allt i en ny mapp i hemkatalogen, utan att skriva
över något.

På en annan dator behöver du två saker: programmet **restic** (gratis,
öppen källkod, finns på restic.net eller via `brew install restic`)
och **lösenfrasen**. Lösenfrasen finns på det utskrivna papper som
förvaras säkert (fråga efter "kuvertet"), och i ägarens
macOS-nyckelring under namnet `{{NYCKELRING}}`.

Öppna Terminal på en Mac med disken inkopplad och klistra in:

```
export RESTIC_REPOSITORY={{VOLYM}}/{{ARKIVMAPP}}
restic snapshots
```

Skriv in lösenfrasen när den efterfrågas. Du ser nu en lista över
alla säkerhetskopior med datum. Återställ allt ur den senaste till
en mapp i hemkatalogen:

```
restic restore latest --target ~/Aterstallt
```

Efteråt ligger allt under `~/Aterstallt` med samma mappstruktur som
på ägarens dator. Vill du bara ha en del, lägg till `--include` med
en sökväg.

## Hur disken hålls uppdaterad

Backupen sköter sig själv: när disken kopplas in i ägarens Mac
startar den automatiskt, och en notis visas när den är klar. Går det
mer än en vecka utan backup påminner datorn själv.
