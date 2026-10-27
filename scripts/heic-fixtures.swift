import Foundation
import ImageIO
import UniformTypeIdentifiers

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let source = CGImageSourceCreateWithURL(input.appendingPathComponent("source.png") as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
let secondarySource = CGImageSourceCreateWithURL(input.appendingPathComponent("secondary.png") as CFURL, nil)!
let secondary = CGImageSourceCreateImageAtIndex(secondarySource, 0, nil)!

for (name, orientation) in [("upright.heic", 1), ("rotated.heic", 6), ("mirrored.heic", 2)] {
    let destination = CGImageDestinationCreateWithURL(output.appendingPathComponent(name) as CFURL, UTType.heic.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, [
        kCGImagePropertyOrientation: orientation,
        kCGImageDestinationLossyCompressionQuality: 1.0,
    ] as CFDictionary)
    precondition(CGImageDestinationFinalize(destination))
}
let multiURL = output.appendingPathComponent("multi.heic")
let multi = CGImageDestinationCreateWithURL(multiURL as CFURL, UTType.heic.identifier as CFString, 2, nil)!
CGImageDestinationAddImage(multi, secondary, [kCGImagePropertyPrimaryImage: false] as CFDictionary)
CGImageDestinationAddImage(multi, image, [kCGImagePropertyPrimaryImage: true] as CFDictionary)
precondition(CGImageDestinationFinalize(multi))
let decoded = CGImageSourceCreateWithURL(multiURL as CFURL, nil)!
print("multi.heic frames: \(CGImageSourceGetCount(decoded)); primary: \(CGImageSourceGetPrimaryImageIndex(decoded))")
