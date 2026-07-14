#!/bin/bash
# Återställning åt Livboj-appen: hämtar filer ur restic-arkivet till en ny
# mapp i hemkatalogen och öppnar den i Finder. Skriver aldrig över något.
#
#   aterstall.sh <snapshot-id|latest> <sökväg|ALLT>
set -u

MILJO="$HOME/.livboj/miljo.sh"
if [ ! -f "$MILJO" ]; then
  /usr/bin/osascript -e 'display notification "Kör npm run init först." with title "Livboj"'
  exit 1
fi
# shellcheck source=/dev/null
source "$MILJO"   # sätter LIVBOJ_VOLYM, LIVBOJ_ARKIV, LIVBOJ_NYCKELRING, LIVBOJ_RESTIC

SNAP="${1:-latest}"
VAL="${2:-ALLT}"
export RESTIC_REPOSITORY="$LIVBOJ_ARKIV"
export RESTIC_PASSWORD_COMMAND="/usr/bin/security find-generic-password -s $LIVBOJ_NYCKELRING -w"
MAL="$HOME/Återställt $(date '+%Y-%m-%d %H.%M')"
LOGG="$HOME/.livboj/aterstallning.log"
mkdir -p "$HOME/.livboj"

notis() { /usr/bin/osascript -e "display notification \"$1\" with title \"Livboj\""; }

ARGS=(restore "$SNAP" --target "$MAL")
[ "$VAL" != "ALLT" ] && ARGS+=(--include "$VAL")

echo "=== $(date '+%F %T') restore $SNAP $VAL -> $MAL" >> "$LOGG"
if "$LIVBOJ_RESTIC" "${ARGS[@]}" >> "$LOGG" 2>&1; then
  # restic återskapar hela mappstrukturen — öppna direkt i det hämtade
  OPPNA="$MAL"
  [ "$VAL" != "ALLT" ] && [ -d "$MAL$VAL" ] && OPPNA="$MAL$VAL"
  notis "Klart! Mappen öppnas i Finder."
  open "$OPPNA"
else
  notis "Återställningen misslyckades — loggen öppnas."
  open -e "$LOGG"
  exit 1
fi
