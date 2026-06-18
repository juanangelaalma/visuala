#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
    printf 'Usage: %s <input.mp4|input-dir> [output-dir] [--profiles=360p,480p,720p,1080p]\n' "$0" >&2
    printf 'Example: npm run hls:convert -- public/videos/heroes/car_mountain.mp4\n' >&2
    printf 'Example: npm run hls:convert -- public/videos/categories --profiles=360p,480p,720p\n' >&2
    printf 'Example: npm run hls:convert -- public/videos/heroes/car_mountain.mp4 --profiles=480p,720p,1080p\n' >&2
    exit 1
fi

input=$1
shift
output_dir=""
profiles="480p,720p"

for arg in "$@"; do
    case "$arg" in
        --profiles=*) profiles=${arg#--profiles=} ;;
        --*)
            printf 'Unknown option: %s\n' "$arg" >&2
            exit 1
            ;;
        *)
            if [ -n "$output_dir" ]; then
                printf 'Unexpected argument: %s\n' "$arg" >&2
                exit 1
            fi
            output_dir=$arg
            ;;
    esac
done

if [ ! -f "$input" ] && [ ! -d "$input" ]; then
    printf 'Input file or directory not found: %s\n' "$input" >&2
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    printf 'Docker not found. Install/start Docker first.\n' >&2
    exit 1
fi

IFS=',' read -r -a profile_list <<< "$profiles"

if [ "${#profile_list[@]}" -eq 0 ]; then
    printf 'No profiles specified.\n' >&2
    exit 1
fi

filter_parts=()
map_args=()
stream_map=()
split_labels=""

for index in "${!profile_list[@]}"; do
    profile=${profile_list[$index]}

    case "$profile" in
        360p)
            width=640
            height=360
            crf=24
            maxrate=500k
            bufsize=750k
            audio_bitrate=96k
            ;;
        480p)
            width=854
            height=480
            crf=23
            maxrate=800k
            bufsize=1200k
            audio_bitrate=96k
            ;;
        720p)
            width=1280
            height=720
            crf=22
            maxrate=1600k
            bufsize=2400k
            audio_bitrate=128k
            ;;
        1080p)
            width=1920
            height=1080
            crf=21
            maxrate=3200k
            bufsize=4800k
            audio_bitrate=128k
            ;;
        *)
            printf 'Unsupported profile: %s\n' "$profile" >&2
            printf 'Supported profiles: 360p,480p,720p,1080p\n' >&2
            exit 1
            ;;
    esac

    split_labels="${split_labels}[v$index]"
    filter_parts+=("[v$index]scale=w=$width:h=$height:force_original_aspect_ratio=decrease:force_divisible_by=2[v${index}out]")
    map_args+=(
        -map "[v${index}out]" -map "0:a?"
        -c:v:"$index" libx264 -preset veryfast -crf "$crf" -maxrate:v:"$index" "$maxrate" -bufsize:v:"$index" "$bufsize"
        -c:a:"$index" aac -b:a:"$index" "$audio_bitrate"
    )
    stream_map+=("v:$index,a:$index,name:$profile")
done

filter_complex="[0:v]split=${#profile_list[@]}$split_labels;$(IFS=';'; printf '%s' "${filter_parts[*]}")"
var_stream_map=$(printf '%s ' "${stream_map[@]}")
var_stream_map=${var_stream_map% }

uid_gid="$(id -u):$(id -g)"
image="jrottenberg/ffmpeg:6.1-alpine"

convert_file() {
    local file=$1
    local target_dir=$2

    mkdir -p "$target_dir"

    for profile in "${profile_list[@]}"; do
        mkdir -p "$target_dir/$profile"
    done

    docker run --rm \
        --user "$uid_gid" \
        -v "$PWD:/work" \
        -w /work \
        "$image" \
        -y \
        -i "$file" \
        -filter_complex "$filter_complex" \
        "${map_args[@]}" \
        -f hls \
        -hls_time 4 \
        -hls_playlist_type vod \
        -hls_flags independent_segments \
        -hls_segment_type fmp4 \
        -hls_fmp4_init_filename "init.mp4" \
        -hls_segment_filename "$target_dir/%v/segment_%03d.m4s" \
        -master_pl_name index.m3u8 \
        -var_stream_map "$var_stream_map" \
        "$target_dir/%v/playlist.m3u8"

    printf 'HLS output: %s/index.m3u8\n' "$target_dir"
}

if [ -d "$input" ]; then
    if [ -n "$output_dir" ]; then
        printf 'Output directory is only supported for single-file input.\n' >&2
        exit 1
    fi

    shopt -s nullglob
    input_files=("$input"/*.mp4)
    shopt -u nullglob

    if [ "${#input_files[@]}" -eq 0 ]; then
        printf 'No .mp4 files found in: %s\n' "$input" >&2
        exit 1
    fi

    for file in "${input_files[@]}"; do
        input_name=$(basename "$file" .mp4)
        convert_file "$file" "$input/$input_name"
    done
else
    input_dir=$(dirname "$input")
    input_file=$(basename "$input")
    input_name=${input_file%.*}
    output_dir=${output_dir:-"$input_dir/$input_name"}
    convert_file "$input" "$output_dir"
fi
