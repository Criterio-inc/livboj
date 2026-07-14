// Livboj — init-guiden. Körs en gång: sätter upp allt som behövs och
// lämnar efter sig en backup som sköter sig själv.
//
//   npm run init
//
// Guiden: väljer disk → skapar krypteringslösenfras i macOS-nyckelringen
// (+ kuvertfil för utskrift) → initierar restic-arkivet → skriver config →
// öppnar manifestet → sätter upp launchd-automatiken → bygger Livboj.app →
// lägger LÄS-MIG-FÖRST.md på disken → erbjuder första körningen.
//
// Kan köras igen när som helst — befintliga val återanvänds.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, writeFile, stat, copyFile, chmod } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { byggApp } from "./bygg-app.mjs";

const ROT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LIVBOJ_MAPP = path.join(homedir(), ".livboj");
const rl = createInterface({ input: stdin, output: stdout });
const hem = (p) => p.replace(/^~/, homedir());
const finns = async (p) => { try { await stat(p); return true; } catch { return false; } };

console.log(`
╭──────────────────────────────────────────────╮
│  LIVBOJ — suverän backup på egen disk        │
│  kurerad · krypterad · ärvbar                │
╰──────────────────────────────────────────────╯
`);

// ---- 0. Grundkontroller ----
if (process.platform !== "darwin") {
  console.error("Livboj är byggd för macOS (launchd, nyckelringen, AppleScript).");
  process.exit(1);
}
let RESTIC = null;
for (const kandidat of ["/opt/homebrew/bin/restic", "/usr/local/bin/restic"]) {
  if (await finns(kandidat)) { RESTIC = kandidat; break; }
}
if (!RESTIC) {
  const w = spawnSync("/usr/bin/which", ["restic"], { encoding: "utf8" });
  if (w.status === 0) RESTIC = w.stdout.trim();
}
if (!RESTIC) {
  console.error("restic saknas — installera först:  brew install restic");
  process.exit(1);
}
console.log(`✓ restic hittad: ${RESTIC}`);
console.log(`✓ node: ${process.version} (${process.execPath})\n`);

// ---- 1. Vilken disk? ----
let VOLYM;
const befintlig = await finns(path.join(ROT, "livboj.config.mjs"));
if (befintlig) {
  const konfig = (await import(path.join(ROT, "livboj.config.mjs"))).default;
  VOLYM = konfig.volym;
  console.log(`✓ Befintlig config hittad — använder disken ${VOLYM}\n`);
} else {
  const volymer = (await readdir("/Volumes")).filter((v) => !v.startsWith("."));
  console.log("Anslutna diskar:");
  volymer.forEach((v, i) => console.log(`  ${i + 1}. /Volumes/${v}`));
  const svar = await rl.question("\nVilken disk ska vara backupdisk? (siffra eller egen sökväg): ");
  VOLYM = /^\d+$/.test(svar.trim())
    ? `/Volumes/${volymer[Number(svar.trim()) - 1]}`
    : svar.trim();
  if (!(await finns(VOLYM))) {
    console.error(`Hittar inte ${VOLYM} — koppla in disken och kör igen.`);
    process.exit(1);
  }
  const boot = await finns(path.join(VOLYM, "System"));
  if (boot || VOLYM === "/") {
    console.error("Det där ser ut som systemdisken — välj en extern disk.");
    process.exit(1);
  }
}
const ARKIVMAPP = "restic-arkiv";
const REPO = path.join(VOLYM, ARKIVMAPP);

// ---- 2. Lösenfrasen (nyckelringen) ----
const NYCKELRING = "livboj-restic";
const nyckelFinns = spawnSync("/usr/bin/security", ["find-generic-password", "-s", NYCKELRING, "-w"], { stdio: "ignore" }).status === 0;
if (nyckelFinns) {
  console.log(`✓ Lösenfras finns redan i nyckelringen (${NYCKELRING}) — återanvänds.`);
} else {
  const fras = randomBytes(32).toString("base64");
  const res = spawnSync("/usr/bin/security", [
    "add-generic-password", "-U",
    "-a", userInfo().username,
    "-s", NYCKELRING,
    "-w", fras,
    "-j", "Lösenfras för Livbojs krypterade restic-arkiv",
  ]);
  if (res.status !== 0) { console.error("Kunde inte skriva till nyckelringen."); process.exit(1); }
  const kuvert = path.join(ROT, "KUVERT-LOSENFRAS.txt");
  await writeFile(kuvert, `LIVBOJ — LÖSENFRAS TILL DET KRYPTERADE ARKIVET
================================================
Skapad: ${new Date().toISOString().slice(0, 10)}

Den här lösenfrasen låser upp restic-arkivet på backupdisken.
Utan den går arkivet INTE att öppna — förvara den säkert.

Lösenfras:

    ${fras}

Förvaring:
1. SKRIV UT detta papper och lägg det på ett säkert ställe
   (bankfack, kassaskåp, hos en anhörig).
2. Lösenfrasen finns också i din macOS-nyckelring under
   namnet "${NYCKELRING}".
3. Radera den här filen när utskriften är gjord.
`);
  await chmod(kuvert, 0o600);
  console.log(`✓ Ny lösenfras skapad → nyckelringen + KUVERT-LOSENFRAS.txt (SKRIV UT den!)`);
  console.log("  (Lösenfrasen visas aldrig på skärmen.)");
}

