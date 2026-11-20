"""Build the offline reference from pinned public airport and time-zone sources."""
import csv
import io
import json
import os
import re
from pathlib import Path
from urllib.request import urlopen

OURAIRPORTS = 'c82dbcb02e5143ceaea49e5d657dc3f8efde5f9b'
TIMEZONES = 'a89e4e0dda9d9878337e2da190ebe1ef1d6af705'
CACHE = Path(__file__).with_name('airport-worldwide.json')
ICAO = re.compile('[A-Z]{4}')
MILITARY = re.compile(r'\b(air (force )?base|naval air|military air|a[ .]?f[ .]?b)\b', re.I)


def source(name, url):
    if name in os.environ:
        return Path(os.environ[name]).read_bytes()
    with urlopen(url, timeout=40) as response:
        return response.read(30_000_000)


def catalog():
    if CACHE.exists():
        cached = json.loads(CACHE.read_text(encoding='utf-8'))
        if cached.get('sources') == [OURAIRPORTS, TIMEZONES, 2]:
            return cached['airports']
    rows = source('FLIGHTDECK_AIRPORT_CSV',
                  f'https://raw.githubusercontent.com/davidmegginson/ourairports-data/{OURAIRPORTS}/airports.csv')
    zones = json.loads(source('FLIGHTDECK_AIRPORT_ZONES',
                               f'https://raw.githubusercontent.com/mwgg/Airports/{TIMEZONES}/airports.json'))
    airports = {}
    for row in csv.DictReader(io.StringIO(rows.decode('utf-8-sig'))):
        if row['type'] not in ('small_airport', 'medium_airport', 'large_airport'):
            continue
        code = row['icao_code'] or row['ident']
        if not ICAO.fullmatch(code):
            continue
        if row['scheduled_service'] != 'yes' and not row['iata_code'] and MILITARY.search(row['name']):
            continue
        name, city = row['name'], row['municipality'] or row['name']
        lat, lon = float(row['latitude_deg']), float(row['longitude_deg'])
        info = dict(nameEn=name, cityEn=city, lat=round(lat, 5), lon=round(lon, 5),
                    countryCode=row['iso_country'], iata=row['iata_code'] if re.fullmatch('[A-Z]{3}',row['iata_code']) else '')
        zone = zones.get(code)
        if zone and zone.get('tz') and abs(zone['lat'] - lat) < .25 and abs(zone['lon'] - lon) < .25:
            info['timezone'] = zone['tz']
        wiki = re.fullmatch(r'https?://([a-z-]+)\.wikipedia\.org/wiki/(.+)', row['wikipedia_link'])
        if wiki:
            info['wiki'] = list(wiki.groups())
        airports[code] = info
    if len(airports) < 2000 or airports.get('KJFK', {}).get('timezone') != 'America/New_York':
        raise ValueError('Airport catalog is incomplete')
    CACHE.write_text(json.dumps(dict(sources=[OURAIRPORTS, TIMEZONES, 2], airports=airports),
                                ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    return airports
