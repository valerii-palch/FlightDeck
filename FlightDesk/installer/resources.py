import sys
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

work = Path(sys.argv[1])
version, build, minimum, architectures = sys.argv[2:]
resources = work / "resources"


def rtf_text(text):
    return "".join(
        "\\" + char if char in "\\{}" else char if char.isascii() else rf"\u{ord(char)}?"
        for char in text
    )


def write_page(filename, heading, description, detail):
    content = (
        r"{\rtf1\ansi\uc1\deff0{\fonttbl{\f0\fswiss Helvetica Neue;}}"
        r"\pard\sa220\fs56\b " + rtf_text(heading) + r"\b0\par "
        r"\fs28 " + rtf_text(description) + r"\par "
        r"\fs22 " + rtf_text(detail) + "}"
    )
    filename.write_text(content, encoding="ascii")


for locale, pages in {
    "en": [
        ("Welcome.rtf", "FlightDeck", "Flight planning and tracking",
         f"Version {version}. FlightDeck will be installed in Applications."),
        ("Conclusion.rtf", "FlightDeck is installed", "Open FlightDeck in Applications.",
         "To access the cloud logbook, sign in on the Profile tab."),
    ],
    "ru": [
        ("Welcome.rtf", "FlightDeck", "Планирование и ведение рейсов",
         f"Версия {version}. FlightDeck будет установлен в папку «Программы»."),
        ("Conclusion.rtf", "FlightDeck установлен", "Открой FlightDeck в папке «Программы».",
         "Для доступа к облачному журналу войди в свой аккаунт на вкладке «Профиль»."),
    ],
}.items():
    localized = resources / f"{locale}.lproj"
    localized.mkdir()
    for filename, heading, description, detail in pages:
        write_page(localized / filename, heading, description, detail)
(work / "Distribution.xml").write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<installer-gui-script minSpecVersion="2">
  <title>FlightDeck {escape(version)}</title>
  <background file="light.png" mime-type="image/png" alignment="center" scaling="tofit"/>
  <background-darkAqua file="dark.png" mime-type="image/png" alignment="center" scaling="tofit"/>
  <welcome file="Welcome.rtf" mime-type="text/rtf"/>
  <conclusion file="Conclusion.rtf" mime-type="text/rtf"/>
  <options customize="never" hostArchitectures={quoteattr(architectures)}/>
  <domains enable_anywhere="false" enable_currentUserHome="false" enable_localSystem="true"/>
  <volume-check><allowed-os-versions><os-version min={quoteattr(minimum)}/></allowed-os-versions></volume-check>
  <choices-outline><line choice="flightdeck"/></choices-outline>
  <choice id="flightdeck" visible="false"><pkg-ref id="local.flightdesk.installer"/></choice>
  <pkg-ref id="local.flightdesk.installer" version={quoteattr(build)}>FlightDeck.pkg</pkg-ref>
</installer-gui-script>
""", encoding="utf-8")
