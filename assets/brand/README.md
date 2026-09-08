# Sidequest — Detour

Final monochrome identity, September 2026. [Editable Paper masters](https://app.paper.design/file/01M1YSHRQGS9BBY8N58CD75HNF/1-0).

## Files

| Asset                               | Formats        | Raster dimensions | Use                                                     |
| ----------------------------------- | -------------- | ----------------- | ------------------------------------------------------- |
| `logo-ink` / `logo-white`           | SVG, PNG, WebP | 1740 × 416        | Horizontal symbol and wordmark; transparent background  |
| `mark-ink` / `mark-white`           | SVG, PNG, WebP | 1024 × 1024       | Standalone symbol; transparent background               |
| `app-icon-ink`                      | SVG, PNG, WebP | 1024 × 1024       | White symbol on black, with 12.5% padding on every edge |
| `favicon-16.png` / `favicon-32.png` | PNG            | 16 × 16 / 32 × 32 | Small browser icon exports                              |
| `sidequest-brand-guide.pdf`         | PDF            | Vector artwork    | Identity reference and usage                            |

The wordmark is outlined Inter at weight 600, optical size 32, and −0.055em tracking. All SVG lettering is paths: no font installation or network request is needed. Ink is `#151515`, white is `#FFFFFF`, and the square icon background is `#000000`. There is no accent-color variant.

Keep the symbol's proportions and open center intact. Use the standalone symbol for favicons and square avatars. Keep at least one stroke width of clear space around standalone marks. The square icon and favicon already include their padding; do not add a second background or crop the padding away.

## App and promotion assets

- `src/assets/logo.svg` and `logo-dark.svg`: production light/dark wordmarks.
- `src/assets/icon.svg`: white-on-black favicon with 12.5% padding, identical in both browser themes.
- `public/favicon.ico`: 16, 32, and 48px PNG frames in one ICO.
- `public/apple-touch-icon.png`: opaque 180px square icon; the operating system applies its own mask.
- `assets/sq-logo.png`: 512px square icon at the existing repository path.
- `assets/readme-banner.png`: 2400 × 640 README banner; its vector source is `assets/brand/readme-banner.svg`.
- `promotion/peerlist/logo.png`: 500px square icon.
- `promotion/alternativeto/logo.png`: 512px square icon.
- `promotion/social-cover.png` and `.webp`: 1200 × 630 cover for general sharing.

The platform screenshot exports contain freshly captured app screens with the Detour header. Peerlist keeps its existing 2880 × 1620 exports; AlternativeTo keeps 1440 × 900. Recreate the source screens with `bun run demo:screenshots`, replace the image fills in the corresponding Paper pages, then export at 2× and 1× respectively. When replacing an image, use a fresh local filename to avoid Paper reusing a cached upload.

For new sizes, export the SVG masters from Paper or rasterize them directly. Keep PNG/WebP transparency for the standalone marks and wordmarks. Use an opaque black background for square icons.
