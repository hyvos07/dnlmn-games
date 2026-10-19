# Favicons

The launcher and each game have their own drawn SVG identity. Use original vector paths and shapes that represent the page: no emoji glyphs, screenshots, or borrowed launcher icons for published games.

## Sources and routing

| Page | Source | Design |
| --- | --- | --- |
| Launcher, About, tag pages, and 404 | `public-root/favicon.svg` | Lime arcade controller with coral buttons |
| Snake | `games/snake/public/favicon.svg` | Lime serpent and coral apple |
| Typing Fortress | `games/typing-fortress/public/favicon.svg` | Gold battlements with a teal rune |
| Pixel Rush | `games/tile-rush/public/favicon.svg` | Lime pixel creature and four lanes |

The launcher layout imports the root SVG as a URL with `?url&no-inline`. Astro/Vite serves it in development and emits a cacheable asset for production. Assembly also copies the original to `/favicon.svg` as the conventional root fallback. Edit the source, never either build output.

Every game owns `public/favicon.svg`. Its `index.html` declares:

```html
<link rel="icon" href="./favicon.svg" type="image/svg+xml" />
```

Use this relative HTML asset URL so Vite applies the base from `defineGameConfig` exactly once in standalone development, the combined Astro server, and production. The deployed game uses `/<slug>/favicon.svg`. Do not prepend the slug or `%BASE_URL%` to this HTML link, and do not point it at the root launcher favicon or another game's icon. JavaScript assets still use imports or `import.meta.env.BASE_URL`. No manifest field or runtime script is needed.

## Adding or changing an icon

1. Draw an original emblem tied to the game's main mechanic or setting. The vanilla/KAPLAY scaffold's diamond-and-plus SVG is only a draft placeholder; replace it before publishing.
2. Use `viewBox="0 0 64 64"`, a generous safe inset, broad silhouettes, and few details. Review at 16, 32, and 64 pixels; details that disappear at tab size do not belong in the icon.
3. Include an SVG `<title>`. Use paths/shapes with explicit colors; avoid text, emoji, external fonts/images, scripts, animation, and external references. Keep the file small (aim below 2 KB).
4. Match the page's palette: the launcher uses the site's accent colors; games can use their established art palette. Static SVG colors are explicit, so update them deliberately if the corresponding palette changes.
5. Record original authorship or any permitted third-party asset source/license in the game's `CREDITS.md`. Original drawings are preferred.
6. Run the repo checks and production build. Open the launcher and every affected game using `pnpm preview`; confirm each favicon URL loads successfully with the intended SVG. Check both desktop and mobile viewport layouts. Browser favicon caches can retain an older icon; use a fresh browser context when verifying a replacement.

Launcher pages share one identity; distinct site-section favicons are unnecessary. New games must have their own identity even if their gameplay engine matches an existing game.
