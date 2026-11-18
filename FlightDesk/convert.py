"""Convert the route workbook into the initial application data."""
import datetime as dt
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

ns = {'x': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
workbook = zipfile.ZipFile(sys.argv[1])
strings = [''.join(node.itertext()) for node in ET.fromstring(workbook.read('xl/sharedStrings.xml')).findall('x:si', ns)]

def sheet(number):
    root = ET.fromstring(workbook.read(f'xl/worksheets/sheet{number}.xml'))
    for row in root.findall('x:sheetData/x:row', ns):
        cells = {}
        for cell in row.findall('x:c', ns):
            value = cell.find('x:v', ns)
            if value is not None and value.text is not None:
                column = re.sub(r'\d', '', cell.attrib['r'])
                cells[column] = strings[int(value.text)] if cell.get('t') == 's' else float(value.text)
        yield int(row.attrib['r']), cells

iata = dict(UUEE='SVO', URSS='AER', VTBS='BKK', UHHH='KHV', UIII='IKT', UHWW='VVO',
            ULLI='LED', UWWW='KUF', USSS='SVX', USPP='PEE', UBBB='GYD', UDYZ='EVN',
            UNKL='KJA', UNNT='OVB', USRR='SGC', UNEE='KEJ', UNOO='OMS', ULMM='MMK',
            USTR='TJM', UZTT='TAS', ZJSY='SYX', HESH='SSH', UMKK='KGD', URMM='MRV',
            USCC='CEK', UNWW='NOZ', UUDD='DME', UUWW='VKO', LTFM='IST', OMDB='DXB')
airports = {}
for row, cells in sheet(1):
    if row == 1:
        continue
    for code, name, download, gsx, script, country in [('A','B','C','D','E',None), ('G','H','I','J','K','L')]:
        if cells.get(code):
            icao = cells[code].strip()
            airports[icao] = dict(icao=icao, iata=iata.get(icao,''), name=cells[name],
                                  country=cells.get(country,'Россия'), scenery=bool(cells.get(download)),
                                  gsx=bool(cells.get(gsx)), python=bool(cells.get(script)), stands={})
for row, cells in sheet(2):
    if row == 1:
        continue
    for code, narrow, wide in [('A','C','D'),('F','H','I')]:
        airport = airports.get(cells.get(code,'').strip())
        if airport:
            airport['stands'] = {'narrow':cells.get(narrow,''), 'wide':cells.get(wide,'')}

def clock(value):
    minutes = round(value * 1440) % 1440
    return f'{minutes // 60:02}:{minutes % 60:02}'

flights = []
for sheet_num, tail in [(3,'RA-73709'),(4,'RA-73155')]:
    date = ''
    for row, cells in sheet(sheet_num):
        if row == 1:
            continue
        if isinstance(cells.get('A'), float):
            date = (dt.date(1899,12,30) + dt.timedelta(days=cells['A'])).isoformat()
        if not all(key in cells for key in 'BCEF'):
            continue
        diversion = cells.get('K') == 'DIVERTED'
        flights.append(dict(id=f'{sheet_num}-{row}', tail=tail, number=cells.get('A',''), date=date,
                            dep=cells['B'].strip(), arr=cells['E'].strip(), std=clock(cells['C']), sta=clock(cells['F']),
                            atd=clock(cells['D']) if 'D' in cells else '',
                            ata=clock(cells['G']) if 'G' in cells else '',
                            actualMinutes=round(cells['I']*1440) if cells.get('I') else None,
                            pax=int(cells['J']) if 'J' in cells else None,
                            status='Уход на запасной' if diversion else 'Выполнен' if 'G' in cells else 'Запланирован',
                            note='Запасной аэропорт ULLI указан в журнале' if diversion else '',
                            depStand='', arrStand='', stages={}))
assert len(airports) == 104 and len(flights) == 55
print(json.dumps(dict(airports=list(airports.values()),flights=flights),ensure_ascii=False).replace('<','\\u003c'))
