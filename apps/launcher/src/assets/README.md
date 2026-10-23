# Social cover

`social-cover.png` is the original static poster for the homepage share preview.
It was drawn in HTML, CSS and inline SVG, using the launcher's charcoal, cream
and lime palette. The game motifs are original; the pixel creature uses this
project's Pixel Rush silhouette. The lettering uses Bricolage Grotesque and
Instrument Sans, both [SIL OFL 1.1](https://openfontlicense.org/).

The editable portfolio artwork and renderer are in the owner's local
`exports/games-dnlmn/` folder. The committed PNG is sufficient for clean CI builds;
no local export files, browser capture, remote assets or AI image generation are
needed to build the site.

`scripts/gen-images.ts` contains the whole poster in a 1200 × 630 PNG at
`/og/home.png`. Replace this source PNG to update the cover, then build again.
The build cache includes this source. The generated `public/og/` files remain
gitignored. Social previews always use a still PNG, independently of animated
gameplay previews on launcher cards.
