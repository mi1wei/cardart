These synthetic images belong to this project and contain no user photographs.
source.svg is the hand-authored reference: 64x48, red/green/blue/yellow quadrants.
HEIC files are generated with node scripts/generate-heic-fixtures.mjs using macOS ImageIO and Swift.
The application and cross-platform tests do not invoke sips, Swift or ImageIO.
rotated.heic carries orientation 6; mirrored.heic carries orientation 2.
metadata.heic and metadata-multi.heic contain fictional camera/date/GPS tags.
The metadata multi-image file has different auxiliary and primary tags.
Use --metadata-only when regenerating only these two metadata fixtures.
