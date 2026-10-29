import Foundation
import ImageIO
import UniformTypeIdentifiers

let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let source = CGImageSourceCreateWithURL(input.appendingPathComponent("source.png") as CFURL, nil)!
let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
let secondarySource = CGImageSourceCreateWithURL(input.appendingPathComponent("secondary.png") as CFURL, nil)!
let secondary = CGImageSourceCreateImageAtIndex(secondarySource, 0, nil)!

if !CommandLine.arguments.contains("--metadata-only") {
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
}

func metadata(_ primary: Bool) -> CFDictionary {
    return [
        kCGImagePropertyPrimaryImage: primary,
        kCGImagePropertyOrientation: 6,
        kCGImagePropertyTIFFDictionary: [
            kCGImagePropertyTIFFMake: primary ? "Folio Primary" : "Folio Auxiliary",
            kCGImagePropertyTIFFModel: "Synthetic HEIC",
        ],
        kCGImagePropertyExifDictionary: [
            kCGImagePropertyExifDateTimeOriginal: primary ? "2026:08:15 09:30:00" : "2025:01:02 03:04:05",
            kCGImagePropertyExifOffsetTimeOriginal: "+09:00",
            kCGImagePropertyExifSubsecTimeOriginal: "125",
        ],
        kCGImagePropertyGPSDictionary: [
            kCGImagePropertyGPSLatitude: 0.0, kCGImagePropertyGPSLatitudeRef: "N",
            kCGImagePropertyGPSLongitude: 0.0, kCGImagePropertyGPSLongitudeRef: "E",
        ],
    ] as CFDictionary
}
for (name, count) in [("metadata.heic", 1), ("metadata-multi.heic", 2)] {
    let destination = CGImageDestinationCreateWithURL(output.appendingPathComponent(name) as CFURL, UTType.heic.identifier as CFString, count, nil)!
    if count == 2 { CGImageDestinationAddImage(destination, secondary, metadata(false)) }
    CGImageDestinationAddImage(destination, image, metadata(true))
    precondition(CGImageDestinationFinalize(destination))
}
