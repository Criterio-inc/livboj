// Livboj — manifest över vad som är värdefullt och ska med i arkivet.
//
// Kopiera den här filen till manifest.mjs (init-guiden gör det åt dig)
// och anpassa. manifest.mjs är din personliga lista och hålls utanför
// git — bara exempelfilen ligger på GitHub.
//
// Tanken: backupen är KURERAD, inte "hela disken". Kod som redan är
// tryggad via GitHub behöver inte dubbellagras — det som ska hit är
// sådant som bara finns på din dator: dokument, databaser, foton,
// nycklar, exporter från molntjänster.
//
// Regler:
//   - `~` betyder din hemkatalog.
//   - `*` expanderas en nivå (t.ex. ~/Projekt/*/data).
//   - Ett projekt med tom lista är ett MEDVETET beslut ("bara kod,
//     GitHub räcker") — då tjatar Livboj inte om det.
//   - Mappar i dina projektrötter (se livboj.config.mjs) som inte
//     nämns alls här ger en varning vid varje backup, så inget
//     glöms tyst.

export default [
  {
    projekt: "dokument",
    sokvagar: ["~/Documents"],
  },
  {
    projekt: "skrivbord",
    sokvagar: ["~/Desktop"],
  },
  {
    projekt: "icloud-drive",
    // Allt som ligger i iCloud Drive, inklusive appdata. Kräver att
    // node och restic fått Full skivåtkomst (init-guiden förklarar).
    sokvagar: ["~/Library/Mobile Documents"],
  },

  // ---- Exempel: projekt med lokal data ----
  // {
  //   projekt: "mitt-projekt",
  //   sokvagar: [
  //     "~/Projects/mitt-projekt/data",
  //     "~/Projects/mitt-projekt/.env.local",
  //   ],
  // },

  // ---- Exempel: medvetet utan backup (bara kod på GitHub) ----
  // { projekt: "min-hemsida", sokvagar: [] },
];
