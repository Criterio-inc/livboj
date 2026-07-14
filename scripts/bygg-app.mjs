// Genererar och kompilerar Livboj.app till /Applications utifrån mallen
// och ditt manifest. Körs av init-guiden, och manuellt efter att du
// ändrat manifestet:
//
//   npm run bygg-app

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const hem = (p) => p.replace(/^~/, homedir());

// AppleScript-strängliteral (dubbla citattecken escapas)
const asStr = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const asLista = (arr) => `{${arr.map(asStr).join(", ")}}`;

export async function byggApp() {
  const konfig = (await import(path.join(ROT, "livboj.config.mjs"))).default;
  const manifest = (await import(path.join(ROT, "manifest.mjs"))).default;

  // Menyval för återställning: ett per sökväg i manifestet (glober och
  // dubbletter hoppas över), plus "Allt i arkivet" sist.
  const val = [];
  const inkl = [];
  for (const post of manifest) {
    for (const sokvag of post.sokvagar) {
      if (sokvag.includes("*")) continue;
      const abs = hem(sokvag);
      if (inkl.includes(abs)) continue;
      const namn = post.sokvagar.length > 1
        ? `${post.projekt} — ${path.basename(abs)}`
        : post.projekt;
      val.push(namn);
      inkl.push(abs);
    }
  }
  val.push("Allt i arkivet");
  inkl.push("ALLT");

  const mall = await readFile(path.join(ROT, "app", "Livboj.applescript.mall"), "utf8");
  const kalla = mall
    .replaceAll("{{VOLYM}}", konfig.volym)
    .replaceAll("{{ARKIV}}", path.join(konfig.volym, konfig.arkivMapp ?? "restic-arkiv"))
    .replaceAll("{{NYCKELRING}}", konfig.nyckelring ?? "livboj-restic")
    .replaceAll("{{RESTIC}}", konfig.restic ?? "/opt/homebrew/bin/restic")
    .replaceAll("{{NODE}}", process.execPath)
    .replaceAll("{{ROT}}", ROT)
    .replaceAll("{{VAL_LISTA}}", asLista(val))
    .replaceAll("{{INKL_LISTA}}", asLista(inkl));

  const kallFil = path.join(ROT, "app", "Livboj.applescript");
  await writeFile(kallFil, kalla);

  const res = spawnSync("/usr/bin/osacompile", ["-o", "/Applications/Livboj.app", kallFil], {
    encoding: "utf8",
  });
  if (res.status !== 0) throw new Error(`osacompile misslyckades: ${res.stderr}`);
  return { app: "/Applications/Livboj.app", antalVal: val.length };
}

// Körd direkt från terminalen
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const r = await byggApp();
  console.log(`KLART: ${r.app} (${r.antalVal} återställningsval i menyn)`);
}
