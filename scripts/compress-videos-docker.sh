#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
    printf 'Usage: %s <input-dir> [--max-bytes=1048576] [--target-kb=950] [--width=720] [--audio=48k]\n' "$0" >&2
    printf 'Example: %s public/videos/artistics\n' "$0" >&2
    exit 1
fi

input_dir=$1
shift

max_bytes=1048576
target_kb=950
width=720
audio_bitrate=48k

for arg in "$@"; do
    case "$arg" in
        --max-bytes=*) max_bytes=${arg#--max-bytes=} ;;
        --target-kb=*) target_kb=${arg#--target-kb=} ;;
        --width=*) width=${arg#--width=} ;;
        --audio=*) audio_bitrate=${arg#--audio=} ;;
        --*)
            printf 'Unknown option: %s\n' "$arg" >&2
            exit 1
            ;;
        *)
            printf 'Unexpected argument: %s\n' "$arg" >&2
            exit 1
            ;;
    esac
done

if [ ! -d "$input_dir" ]; then
    printf 'Input directory not found: %s\n' "$input_dir" >&2
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    printf 'Docker not found. Install/start Docker first.\n' >&2
    exit 1
fi

case "$audio_bitrate" in
    *k) audio_bitrate_k=${audio_bitrate%k} ;;
    *) audio_bitrate_k=$audio_bitrate ;;
esac

if ! [[ "$max_bytes" =~ ^[0-9]+$ ]] || ! [[ "$target_kb" =~ ^[0-9]+$ ]] || ! [[ "$width" =~ ^[0-9]+$ ]] || ! [[ "$audio_bitrate_k" =~ ^[0-9]+$ ]]; then
    printf 'Options --max-bytes, --target-kb, --width, and --audio must be numeric values.\n' >&2
    exit 1
fi

shopt -s nullglob
input_files=("$input_dir"/*.mp4)
shopt -u nullglob

if [ "${#input_files[@]}" -eq 0 ]; then
    printf 'No .mp4 files found in: %s\n' "$input_dir" >&2
    exit 1
fi

uid_gid="$(id -u):$(id -g)"
image="jrottenberg/ffmpeg:6.1-alpine"
min_video_bitrate_k=120

for file in "${input_files[@]}"; do
    original_size=$(stat -c '%s' "$file")

    if [ "$original_size" -lt "$max_bytes" ]; then
        printf 'Skip already under limit: %s (%s bytes)\n' "$file" "$original_size"
        continue
    fi

    duration=$(docker run --rm \
        --entrypoint ffprobe \
        --user "$uid_gid" \
        -v "$PWD:/work" \
        -w /work \
        "$image" \
        -v error -show_entries format=duration \
        -of default=noprint_wrappers=1:nokey=1 \
        "$file")

    duration_seconds=${duration%.*}

    if [ -z "$duration_seconds" ] || [ "$duration_seconds" -le 0 ]; then
        printf 'Invalid duration for: %s\n' "$file" >&2
        exit 1
    fi

    total_kbits=$((target_kb * 8))
    video_bitrate_k=$((total_kbits / duration_seconds - audio_bitrate_k))

    if [ "$video_bitrate_k" -lt "$min_video_bitrate_k" ]; then
        video_bitrate_k=$min_video_bitrate_k
    fi

    tmp="$file.tmp-compressed.mp4"

    printf 'Compressing: %s (%s bytes, %ss, video %sk, audio %s)\n' "$file" "$original_size" "$duration_seconds" "$video_bitrate_k" "$audio_bitrate"

    docker run --rm \
        --user "$uid_gid" \
        -v "$PWD:/work" \
        -w /work \
        "$image" \
        -y \
        -i "$file" \
        -vf "scale=w='min($width,iw)':h=-2" \
        -c:v libx264 \
        -preset slow \
        -b:v "${video_bitrate_k}k" \
        -maxrate "${video_bitrate_k}k" \
        -bufsize "$((video_bitrate_k * 2))k" \
        -c:a aac \
        -b:a "$audio_bitrate" \
        -movflags +faststart \
        "$tmp"

    compressed_size=$(stat -c '%s' "$tmp")

    if [ "$compressed_size" -ge "$max_bytes" ]; then
        rm -f "$tmp"
        printf 'Compressed file still over limit: %s (%s bytes)\n' "$file" "$compressed_size" >&2
        exit 1
    fi

    mv "$tmp" "$file"
    printf 'Compressed: %s (%s -> %s bytes)\n' "$file" "$original_size" "$compressed_size"
done