// ---- 3. Arkivet ----
const resticEnv = {
  ...process.env,
  RESTIC_REPOSITORY: REPO,
  RESTIC_PASSWORD_COMMAND: `/usr/bin/security find-generic-password -s ${NYCKELRING} -w`,
};
if (await finns(path.join(REPO, "config"))) {
  console.log(`✓ restic-arkiv finns redan: ${REPO}`);
} else {
  const res = spawnSync(RESTIC, ["init"], { env: resticEnv, encoding: "utf8" });
  if (res.status !== 0) { console.error(`restic init misslyckades:\n${res.stderr}`); process.exit(1); }
  console.log(`✓ Krypterat arkiv skapat: ${REPO}`);
}

// ---- 4. Config ----
if (!befintlig) {
  const projSvar = (await rl.question("\nVar ligger dina projekt? (för ”glöms inte”-varningen, Enter = ~/Projects, ”inga” = hoppa över): ")).trim();
  const projektRotar =
    projSvar === "inga" ? []
    : projSvar === "" ? ((await finns(hem("~/Projects"))) ? ["~/Projects"] : [])
    : [projSvar];
  await writeFile(path.join(ROT, "livboj.config.mjs"), `// Livboj — din uppsättning. Skapad av init-guiden ${new Date().toISOString().slice(0, 10)}.
// Filen hålls utanför git.

export default {
  volym: ${JSON.stringify(VOLYM)},
  arkivMapp: ${JSON.stringify(ARKIVMAPP)},
  nyckelring: ${JSON.stringify(NYCKELRING)},
  restic: ${JSON.stringify(RESTIC)},

  // Kör inte om backupen om den senaste lyckades för mindre än så här
  // många timmar sedan (bryter också launchd-självtriggningen).
  sparrTimmar: 6,

  // Mappar vars underkataloger ska finnas med i manifestet — annars varnas.
  projektRotar: ${JSON.stringify(projektRotar)},

  // Hur mycket historik som behålls.
  gallring: { daily: 14, weekly: 12, monthly: 24, yearly: 10 },

  // Andel av arkivet som läskontrolleras vid varje körning.
  lasKontroll: "2%",
};
`);
  console.log("✓ livboj.config.mjs skriven");
}

// ---- 5. Manifestet ----
const manifestFil = path.join(ROT, "manifest.mjs");
if (await finns(manifestFil)) {
  console.log("✓ manifest.mjs finns redan — behålls.");
} else {
  await copyFile(path.join(ROT, "manifest.exempel.mjs"), manifestFil);
  console.log("\nManifestet styr VAD som backas upp. Det öppnas nu i TextEdit —");
  console.log("anpassa listan (exempelraderna räcker långt) och spara.");
  spawnSync("/usr/bin/open", ["-e", manifestFil]);
  await rl.question("Tryck Enter när du har sparat manifestet … ");
}

// ---- 6. Skalmiljö + launchd ----
await mkdir(LIVBOJ_MAPP, { recursive: true });
await writeFile(path.join(LIVBOJ_MAPP, "miljo.sh"), `# Genererad av Livbojs init-guide — används av aterstall.sh och appen.
LIVBOJ_VOLYM=${JSON.stringify(VOLYM)}
LIVBOJ_ARKIV=${JSON.stringify(REPO)}
LIVBOJ_NYCKELRING=${JSON.stringify(NYCKELRING)}
LIVBOJ_RESTIC=${JSON.stringify(RESTIC)}
`);
const korSkript = path.join(LIVBOJ_MAPP, "kor-backup.sh");
await writeFile(korSkript, `#!/bin/bash
# Genererad av Livbojs init-guide — launchd kör den här vid diskinkoppling.
LOGG="$HOME/.livboj/backup.log"
if [ -f "$LOGG" ] && [ "$(stat -f %z "$LOGG")" -gt 1048576 ]; then mv "$LOGG" "$LOGG.gammal"; fi
exec ${JSON.stringify(process.execPath)} ${JSON.stringify(path.join(ROT, "scripts", "livboj.mjs"))} "$@" >> "$LOGG" 2>&1
`);
await chmod(korSkript, 0o755);

