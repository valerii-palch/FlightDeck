#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

app="$(cd "$(dirname "${1:-FlightDeck.app}")" && pwd)/$(basename "${1:-FlightDeck.app}")"
plist="$app/Contents/Info.plist"
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist")
build=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plist")
minimum=$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$plist")
executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist")
architectures=$(lipo -archs "$app/Contents/MacOS/$executable" | tr ' ' ',')
output="${2:-../releases/FlightDeck-macOS-${version}.pkg}"
codesign --verify --deep --strict "$app"

work=$(mktemp -d "${TMPDIR:-/tmp}/flightdeck-installer.XXXXXX")
trap 'rm -rf "$work"' EXIT
mkdir "$work/root" "$work/resources"
ditto "$app" "$work/root/FlightDeck.app"
pkgbuild --analyze --root "$work/root" "$work/components.plist"
python3 - "$work/components.plist" <<'PLIST'
import plistlib
import sys
from pathlib import Path

path = Path(sys.argv[1])
components = plistlib.loads(path.read_bytes())
for component in components:
    component["BundleIsRelocatable"] = False
path.write_bytes(plistlib.dumps(components))
PLIST
pkgbuild --root "$work/root" --component-plist "$work/components.plist" \
  --identifier local.flightdesk.installer --version "$build" \
  --install-location /Applications "$work/FlightDeck.pkg"

swift -module-cache-path "$work/module-cache" installer/Artwork.swift "$work/resources"
python3 installer/resources.py "$work" "$version" "$build" "$minimum" "$architectures"
signing=()
if [[ -n "${INSTALLER_SIGN_IDENTITY:-}" ]]; then
  signing=(--sign "$INSTALLER_SIGN_IDENTITY")
fi
mkdir -p "$(dirname "$output")"
productbuild --distribution "$work/Distribution.xml" --resources "$work/resources" \
  --package-path "$work" ${signing[@]+"${signing[@]}"} "$output"
