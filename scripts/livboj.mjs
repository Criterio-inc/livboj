// Livboj — motorn. Körs automatiskt när backupdisken kopplas in
// (launchd WatchPaths, sätts upp av init-guiden) eller manuellt:
//
//   npm run backup            (= node scripts/livboj.mjs --force)
//
// Flöde: exportörer → restic-backup av manifestet → gallring →
// integritetskontroll → notis + kvitto.
//
// Målet är inte backup utan ÅTERSTÄLLNING: se LÄS-MIG-FÖRST.md på disken.

import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile, stat, rm, rename } from "node:fs/promises";
import { constants as fsConst, writeFileSync, renameSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STATUS_MAPP = path.join(homedir(), ".livboj");
const STATUS_FIL = path.join(STATUS_MAPP, "status.json");

const hem = (p) => p.replace(/^~/, homedir());
const force = process.argv.includes("--force");

async function lasModul(namn, hjalp) {
  try {
    return (await import(path.join(ROT, namn))).default;
  } catch {
    console.error(`Hittar inte ${namn} — ${hjalp}`);
    process.exit(1);
  }
}
const konfig = await lasModul("livboj.config.mjs", "kör `npm run init` först.");
const manifest = await lasModul("manifest.mjs", "kör `npm run init`, eller kopiera manifest.exempel.mjs till manifest.mjs.");

const VOLYM = konfig.volym;
const REPO = path.join(VOLYM, konfig.arkivMapp ?? "restic-arkiv");
const RESTIC = konfig.restic ?? "/opt/homebrew/bin/restic";
const SPARR_TIMMAR = konfig.sparrTimmar ?? 6; // WatchPaths triggar på våra egna skrivningar — spärren bryter loopen
const GALLRING = konfig.gallring ?? { daily: 14, weekly: 12, monthly: 24, yearly: 10 };

function notis(rubrik, text) {
  spawnSync("/usr/bin/osascript", [
    "-e",
    `display notification ${JSON.stringify(text)} with title ${JSON.stringify(rubrik)}`,
  ]);
}

// Förloppsfilen läses av status.mjs och appen ("Backup pågår — 34 %").
// Tvingade fasbyten skrivs SYNKRONT: de följs ofta av ett blockerande
// spawnSync-anrop som stoppar eventloopen, och en asynkron skrivning
// skulle då aldrig hinna köra förrän fasen är över. Strömuppdateringar
// skrivs seriellt och atomiskt (tempfil + rename), och ett sekvensnummer
// hindrar en omsprungen köad skrivning från att skriva över färskare info.
const FRAMSTEG_FIL = path.join(STATUS_MAPP, "framsteg.json");
let framstegSkrivet = 0;
let framstegSekvens = 0;
let framstegKedja = Promise.resolve();
function framsteg(data, tvinga = false) {
  if (!tvinga && Date.now() - framstegSkrivet < 2000) return;
  framstegSkrivet = Date.now();
  const sekvens = ++framstegSekvens;
  const innehall = JSON.stringify({ ...data, uppdaterad: new Date().toISOString() });
  if (tvinga) {
    try {
      writeFileSync(FRAMSTEG_FIL + ".tmp", innehall);
      renameSync(FRAMSTEG_FIL + ".tmp", FRAMSTEG_FIL);
    } catch { /* förloppet är hjälpinfo, aldrig stoppande */ }
    return;
  }
  framstegKedja = framstegKedja
    .then(async () => {
      if (sekvens !== framstegSekvens) return;
      await writeFile(FRAMSTEG_FIL + ".tmp", innehall);
      await rename(FRAMSTEG_FIL + ".tmp", FRAMSTEG_FIL);
    })
    .catch(() => {});
}

function resticEnv() {
  return {
    ...process.env,
    RESTIC_REPOSITORY: REPO,
    RESTIC_PASSWORD_COMMAND: `/usr/bin/security find-generic-password -s ${konfig.nyckelring ?? "livboj-restic"} -w`,
  };
}

function restic(args, tillatnaKoder = [0], harForsokt = false) {
  const res = spawnSync(RESTIC, args, {
    env: resticEnv(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (!tillatnaKoder.includes(res.status)) {
    const fel = res.stderr || res.stdout;
    // Kvarglömt lås efter en död process (avbruten körning, strömavbrott):
    // om ingen annan restic kör på maskinen är det säkert att låsa upp och
    // försöka en gång till.
    const arLas = String(fel).includes("already locked");
    const annanKor = spawnSync("/usr/bin/pgrep", ["-x", "restic"]).status === 0;
    if (arLas && !annanKor && !harForsokt && args[0] !== "unlock") {
      console.log(`  kvarglömt lås upptäckt (${args[0]}) — låser upp och försöker igen …`);
      restic(["unlock"], [0], true);
      return restic(args, tillatnaKoder, true);
    }
    throw new Error(`restic ${args[0]} misslyckades:\n${fel}`);
  }
  return { ut: res.stdout, kod: res.status };
}

// Strömmande restic-backup: JSON-raderna tolkas medan de kommer, så att
// procent och tid kvar kan visas i appen under körningens gång.
function resticBackupStrom(args) {
  return new Promise((losa) => {
    const p = spawn(RESTIC, args, { env: resticEnv() });
    const jsonRader = [];
    let rest = "", stderr = "";
    p.stdout.on("data", (bit) => {
      rest += bit;
      let i;
      while ((i = rest.indexOf("\n")) >= 0) {
        const rad = rest.slice(0, i);
        rest = rest.slice(i + 1);
        try {
          const r = JSON.parse(rad);
          jsonRader.push(r);
          if (r.message_type === "status") {
            framsteg({
              fas: "restic",
              procent: Math.round((r.percent_done ?? 0) * 100),
              sekunderKvar: r.seconds_remaining ?? null,
              gbKlart: Number((r.bytes_done / 1e9).toFixed(1)),
              gbTotalt: r.total_bytes ? Number((r.total_bytes / 1e9).toFixed(1)) : null,
            });
          }
        } catch { /* icke-JSON-rad */ }
      }
    });
    p.stderr.on("data", (bit) => { stderr += bit; });
    p.on("close", (kod) => losa({ kod, jsonRader, stderr }));
  });
}

async function lasStatus() {
  try {
    return JSON.parse(await readFile(STATUS_FIL, "utf8"));
  } catch {
    return {};
  }
}

// `*` expanderas en nivå, t.ex. ~/Projekt/*/data. Glob-träffar som saknar
// resten av sökvägen hoppas över tyst — det är normalt, inget att varna för.
async function expandera(sokvag) {
  const abs = hem(sokvag);
  if (!abs.includes("*")) return { vagar: [abs], glob: false };
  const [fore, efter] = abs.split("*");
  const bas = fore.replace(/\/$/, "");
  const vagar = [];
  try {
    for (const post of await readdir(bas, { withFileTypes: true })) {
      if (!post.isDirectory()) continue;
      const kandidat = path.join(bas, post.name) + efter;
      try {
        await stat(kandidat);
        vagar.push(kandidat);
      } catch { /* saknas — tyst */ }
    }
  } catch { /* basen saknas — tyst */ }
  return { vagar, glob: true };
}

// ---- 0. Spärrar ----
try {
  await stat(VOLYM);
} catch {
  console.log("Backupdisken är inte inkopplad — hoppar över.");
  process.exit(0);
}

// En nyss inkopplad disk kan synas utan att vara skrivklar (ger EACCES).
// Ge den upp till 40 sekunder att vakna innan vi ger upp.
for (let forsok = 1; ; forsok++) {
  try {
    await access(VOLYM, fsConst.W_OK);
    break;
  } catch {
    if (forsok === 4) {
      console.error("FEL: disken är inkopplad men inte skrivbar ännu.");
      notis("Livboj väntar", "Disken svarar inte ännu — ny start vid nästa trigger.");
      process.exit(1);
    }
    console.log(`Disken är inte skrivklar (försök ${forsok}) — väntar 10 s …`);
    await new Promise((v) => setTimeout(v, 10_000));
  }
}

await mkdir(STATUS_MAPP, { recursive: true });

// Livboj-appen lägger en "kör nu"-flagga och sparkar igång launchd-jobbet —
// flaggan fungerar som --force och förbrukas direkt.
let korNu = false;
try {
  await rm(path.join(STATUS_MAPP, "kor-nu"));
  korNu = true;
} catch { /* ingen flagga */ }

const status = await lasStatus();
if (!force && !korNu && status.senasteLyckade) {
  const timmarSedan = (Date.now() - new Date(status.senasteLyckade)) / 3.6e6;
  if (timmarSedan < SPARR_TIMMAR) {
    console.log(`Senaste backup för ${timmarSedan.toFixed(1)} h sedan — hoppar över (kör med --force för att tvinga).`);
    process.exit(0);
  }
}

console.log(`\n=== Livboj ${new Date().toLocaleString("sv-SE")} ===`);
const varningar = [];
notis("Backup startad …", "Följ förloppet i Livboj-appen.");
framsteg({ fas: "start" }, true);

try {
  // ---- 1. Exportörer (valfria, ligger i exportorer/*.mjs) ----
  framsteg({ fas: "exportorer" }, true);
  const exportMapp = path.join(ROT, "exportorer");
  let exportFiler = [];
  try {
    exportFiler = (await readdir(exportMapp)).filter((f) => f.endsWith(".mjs"));
  } catch { /* ingen exportörsmapp */ }
  for (const fil of exportFiler) {
    console.log(`Kör exportören ${fil} …`);
    try {
      const kor = (await import(path.join(exportMapp, fil))).default;
      await kor({
        logg: (t) => console.log(`  ${t}`),
        varna: (t) => varningar.push(`${fil}: ${t}`),
        hem: homedir(),
      });
    } catch (fel) {
      varningar.push(`exportören ${fil} felade: ${fel.message}`);
    }
  }

  // ---- 2. Manifestet → sökvägar ----
  const vagar = [];
  let harICloud = false;
  for (const post of manifest) {
    for (const sokvag of post.sokvagar) {
      const { vagar: expanderade, glob } = await expandera(sokvag);
      for (const abs of expanderade) {
        try {
          await stat(abs);
          vagar.push(abs);
          if (abs.includes("Mobile Documents")) harICloud = true;
        } catch (fel) {
          if (!glob) {
            varningar.push(
              fel.code === "EPERM" || fel.code === "EACCES"
                ? `${post.projekt}: ${abs} är blockerad av macOS — ge node och restic Full skivåtkomst`
                : `${post.projekt}: ${abs} finns inte`
            );
          }
        }
      }
    }
  }
  if (vagar.length === 0) throw new Error("Manifestet gav inga sökvägar att backa upp.");

  // iCloud kan ha vräkt filer till molnet ("Optimera Mac-lagring") så att
  // bara skal ligger kvar. Be systemet hämta hem, och räkna det som är kvar.
  if (harICloud) {
    const icloudRot = path.join(homedir(), "Library", "Mobile Documents");
    spawnSync("/usr/bin/brctl", ["download", icloudRot], { timeout: 30_000 });
    const kvar = spawnSync("/usr/bin/find", [icloudRot, "-type", "f", "-name", "*.icloud"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    }).stdout.trim();
    const antal = kvar ? kvar.split("\n").length : 0;
    if (antal > 0) varningar.push(`${antal} iCloud-filer är fortfarande bara i molnet — de följer med nästa körning`);
  }

  // Mappar i projektrötterna som manifestet inte känner till?
  const kanda = new Set(manifest.map((p) => p.projekt));
  for (const rot of konfig.projektRotar ?? []) {
    try {
      for (const post of await readdir(hem(rot), { withFileTypes: true })) {
        if (post.isDirectory() && !post.name.startsWith(".") && !kanda.has(post.name)) {
          varningar.push(`${post.name} (i ${rot}) saknas i manifestet — lägg till eller markera som "bara kod"`);
        }
      }
    } catch { /* roten finns inte */ }
  }

  // ---- 3. restic-backup ----
  console.log(`Kör restic-backup av ${vagar.length} sökvägar …`);
  const listFil = path.join(tmpdir(), `livboj-${process.pid}.txt`);
  await writeFile(listFil, vagar.join("\n") + "\n");
  // Exit-kod 3 = snapshot skapad men vissa filer gick inte att läsas.
  // Strömmande körning så att förloppet syns i appen medan det pågår.
  const backupArgs = [
    "backup",
    "--files-from", listFil,
    "--exclude", ".DS_Store",
    "--exclude", "node_modules",
    "--exclude", "*.icloud",
    // Expo Go:s iCloud-container: utvecklarcache som dessutom ger
    // "resource deadlock avoided" vid läsning (FileProvider-egenhet).
    "--exclude", "iCloud~host~exp~Exponent",
    "--tag", "livboj",
    "--json",
  ];
  framsteg({ fas: "restic", procent: 0 }, true);
  let strom = await resticBackupStrom(backupArgs);
  // Kvarglömt lås efter en död process? Självläk och försök igen.
  if (strom.kod !== 0 && strom.kod !== 3
      && String(strom.stderr).includes("already locked")
      && spawnSync("/usr/bin/pgrep", ["-x", "restic"]).status !== 0) {
    console.log("  kvarglömt lås upptäckt — låser upp och försöker igen …");
    restic(["unlock"]);
    strom = await resticBackupStrom(backupArgs);
  }
  if (strom.kod !== 0 && strom.kod !== 3) {
    throw new Error(`restic backup misslyckades:\n${strom.stderr}`);
  }
  if (strom.kod === 3) {
    // restic skriver läsfelen på stderr, inte i JSON-strömmen
    const felRader = strom.stderr.split("\n").filter((r) => r.trim());
    varningar.push(`${felRader.length || "vissa"} filer kunde inte läsas — detaljer i loggen`);
    for (const r of felRader.slice(0, 8)) console.log(`  ⚠ ${r}`);
    if (felRader.length > 8) console.log(`  … och ${felRader.length - 8} rader till`);
  }
  const sammanfattning = strom.jsonRader
    .filter((r) => r?.message_type === "summary")
    .at(-1);
  const gb = ((sammanfattning?.total_bytes_processed ?? 0) / 1e9).toFixed(1);
  console.log(
    `  ${gb} GB genomgånget, ${sammanfattning?.files_new ?? "?"} nya filer, ` +
    `${sammanfattning?.files_changed ?? "?"} ändrade, snapshot ${sammanfattning?.snapshot_id?.slice(0, 8) ?? "?"}`
  );

  // ---- 4. Gallring (prunea på söndagar) ----
  console.log("Gallrar gamla snapshots …");
  framsteg({ fas: "gallring" }, true);
  const gallring = [
    "forget", "--tag", "livboj",
    "--keep-daily", String(GALLRING.daily),
    "--keep-weekly", String(GALLRING.weekly),
    "--keep-monthly", String(GALLRING.monthly),
    "--keep-yearly", String(GALLRING.yearly),
  ];
  if (new Date().getDay() === 0) gallring.push("--prune");
  restic(gallring);

  // ---- 5. Integritetskontroll ----
  console.log("Kontrollerar arkivets integritet (restic check) …");
  framsteg({ fas: "kontroll" }, true);
  restic(["check", `--read-data-subset=${konfig.lasKontroll ?? "2%"}`]);

  // ---- 6. Kvitto ----
  await writeFile(
    STATUS_FIL,
    JSON.stringify(
      {
        ...status,
        senasteLyckade: new Date().toISOString(),
        kvitto: {
          sokvagar: vagar.length,
          gbBehandlat: Number(gb),
          nyaFiler: sammanfattning?.files_new ?? null,
          varningar,
        },
      },
      null,
      2
    )
  );

  const varningsText = varningar.length ? ` • ${varningar.length} varning(ar), se loggen` : "";
  notis("Livboj: backup klar ✓", `${vagar.length} sökvägar, ${gb} GB${varningsText}`);
  if (varningar.length) {
    console.log("VARNINGAR:");
    for (const v of varningar) console.log(`  ⚠ ${v}`);
  }
  console.log("KLART.");
  await framstegKedja; // låt sista skrivningen landa innan filen tas bort
  await rm(FRAMSTEG_FIL, { force: true });
} catch (fel) {
  await framstegKedja;
  await rm(FRAMSTEG_FIL, { force: true });
  console.error(`FEL: ${fel.message}`);
  notis("Livboj: backup MISSLYCKADES ✗", String(fel.message).slice(0, 200));
  process.exit(1);
}
