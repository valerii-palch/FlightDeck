from argparse import ArgumentParser
from base64 import b64encode
from pathlib import Path
import json
import os
import plistlib
import re
from worldwide_airports import catalog

root = Path(__file__).resolve().parent
parser = ArgumentParser(description='Build the standalone FlightDeck web interface.')
parser.add_argument('--output', type=Path, default=root / 'FlightDesk.html')
parser.add_argument('--windows', action='store_true')
args = parser.parse_args()
if args.windows:
    package = root.parent / 'FlightDeck-Windows' / 'package.json'
    version = json.loads(package.read_text(encoding='utf-8'))['version']
else:
    with (root / 'Info.plist').open('rb') as plist:
        version = plistlib.load(plist)['CFBundleShortVersionString']
image = 'data:image/png;base64,' + b64encode((root / 'fleet.png').read_bytes()).decode()
style = (root / 'style.css').read_text(encoding='utf-8').replace('__FLEET_IMAGE__', image)
html = (root / 'index.template.html').read_text(encoding='utf-8')
html = html.replace('__VERSION__', version)
html = html.replace('__LOCALIZATION__', (root / 'localization.js').read_text(encoding='utf-8'))
logo = 'data:image/png;base64,' + b64encode((root / 'brand.png').read_bytes()).decode()
html = html.replace('__EXTRA_CSS__', style)
html = html.replace('__NEW_VIEWS__', (root / 'views.js').read_text(encoding='utf-8'))
html = html.replace('__JOURNAL__', (root / 'journal.js').read_text(encoding='utf-8'))
html = html.replace('__EXPERIENCE__', (root / 'experience.js').read_text(encoding='utf-8'))
html = html.replace('__REAL_FLIGHT_DATA__', (root / 'real-flight-data.js').read_text(encoding='utf-8'))
html = html.replace('__ONBOARDING__', (root / 'onboarding.js').read_text(encoding='utf-8').replace('__VERSION__', version))
html = html.replace('__UPDATES__', (root / 'updates.js').read_text(encoding='utf-8'))
html = html.replace('__PLANNING__', (root / 'planning.js').read_text(encoding='utf-8'))
html = html.replace('__GOOGLE_AUTH__', (root / 'google-auth.js').read_text(encoding='utf-8'))
html = html.replace('__CLOUD__', (root / 'cloud.js').read_text(encoding='utf-8'))
html = html.replace('__ACCESS__', (root / 'access.js').read_text(encoding='utf-8'))
html = html.replace('__ROUTE_MAP__', (root / 'route-map.js').read_text(encoding='utf-8'))
reference = (root / 'airport-reference.json').read_text(encoding='utf-8').replace('<', '\\u003c')
html = html.replace('__AIRPORT_DATA_LICENSE__', (root / 'airport-data-license.txt').read_text(encoding='utf-8').replace('--', '—'))
html = html.replace('__WORLDWIDE_AIRPORTS__', json.dumps(catalog(), ensure_ascii=False, separators=(',', ':')).replace('<', r'\u003c'))
html = html.replace('__AIRPORT_REFERENCE__', reference)
html = html.replace('__AIRPORT_PHOTOS__', (root / 'airport-photos.json').read_text(encoding='utf-8').replace('<', r'\u003c'))
map_key = os.environ.get('FLIGHTDECK_YANDEX_MAPS_KEY', '').strip()
if map_key and not re.fullmatch(r'[A-Za-z0-9_-]{20,120}', map_key):
    parser.error('FLIGHTDECK_YANDEX_MAPS_KEY has an invalid format')
html = html.replace('__MAP_CONFIG__', json.dumps({'yandexKey': map_key}))
html = html.replace('__LOGO__', logo)
args.output.write_text(html, encoding='utf-8')
