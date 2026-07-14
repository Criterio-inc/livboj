// Kvartalets teståterställning: plockar en slumpad fil ur senaste snapshot,
// återställer den till en tillfällig mapp och jämför med originalet (om det
// finns kvar). Registrerar godkänt resultat i status.json så påminnelsen
// tystnar i 90 dagar.
//
//   npm run test-arkivet

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STATUS_FIL = path.join(homedir(), ".livboj", "status.json");

let konfig;
try {
  konfig = (await import(path.join(ROT, "livboj.config.mjs"))).default;
} catch {
  console.error("Hittar inte livboj.config.mjs — kör `npm run init` först.");
  process.exit(1);
}
const REPO = path.join(konfig.volym, konfig.arkivMapp ?? "restic-arkiv");
const RESTIC = konfig.restic ?? "/opt/homebrew/bin/restic";

function restic(args) {
  const res = spawnSync(RESTIC, args, {
    env: {
      ...process.env,
      RESTIC_REPOSITORY: REPO,
      RESTIC_PASSWORD_COMMAND: `/usr/bin/security find-generic-password -s ${konfig.nyckelring ?? "livboj-restic"} -w`,
    },
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error(`restic ${args[0]}: ${res.stderr || res.stdout}`);
  return res.stdout;
}

try {
  await stat(konfig.volym);
} catch {
  console.error("Koppla in backupdisken först.");
  process.exit(1);
}

// Slumpa en fil ur senaste snapshot
const rader = restic(["ls", "latest", "--json"]).trim().split("\n");
const filer = rader
  .map((r) => { try { return JSON.parse(r); } catch { return null; } })
  .filter((p) => p?.type === "file" && p.size > 0);
if (filer.length === 0) throw new Error("Hittade inga filer i senaste snapshot.");
const vald = filer[Math.floor(Math.random() * filer.length)];
console.log(`Testar: ${vald.path} (${(vald.size / 1024).toFixed(1)} kB)`);

// Återställ till tillfällig mapp
const mal = await mkdtemp(path.join(tmpdir(), "livboj-test-"));
restic(["restore", "latest", "--include", vald.path, "--target", mal]);
const aterstalld = path.join(mal, vald.path);
const st = await stat(aterstalld);
if (st.size !== vald.size) throw new Error(`Storleken stämmer inte: ${st.size} ≠ ${vald.size}`);

// Jämför med originalet om det finns kvar
try {
  const original = await readFile(vald.path);
  const kopia = await readFile(aterstalld);
  if (!original.equals(kopia)) throw new Error("Innehållet skiljer sig från originalet!");
  console.log("Innehållet är identiskt med originalet.");
} catch (fel) {
  if (fel.code !== "ENOENT") throw fel;
  console.log("(Originalet finns inte längre lokalt — storlekskontroll räcker.)");
}
await rm(mal, { recursive: true, force: true });

// Registrera godkänt test
let status = {};
try { status = JSON.parse(await readFile(STATUS_FIL, "utf8")); } catch { /* första gången */ }
status.senasteTestaterstallning = new Date().toISOString();
await writeFile(STATUS_FIL, JSON.stringify(status, null, 2));
console.log("GODKÄNT — teståterställningen är registrerad.");
