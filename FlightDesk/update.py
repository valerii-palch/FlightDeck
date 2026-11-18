from pathlib import Path
import json

# Snapshot of ICAO/IATA pairs, keyed by the simulator's original ICAO code.
iata = dict(pair.split(':') for pair in """
UEEE:YKS UHBB:BQS UMMS:MSQ UHMA:DYR ZBAD:PKX UHMM:GDX ZGGG:CAN UHPP:PKC UHSS:UUS
ZSPD:PVG MUVR:VRA UIAA:HTA MUHA:HAV HECA:CAI UIUU:UUD HEGN:HRG ULAA:ARH VHHH:HKG
ULMK:KVK VIDP:DEL VOGA:GOX WADD:DPS UNAA:ABA UATE:SCO UNBB:BAX UAAA:ALA UNBG:RGK UACC:NQZ
UCFM:BSZ VRMM:MLE FSIA:SEZ VCBI:CMB UNTT:TOF VTSP:HKT URKA:AAQ VTBU:UTP URKG:GDZ LTAC:ESB
URKK:KRR LTAI:AYT URMG:GRV LTBS:DLM URML:MCX LTDB:COV URMT:STW OMAA:AUH URWA:ASF
OMDW:DWC URWI:ESL UZSB:BHK URWW:VOG UZSS:SKD USCM:MQF UZNU:UGC USHH:HMA VVTS:SGN USII:IJK
VVCR:CXR USKK:KVX USMU:NUX USNN:NJC UUBC:KLF UUYY:SCW UWGG:GOJ UWKD:KZN UWKE:NBC
UWKS:CSY UWLL:ULV UWOO:REN UWOR:OSW UWPP:PEZ UWPS:SKX UWSG:GSV UWUU:UFA
""".split())
path = Path('seed.json')
data = json.loads(path.read_text())
for airport in data['airports']:
    if not airport['iata']:
        airport['iata'] = iata[airport['icao']]
path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
