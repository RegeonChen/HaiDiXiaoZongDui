# Application icon

`icon-source.jpg` is the original 1024 × 1024 artwork contributed by the team.
It intentionally remains a JPEG because that is the source file's real format.

Run `npm run generate:icons` after replacing the source artwork. The script:

- crops the excess outer margin so the scroll remains legible at small sizes;
- applies a transparent rounded safe area for desktop launchers;
- writes the 1024 × 1024 electron-builder source to `build/icon.png`;
- writes the 512 × 512 runtime window icon to `src/public/icon.png`;
- writes the 128 × 128 renderer favicon to `src/public/favicon.png`;
- verifies dimensions, PNG encoding and actual transparent/opaque pixels.

ImageMagick is required to regenerate the assets.
