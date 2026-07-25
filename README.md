# Livboj 🛟

**Suverän backup på egen disk — kurerad, krypterad, ärvbar.**

Livboj gör en extern hårddisk till ditt livs säkerhetskopia, utan
molnkonton och utan abonnemang. Du bestämmer vad som är värdefullt,
disken bor hemma hos dig, och en instruktion på vanlig svenska ligger
på diskroten så att en anhörig kan öppna arkivet den dag det behövs.

*(English summary at the bottom.)*

## Varför Livboj?

Molnbackup är bekvämt tills kontot låses, fakturan slutar betalas
eller leverantören byter villkor. Livboj bygger på tre idéer:

- **Kurerad.** Backupen är en genomtänkt lista (manifestet), inte en
  spegling av hela disken. Kod som redan bor på GitHub dubbellagras
  inte; dokument, foton, databaser och nycklar gör det. Mappar som
  inte finns med i listan ger en varning, så inget glöms tyst.
- **Krypterad.** Arkivet skyddas av [restic](https://restic.net) med
  en lösenfras som bor i macOS-nyckelringen och på ett utskrivet
  papper — aldrig i någon fil på datorn, aldrig i molnet.
- **Ärvbar.** På disken ligger `LÄS-MIG-FÖRST.md`: vad som finns, hur
  man återställer, var lösenfrasen förvaras. Skriven för en människa
  utan teknisk bakgrund, femtio år framåt i tiden.

## Vad du får

- Backup som **startar själv** när disken kopplas in (launchd), med
  notis vid start och när den är klar — plus en daglig körning 09:30
  för dig som låter disken sitta i
- **Förlopp i realtid**: appen visar var körningen befinner sig
  ("43 % klart, ca 5 min kvar") och senaste backup med datum och tid,
  även när disken inte är inkopplad
- **Versionshistorik** — gårdagens version finns kvar även om du
  råkade radera filen igår, med automatisk gallring
  (14 dagliga, 12 veckor, 24 månader, 10 år)
- **Integritetskontroll** vid varje körning — en backup som aldrig
  verifieras är bara en förhoppning
- **Livboj.app** i Program-mappen: återställ med några klick, se alla
  säkerhetskopior, kör backup nu, testa arkivet — ingen Terminal
- **Bläddra i arkivet i Finder**: varje säkerhetskopia som en vanlig
  daterad mapp, skrivskyddad — titta och tidsresa utan att återställa
  (kräver [fuse-t](https://github.com/macos-fuse-t/fuse-t):
  `brew tap macos-fuse-t/homebrew-cask && brew install fuse-t`)
- **Påminnelser**: efter 7 dagar utan backup, och en kvartalsvis
  puff att göra en teståterställning
- **Exportörer**: pluggbara skript som hämtar hem molndata (databaser,
  lagringsbuckets) inför varje backup — se [exportorer/](exportorer/README.md)

## Krav

- macOS (launchd, nyckelringen och AppleScript används)
- [Node.js](https://nodejs.org) 20 eller senare
- [restic](https://restic.net): `brew install restic`
- En extern disk (APFS-formaterad rekommenderas; rymmer den mer än
  ditt data × 3 har historiken gott om plats)

## Kom igång

```
git clone https://github.com/Criterio-inc/livboj.git
cd livboj
npm run init
```

Init-guiden tar dig genom allt: väljer disk, skapar lösenfrasen
(nyckelringen + utskriftsfil för kuvertet), initierar arkivet, öppnar
manifestet för anpassning, laddar automatiken, bygger appen och
lägger LÄS-MIG-FÖRST på disken. Fem minuter, en gång.

Därefter: koppla in disken då och då och vänta på notisen. Det är
hela rutinen.

## Vardagskommandon

```
npm run backup         # kör backupen nu (eller använd appen)
npm run test-arkivet   # återställ en slumpad fil och verifiera den
npm run bygg-app       # bygg om appen efter manifeständring
```

## Säkerhet, ärligt beskrivet

- Lösenfrasen genereras lokalt, hamnar i macOS-nyckelringen och i en
  fil du skriver ut och raderar. Den visas aldrig på skärmen och
  lämnar aldrig datorn.
- Repot innehåller ingen personlig konfiguration: `manifest.mjs`,
  `livboj.config.mjs` och kuvertfilen är gitignorerade. Din fork kan
  vara publik utan att avslöja något.
- Ska Dokument, Skrivbordet eller iCloud Drive ingå behöver `node`
  och `restic` **Full skivåtkomst** (macOS TCC blockerar annars
  bakgrundsjobb tyst) — init-guiden visar exakt hur.
- Disken kan stjälas: arkivet är krypterat, men filer du lägger
  utanför arkivet är det inte. Time Machine på en egen volym
  (krypterad) är ett utmärkt komplement för hela datorn.
- 3-2-1-regeln uppfylls på riktigt först med en andra disk på annan
  plats, roterad då och då.

## English summary

**Livboj** (Swedish for *lifebuoy*) turns an external drive into a
sovereign, self-running backup for macOS — no cloud accounts, no
subscriptions. A curated manifest defines what matters; restic
encrypts and versions it; launchd runs it whenever the drive is
plugged in; a native menu app handles restores; and a plain-language
`READ-ME-FIRST` on the drive lets a non-technical relative recover
everything decades from now. Passphrase lives in the macOS Keychain
plus one printed sheet of paper — never in a file, never on screen.
The UI and docs are in Swedish; fork away and translate.

```
git clone https://github.com/Criterio-inc/livboj.git && cd livboj && npm run init
```

## Licens

MIT — se [LICENSE](LICENSE). Byggd av [Pär Levander](https://criteroconsulting.se)
tillsammans med Claude.
