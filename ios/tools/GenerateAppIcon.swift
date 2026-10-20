import AppKit
import Foundation

let size = 1024
let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()

NSColor(red: 0.91, green: 0.95, blue: 0.90, alpha: 1).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: size, height: size)).fill()

let green = NSColor(red: 0.224, green: 0.463, blue: 0.353, alpha: 1)
green.setFill()
NSBezierPath(roundedRect: NSRect(x: 300, y: 290, width: 385, height: 375), xRadius: 70, yRadius: 70).fill()

let handle = NSBezierPath(ovalIn: NSRect(x: 635, y: 390, width: 180, height: 160))
green.setStroke()
handle.lineWidth = 46
handle.stroke()

NSColor.white.setFill()
NSBezierPath(ovalIn: NSRect(x: 300, y: 570, width: 385, height: 105)).fill()

let straw = NSBezierPath()
straw.move(to: NSPoint(x: 565, y: 630))
straw.line(to: NSPoint(x: 690, y: 810))
straw.line(to: NSPoint(x: 820, y: 810))
straw.lineWidth = 42
straw.lineCapStyle = .round
straw.lineJoinStyle = .round
straw.stroke()

NSColor(red: 0.80, green: 0.43, blue: 0.38, alpha: 1).setFill()
for x in [330, 425, 520] {
    NSBezierPath(ovalIn: NSRect(x: CGFloat(x), y: 770, width: 42, height: 42)).fill()
}

image.unlockFocus()
guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Could not create icon")
}
try png.write(to: URL(fileURLWithPath: "ios/DrinkWhatApp/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"))
