// Tjatet som gör att backuprutinen överlever verkligheten.
// Körs dagligen kl 10:00 och vid inloggning (launchd, sätts upp av init):
//
//   - mer än 7 dagar sedan senaste lyckade backup → påminnelse-notis
//   - mer än 90 dagar sedan senaste teståterställning → kvartalspåminnelse
//     (visas bara på måndagar, så den inte tjatar dagligen)

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

const STATUS_FIL = path.join(homedir(), ".livboj", "status.json");

function notis(rubrik, text) {
  spawnSync("/usr/bin/osascript", [
    "-e",
    `display notification ${JSON.stringify(text)} with title ${JSON.stringify(rubrik)}`,
  ]);
}

let status = {};
try {
  status = JSON.parse(await readFile(STATUS_FIL, "utf8"));
} catch {
  notis("Livboj", "Ingen backup har körts ännu — koppla in backupdisken.");
  process.exit(0);
}

const dagarSedan = (tidpunkt) => (Date.now() - new Date(tidpunkt)) / 8.64e7;

if (status.senasteLyckade) {
  const dagar = Math.floor(dagarSedan(status.senasteLyckade));
  if (dagar > 7) {
    notis("Livboj: dags för backup", `${dagar} dagar sedan senaste backup — koppla in disken.`);
  }
}

const arMandag = new Date().getDay() === 1;
const testGammal = !status.senasteTestaterstallning || dagarSedan(status.senasteTestaterstallning) > 90;
if (arMandag && testGammal) {
  notis(
    "Livboj: kvartalskoll",
    "En backup som aldrig testas är en förhoppning. Öppna Livboj-appen och välj Testa arkivet."
  );
}
