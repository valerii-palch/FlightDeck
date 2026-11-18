import AppKit

let width = 620
let height = 440
let destination = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let bounds = NSRect(x: 0, y: 0, width: width, height: height)

func render(name: String, colors: [NSColor], accent: NSColor) throws {
    let image = NSImage(size: bounds.size, flipped: false) { rect in
        NSGradient(colors: colors)?.draw(in: rect, angle: -36)
        for offset in [0.0, 32.0, 64.0] {
            let route = NSBezierPath()
            route.move(to: NSPoint(x: -26, y: 80 + offset))
            route.curve(
                to: NSPoint(x: 164, y: 342 + offset),
                controlPoint1: NSPoint(x: 70, y: 94 + offset),
                controlPoint2: NSPoint(x: 5, y: 292 + offset)
            )
            accent.withAlphaComponent(0.24).setStroke()
            route.lineWidth = 1.2
            route.stroke()
        }
        if let icon = NSImage(contentsOfFile: "FlightDeck.icns") {
            icon.draw(in: NSRect(x: 39, y: 162, width: 88, height: 88))
        }
        return true
    }
    guard let data = image.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: data),
          let png = bitmap.representation(using: .png, properties: [:]) else {
        throw CocoaError(.fileWriteUnknown)
    }
    try png.write(to: destination.appendingPathComponent(name))
}

try render(name: "light.png", colors: [
    NSColor(srgbRed: 0.79, green: 0.90, blue: 1, alpha: 1),
    NSColor(srgbRed: 0.97, green: 0.98, blue: 1, alpha: 1)
], accent: .systemBlue)
try render(name: "dark.png", colors: [
    NSColor(srgbRed: 0.10, green: 0.19, blue: 0.35, alpha: 1),
    NSColor(srgbRed: 0.06, green: 0.08, blue: 0.14, alpha: 1)
], accent: .systemCyan)
