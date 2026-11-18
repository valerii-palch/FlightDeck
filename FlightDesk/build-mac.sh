#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
app="${1:-FlightDeck.app}"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp Info.plist "$app/Contents/Info.plist"
cp FlightDesk.html FlightDeck.icns "$app/Contents/Resources/"
sources=(Main.swift AppUpdater.swift ../shared/GoogleOAuth.swift)
if [[ "${UNIVERSAL_BUILD:-0}" == "1" ]]; then
  for architecture in arm64 x86_64; do
    swiftc -module-cache-path "$PWD/.module-cache" -target "$architecture-apple-macos13.0" "${sources[@]}" -o "$app/Contents/MacOS/FlightDesk-$architecture"
  done
  lipo -create "$app/Contents/MacOS/FlightDesk-arm64" "$app/Contents/MacOS/FlightDesk-x86_64" -output "$app/Contents/MacOS/FlightDesk"
  rm "$app/Contents/MacOS/FlightDesk-arm64" "$app/Contents/MacOS/FlightDesk-x86_64"
else
  MACOSX_DEPLOYMENT_TARGET=13.0 swiftc -module-cache-path "$PWD/.module-cache" "${sources[@]}" -o "$app/Contents/MacOS/FlightDesk"
fi
codesign --force --sign - "$app"