const agentMapp = path.join(homedir(), "Library", "LaunchAgents");
await mkdir(agentMapp, { recursive: true });
const plist = (label, inre) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>Label</key>
\t<string>${label}</string>
${inre}
\t<key>StandardOutPath</key>
\t<string>${path.join(LIVBOJ_MAPP, "launchd.log")}</string>
\t<key>StandardErrorPath</key>
\t<string>${path.join(LIVBOJ_MAPP, "launchd.log")}</string>
</dict>
</plist>
`;
await writeFile(path.join(agentMapp, "livboj.backup-disk.plist"), plist("livboj.backup-disk", `\t<key>ProgramArguments</key>
\t<array>
\t\t<string>${korSkript}</string>
\t</array>
\t<key>WatchPaths</key>
\t<array>
\t\t<string>${VOLYM}</string>
\t</array>
\t<key>RunAtLoad</key>
\t<false/>`));
await writeFile(path.join(agentMapp, "livboj.paminnelse.plist"), plist("livboj.paminnelse", `\t<key>ProgramArguments</key>
\t<array>
\t\t<string>${process.execPath}</string>
\t\t<string>${path.join(ROT, "scripts", "paminnelse.mjs")}</string>
\t</array>
\t<key>StartCalendarInterval</key>
\t<dict>
\t\t<key>Hour</key>
\t\t<integer>10</integer>
\t\t<key>Minute</key>
\t\t<integer>0</integer>
\t</dict>
\t<key>RunAtLoad</key>
\t<true/>`));

const uid = process.getuid();
for (const label of ["livboj.backup-disk", "livboj.paminnelse"]) {
  spawnSync("/bin/launchctl", ["bootout", `gui/${uid}/${label}`], { stdio: "ignore" });
  const res = spawnSync("/bin/launchctl", ["bootstrap", `gui/${uid}`, path.join(agentMapp, `${label}.plist`)], { encoding: "utf8" });
  if (res.status !== 0) console.warn(`⚠ Kunde inte ladda ${label}: ${res.stderr}`);
}
console.log("✓ Automatiken laddad: backup vid diskinkoppling + daglig påminnelsekoll");

// ---- 7. Appen ----
try {
  const app = await byggApp();
  console.log(`✓ ${app.app} byggd (${app.antalVal} återställningsval i menyn)`);
} catch (fel) {
  console.warn(`⚠ Kunde inte bygga appen: ${fel.message}`);
}

// ---- 8. LÄS-MIG-FÖRST på disken ----
const mall = await readFile(path.join(ROT, "docs", "LAS-MIG-FORST.mall.md"), "utf8");
await writeFile(path.join(VOLYM, "LÄS-MIG-FÖRST.md"), mall
  .replaceAll("{{VOLYM}}", VOLYM)
  .replaceAll("{{ARKIVMAPP}}", ARKIVMAPP)
  .replaceAll("{{NYCKELRING}}", NYCKELRING)
  .replaceAll("{{ANVANDARE}}", userInfo().username)
  .replaceAll("{{DATUM}}", new Date().toLocaleDateString("sv-SE")));
console.log(`✓ LÄS-MIG-FÖRST.md skriven till ${VOLYM}`);

// ---- 9. Full skivåtkomst ----
console.log(`
VIKTIGT — ett engångsklick i Systeminställningar:
Om manifestet innehåller Dokument, Skrivbordet eller iCloud Drive
blockerar macOS bakgrundsjobb tills du gett Full skivåtkomst till:

   ${process.execPath}
   ${RESTIC}

Systeminställningar → Integritet och säkerhet → Full skivåtkomst →
[+] → tryck Cmd+Skift+G och klistra in sökvägarna ovan, en i taget.
`);

// ---- 10. Första körningen ----
const kor = (await rl.question("Kör första backupen nu? (Ja/nej): ")).trim().toLowerCase();
rl.close();
if (kor === "" || kor.startsWith("j")) {
  const res = spawnSync(process.execPath, [path.join(ROT, "scripts", "livboj.mjs"), "--force"], { stdio: "inherit" });
  process.exit(res.status ?? 0);
} else {
  console.log("\nKlart! Backupen startar automatiskt nästa gång disken kopplas in.");
  console.log("Glöm inte att skriva ut KUVERT-LOSENFRAS.txt.");
}
