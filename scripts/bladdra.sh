#!/bin/bash
# Bläddra i restic-arkivet som en vanlig mapp i Finder, utan att återställa
# något. Monterar arkivet skrivskyddat via restic mount (kräver fuse-t:
# brew tap macos-fuse-t/homebrew-cask && brew install fuse-t).
#
#   bladdra.sh oppna   — montera och öppna senaste snapshot i Finder
#   bladdra.sh stang   — koppla från
#
# Under mappen snapshots/ ligger varje säkerhetskopia som en egen daterad
# mapp — tidsresa genom att öppna en äldre. Motorn kopplar själv från
# bläddraren när en backup startar (annars krockar låsen).
set -u

MILJO="$HOME/.livboj/miljo.sh"
if [ ! -f "$MILJO" ]; then
  /usr/bin/osascript -e 'display notification "Kör npm run init först." with title "Livboj"'
  exit 1
fi
# shellcheck source=/dev/null
source "$MILJO"   # sätter LIVBOJ_VOLYM, LIVBOJ_ARKIV, LIVBOJ_NYCKELRING, LIVBOJ_RESTIC

MONT="$HOME/Livboj-arkivet"
export RESTIC_REPOSITORY="$LIVBOJ_ARKIV"
export RESTIC_PASSWORD_COMMAND="/usr/bin/security find-generic-password -s $LIVBOJ_NYCKELRING -w"
LOGG="$HOME/.livboj/bladdra.log"

notis() { /usr/bin/osascript -e "display notification \"$1\" with title \"Livboj\""; }
monterad() { /sbin/mount | grep -q "$MONT"; }

if [ "${1:-oppna}" = "stang" ]; then
  if monterad; then
    /sbin/umount "$MONT" 2>/dev/null || /usr/sbin/diskutil unmount "$MONT" > /dev/null 2>&1
    /usr/bin/pkill -f "restic mount" 2>/dev/null
    notis "Arkivbläddraren är frånkopplad."
  else
    notis "Arkivbläddraren var inte igång."
  fi
  exit 0
fi

if monterad; then
  open "$MONT/snapshots/latest" 2>/dev/null || open "$MONT"
  exit 0
fi
if [ ! -d "$LIVBOJ_VOLYM" ]; then
  notis "Koppla in backupdisken först."
  exit 1
fi
if [ ! -f /usr/local/lib/libfuse-t.dylib ] && ! ls /usr/local/lib/libfuse-t-*.dylib > /dev/null 2>&1 && [ ! -d /Library/Frameworks/macFUSE.framework ]; then
  notis "Bläddring kräver fuse-t — installera med: brew install fuse-t"
  exit 1
fi

mkdir -p "$MONT"
echo "=== $(date '+%F %T') montera" >> "$LOGG"
nohup "$LIVBOJ_RESTIC" mount "$MONT" >> "$LOGG" 2>&1 &

for i in $(seq 1 30); do
  sleep 1
  [ -d "$MONT/snapshots" ] && break
done
if [ -d "$MONT/snapshots" ]; then
  notis "Arkivet är öppet som mapp — koppla från via appen när du är klar."
  open "$MONT/snapshots/latest" 2>/dev/null || open "$MONT/snapshots"
else
  notis "Kunde inte öppna arkivet — loggen öppnas."
  open -e "$LOGG"
  exit 1
fi
