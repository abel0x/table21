#!/usr/bin/env bash
set -euo pipefail

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
audio_dir="$project_dir/assets/audio"
mkdir -p "$audio_dir"

encode_noise() {
  output=$1
  source=$2
  filters=$3
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "$source" -af "$filters" \
    -ar 44100 -ac 1 -c:a libvorbis -q:a 3 "$audio_dir/$output"
}

# Two subtly different card-on-felt passes prevent obvious repetition.
encode_noise card-slide-1.ogg \
  "anoisesrc=color=pink:amplitude=0.72:duration=0.24:sample_rate=44100" \
  "highpass=f=360,lowpass=f=4800,afade=t=in:st=0:d=0.012,afade=t=out:st=0.07:d=0.17,volume=0.25"

encode_noise card-slide-2.ogg \
  "anoisesrc=color=brown:amplitude=0.86:duration=0.27:sample_rate=44100" \
  "highpass=f=420,lowpass=f=6200,equalizer=f=1900:t=q:w=1.2:g=5,afade=t=in:st=0:d=0.01,afade=t=out:st=0.08:d=0.19,volume=0.3"

encode_noise card-flip.ogg \
  "anoisesrc=color=white:amplitude=0.55:duration=0.14:sample_rate=44100" \
  "highpass=f=700,lowpass=f=7000,tremolo=f=18:d=0.45,afade=t=in:st=0:d=0.004,afade=t=out:st=0.035:d=0.105,volume=0.2"

encode_noise chip-click-1.ogg \
  "anoisesrc=color=white:amplitude=0.7:duration=0.085:sample_rate=44100" \
  "highpass=f=2100,lowpass=f=9200,equalizer=f=3600:t=q:w=1.1:g=8,afade=t=out:st=0.012:d=0.073,volume=0.22"

encode_noise chip-click-2.ogg \
  "anoisesrc=color=white:amplitude=0.66:duration=0.095:sample_rate=44100" \
  "highpass=f=1800,lowpass=f=8200,equalizer=f=2900:t=q:w=0.9:g=7,afade=t=out:st=0.015:d=0.08,volume=0.24"

# Layer the short impacts into a compact stack settlement.
ffmpeg -hide_banner -loglevel error -y -i "$audio_dir/chip-click-1.ogg" \
  -filter_complex "[0:a]asplit=4[a][b][c][d];[b]adelay=48[b1];[c]adelay=103[c1];[d]adelay=158[d1];[a][b1][c1][d1]amix=inputs=4:normalize=0,volume=0.72" \
  -ar 44100 -ac 1 -c:a libvorbis -q:a 3 "$audio_dir/chip-stack.ogg"

# Low felt friction followed by three restrained chip contacts.
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "anoisesrc=color=brown:amplitude=0.8:duration=0.43:sample_rate=44100" \
  -i "$audio_dir/chip-click-2.ogg" \
  -filter_complex "[0:a]highpass=f=180,lowpass=f=1350,afade=t=out:st=0.13:d=0.3,volume=0.2[slide];[1:a]asplit=3[c1][c2][c3];[c2]adelay=210[c2d];[c3]adelay=300[c3d];[slide][c1][c2d][c3d]amix=inputs=4:normalize=0,volume=0.78" \
  -ar 44100 -ac 1 -c:a libvorbis -q:a 3 "$audio_dir/chips-push.ogg"

# A restrained riffling texture for the visible shoe reset.
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "anoisesrc=color=pink:amplitude=0.7:duration=0.76:sample_rate=44100" \
  -f lavfi -i "anoisesrc=color=brown:amplitude=0.62:duration=0.76:sample_rate=44100" \
  -filter_complex "[0:a]highpass=f=620,lowpass=f=5600,tremolo=f=11:d=0.72,volume=0.2[paper];[1:a]highpass=f=100,lowpass=f=900,tremolo=f=6:d=0.55,volume=0.14[body];[paper][body]amix=inputs=2:normalize=0,afade=t=in:st=0:d=0.03,afade=t=out:st=0.58:d=0.18" \
  -ar 44100 -ac 1 -c:a libvorbis -q:a 3 "$audio_dir/shuffle.ogg"

printf 'Generated local table audio in %s\n' "$audio_dir"
