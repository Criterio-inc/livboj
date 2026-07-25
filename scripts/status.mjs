// Statusvisning: skriver en kort svensk sammanfattning av backupläget.
// Används av Livboj-appen (visas överst i menyn, och som förloppsvy när
// en backup pågår) och funkar även direkt i terminalen:
//
//   npm run status

import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAPP = path.join(homedir(), ".livboj");

let konfig = null;
try {
  konfig = (await import(path.join(ROT, "livboj.config.mjs"))).default;
} catch {
  console.log("Livboj är inte uppsatt ännu — kör `npm run init` först.");
  process.exit(0);
}

const rader = [];

let status = null;
try {
  status = JSON.parse(await readFile(path.join(MAPP, "status.json"), "utf8"));
} catch { /* ingen körning ännu */ }

function sedan(tidpunkt) {
  const min = Math.round((Date.now() - new Date(tidpunkt)) / 60000);
  if (min < 60) return `för ${min} min sedan`;
  const tim = Math.round(min / 60);
  if (tim < 24) return `för ${tim} tim sedan`;
  const dagar = Math.round(tim / 24);
  return dagar === 1 ? "igår" : `för ${dagar} dagar sedan`;
}

// Pågående körning? Motorn uppdaterar framsteg.json varannan sekund.
try {
  const f = JSON.parse(await readFile(path.join(MAPP, "framsteg.json"), "utf8"));
  const alderS = (Date.now() - new Date(f.uppdaterad)) / 1000;
  const grans = f.fas === "gallring" || f.fas === "kontroll" ? 900 : 120;
  if (alderS < grans) {
    if (f.fas === "restic") {
      let rad = `⏳ Backup pågår — ${f.procent ?? 0} % klart`;
      if (f.sekunderKvar != null) {
        const min = Math.round(f.sekunderKvar / 60);
        rad += min < 1 ? ", strax klar" : `, ca ${min} min kvar`;
      }
      if (f.gbKlart != null && f.gbTotalt) {
        rad += ` (${String(f.gbKlart).replace(".", ",")} av ${String(f.gbTotalt).replace(".", ",")} GB)`;
      }
      rader.push(rad);
    } else if (f.fas === "exportorer") {
      rader.push("⏳ Backup pågår — hämtar molndata (exportörer) …");
    } else if (f.fas === "gallring") {
      rader.push("⏳ Backup pågår — gallrar gamla snapshots …");
    } else if (f.fas === "kontroll") {
      rader.push("⏳ Backup pågår — slutkontroll av arkivet …");
    } else {
      rader.push("⏳ Backup pågår — startar …");
    }
  }
} catch { /* ingen pågående körning */ }

if (!status?.senasteLyckade) {
  rader.push("Ingen backup har körts ännu.");
} else {
  const nar = new Date(status.senasteLyckade).toLocaleString("sv-SE", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
  const dagarSedan = (Date.now() - new Date(status.senasteLyckade)) / 8.64e7;
  const varningar = status.kvitto?.varningar?.length ?? 0;
  const marke = dagarSedan > 7 ? "⚠" : "✓";
  rader.push(`${marke} Senaste backup: ${nar} (${sedan(status.senasteLyckade)})`);
  const gb = status.kvitto?.gbBehandlat;
  rader.push(
    `${status.kvitto?.sokvagar ?? "?"} sökvägar, ${gb != null ? String(gb).replace(".", ",") : "?"} GB` +
    (varningar ? `, ${varningar} varning${varningar === 1 ? "" : "ar"}` : ", inga varningar")
  );
  if (status.senasteTestaterstallning) {
    rader.push(`Senaste teståterställning: ${new Date(status.senasteTestaterstallning).toLocaleDateString("sv-SE", { day: "numeric", month: "long" })} (${sedan(status.senasteTestaterstallning)})`);
  }
}

try {
  await stat(konfig.volym);
  rader.push("Disken är inkopplad.");
} catch {
  rader.push("Disken är inte inkopplad — backupen startar automatiskt när den sätts i.");
}

console.log(rader.join("\n"));
