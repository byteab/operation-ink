#!/bin/sh
# Renders guard voice lines with macOS `say` into public/sounds/voice_<voice>_<group>_<n>.m4a.
# Original lines, no licensed recordings. Re-run after editing the LINES table.
set -e
OUT="$(dirname "$0")/../public/sounds"; TMP="$(mktemp -d)"; mkdir -p "$OUT"
VOICES='Daniel
Reed (English (US))
Eddy (English (US))
Reed (English (UK))'
LINES='spot|Hey!|Hey you!|Stop right there!|Who is there?|You! Stop!|Hold it!
contact|Hey you!|Stop there!|You cannot escape!|Intruder! Open fire!|Over there!
lost|Where are you?|Where did he go?|He went around the corner!|Keep your eyes open!
search|Come out!|Where are you?|I know you are here.|You cannot hide!
hurt|Ouch!|Ah!|I am hit!
down|Man down! Man down!|They got him!
reload|Reloading! Cover me!|Changing mags!
flank|Flanking! Keep him busy!|Moving up!|Cover me, I am going around!
retreat|Fall back!|I need help over here!
clear|All clear.|Must have been nothing.|Back to post.'
echo "$LINES" | while IFS= read -r row; do
  group="${row%%|*}"; rest="${row#*|}"; n=0
  # Optional comma-delimited subset avoids rewriting unrelated recordings.
  case ",${VOICE_GROUP_FILTER:-$group}," in *",$group,"*) ;; *) continue ;; esac
  echo "$rest" | tr '|' '\n' | while IFS= read -r line; do
    v=0
    printf '%s\n' "$VOICES" | while IFS= read -r voice; do
      say -v "$voice" -r 185 -o "$TMP/l.aiff" "$line"
      # Resample BEFORE the small pitch shift: source voices use different
      # native sample rates. Avoid accidentally doubling the voice's speed.
      ffmpeg -v error -y -i "$TMP/l.aiff" -af "aresample=44100,asetrate=44100*0.96,aresample=44100,highpass=f=100,lowpass=f=7000,silenceremove=start_periods=1:start_threshold=-45dB,alimiter=limit=0.9" -ac 1 -ar 44100 -c:a aac -b:a 96k "$TMP/voice.m4a"
      duration="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$TMP/voice.m4a")"
      if [ -z "$duration" ] || [ "$duration" = N/A ]; then
        printf 'Speech rendering failed for %s: %s. Existing audio was preserved.\n' "$voice" "$line" >&2
        exit 1
      fi
      mv "$TMP/voice.m4a" "$OUT/voice_${v}_${group}_${n}.m4a"
      v=$((v+1))
    done
    n=$((n+1))
  done
done
rm -rf "$TMP"; ls "$OUT" | grep -c voice_
