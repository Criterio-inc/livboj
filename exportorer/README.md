# Exportörer

Molndata kan inte backas upp förrän den finns lokalt. En exportör är
ett litet skript som hämtar hem data från en molntjänst till en lokal
mapp — sedan tar Livboj med mappen i det krypterade arkivet som allt
annat (lägg mappen i ditt manifest!).

Lägg en `.mjs`-fil i den här mappen så körs den automatiskt i början
av varje backup. Kontraktet är enkelt:

```js
// exportorer/min-tjanst.mjs
export default async function ({ logg, varna, hem }) {
  // logg("text")  — skriver till backuploggen
  // varna("text") — läggs till varningslistan i notisen
  // hem           — din hemkatalog som sträng

  // ... hämta data till t.ex. `${hem}/Backups/min-tjanst/` ...
  logg("42 dokument speglade");
}
```

Ett fel i en exportör stoppar inte backupen — det blir en varning,
och resten körs som vanligt.

## Tips

- **Inkrementellt:** ladda bara ner det som är nytt eller ändrat
  (jämför filstorlek eller tidsstämpel), annars blir körningarna
  långsamma.
- **Radera inget lokalt** när något försvinner i molnet — den lokala
  mappen får gärna fungera som papperskorg. Versionshistoriken
  sköter restic ändå.
- **Nycklar och lösenord** till molntjänsten hör hemma i
  macOS-nyckelringen (`security add-generic-password`), inte i
  skriptet. Läs dem med `security find-generic-password -s namnet -w`
  via `child_process`.
- **Exempel på mönster:** dumpa databastabeller som JSON till en
  daterad mapp, spegla en lagringsbucket fil för fil, exportera
  kalendern som .ics. Skriv gärna ett kvitto (JSON med tidpunkt och
  antal) sist — då ser du i efterhand att exporten mår bra.
