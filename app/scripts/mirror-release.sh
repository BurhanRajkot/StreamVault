#!/usr/bin/env bash
# Mirror an app release to Supabase Storage, where downloads are fast on ISPs
# that crawl on GitHub's release CDN (measured 12–36 KB/s vs ~9 MB/s).
#
#   app/scripts/mirror-release.sh <dir with the release files> <version>
#
# Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Writes to the public
# bucket "app-releases":
#   android/StreamVault-<v>.apk     every version (the newest 5 are kept)
#   StreamVault.apk                 the newest APK (README link)
#   linux/StreamVault.AppImage.part1..4
#                                   the newest AppImage in 4 equal parts — the
#                                   free plan refuses files over 50 MiB; curl
#                                   joins them: curl -L "<base>/linux/StreamVault.AppImage.part[1-4]" > StreamVault.AppImage
#   windows/StreamVault-Setup.exe.part1..n
#                                   the newest Windows installer, in parts under
#                                   45 MiB (the app joins them to update itself)
#   latest.json                     what the apps' update check reads
set -euo pipefail

dir=$1
version=$2
bucket=app-releases
api="$SUPABASE_URL/storage/v1/object"
public="$api/public/$bucket"
auth=(-H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY")
put() { # <file> <object path> <content type> <max-age seconds>
  curl -sSf --retry 3 --retry-all-errors "${auth[@]}" \
    -H "Content-Type: $3" -H "Cache-Control: max-age=$4" -H "x-upsert: true" \
    --data-binary "@$1" -X POST "$api/$bucket/$2" > /dev/null
  echo "uploaded $2 ($(stat -c%s "$1") bytes)"
}

put_parts() { # <file> <object path, ".part<i>" is added> <number of parts>; prints the parts' URLs as a JSON list
  local work urls=() i
  work=$(mktemp -d)
  split -n "$3" --numeric-suffixes=1 --suffix-length=1 "$1" "$work/part"
  for i in $(seq 1 "$3"); do
    put "$work/part$i" "$2.part$i" application/octet-stream 300 >&2
    # The version in the query keeps a CDN from mixing parts of two releases
    urls+=("\"$public/$2.part$i?v=$version\"")
  done
  rm -rf "$work"
  (IFS=,; echo "[${urls[*]}]")
}

apk="$dir/StreamVault-$version.apk"
appimage="$dir/StreamVault-$version.AppImage"
installer="$dir/StreamVault-Setup-$version.exe"

put "$apk" "android/StreamVault-$version.apk" application/vnd.android.package-archive 31536000
put "$apk" "StreamVault.apk" application/vnd.android.package-archive 300

# Always 4: the README's one-line Linux install asks for part[1-4]
appimage_parts=$(put_parts "$appimage" linux/StreamVault.AppImage 4)
installer_parts=$(put_parts "$installer" windows/StreamVault-Setup.exe $(( ($(stat -c%s "$installer") + 45 * 1048576 - 1) / (45 * 1048576) )))
cat > "$dir/latest.json" <<JSON
{
  "version": "$version",
  "publishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "page": "https://github.com/BurhanRajkot/StreamVault/releases/tag/app-v$version",
  "android": {
    "url": "$public/android/StreamVault-$version.apk",
    "size": $(stat -c%s "$apk"),
    "sha256": "$(sha256sum "$apk" | cut -d' ' -f1)"
  },
  "linux": {
    "appimage": {
      "parts": $appimage_parts,
      "size": $(stat -c%s "$appimage"),
      "sha256": "$(sha256sum "$appimage" | cut -d' ' -f1)"
    }
  },
  "windows": {
    "installer": {
      "parts": $installer_parts,
      "size": $(stat -c%s "$installer"),
      "sha256": "$(sha256sum "$installer" | cut -d' ' -f1)"
    }
  }
}
JSON
put "$dir/latest.json" latest.json application/json 60

# Keep the newest 5 versioned APKs
old=$(curl -sSf "${auth[@]}" -H "Content-Type: application/json" -X POST "$api/list/$bucket" \
  -d '{"prefix":"android/","limit":1000,"sortBy":{"column":"created_at","order":"desc"}}' |
  python3 -c 'import json,sys; print(json.dumps(["android/"+o["name"] for o in json.load(sys.stdin)][5:]))')
if [ "$old" != "[]" ]; then
  curl -sSf "${auth[@]}" -H "Content-Type: application/json" -X DELETE "$api/$bucket" -d "{\"prefixes\":$old}" > /dev/null
  echo "pruned $old"
fi
