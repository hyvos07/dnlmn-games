# Release and search indexing

## What the build prepares

- Each public page has a descriptive title, description and HTTPS canonical URL.
- Homepage and category pages include collection structured data. The homepage
  also provides `WebSite` data for the site name. Games provide `VideoGame` data.
  No ratings or reviews are invented, and rich results are not guaranteed.
- Open Graph and Twitter/X previews point at **static, single-frame PNGs**,
  1200 × 630. `/og/home.png` uses the original portfolio cover; game URLs use
  their own title and real gameplay screenshot. No animated clip is used for
  social metadata. The on-site gameplay card animation remains an enhancement.
- `/sitemap.xml` lists the homepage, About, published games and category pages.
  `/robots.txt` allows crawling and advertises the sitemap. Hidden/draft games
  are excluded from it, and any built hidden games receive `noindex`.
- Unknown URLs keep their HTTP 404 status and include `noindex` with no canonical.
- CI checks types, lint, unit tests, production budgets and desktop/mobile browser
  tests before deploying a push to `main`. Browser tests inspect metadata with
  JavaScript disabled and fetch the actual share images to verify their format.

Metadata is rendered into the initial HTML. Search/social crawlers do not have
to run game JavaScript to discover the title, description, canonical or preview.
Game play itself needs JavaScript, and Typing Fortress needs a physical keyboard.

## Before the first public release

1. Review the working tree and include the intended source changes, especially
   `apps/launcher/src/assets/social-cover.png`. `exports/` is personal artwork
   output and is ignored; production never depends on that directory. Keep
   `PLAN.md`, `PRD.md`, `*.local.md`, secrets and `dist/` out of commits.
2. Use Node from `.nvmrc` and pnpm from `packageManager`, then run:

   ```sh
   pnpm install --frozen-lockfile
   pnpm check
   pnpm test
   pnpm build
   pnpm test:e2e
   ```

   Stop any server on 4321, or set `E2E_PORT=4330` for browser tests. In PowerShell,
   use `$env:E2E_PORT='4330'` and `pnpm.cmd` when script execution is restricted.

3. Run `pnpm preview` and inspect `/`, `/about/`, all five games and an unknown
   URL. Check desktop and a real phone, especially iOS Safari and Android Chrome:
   sound unlock/mute, start/pause/help, orientation, touch input, saved scores,
   game-over transitions and restart protection. Automated Chromium device
   emulation does not replace the Safari/phone check.
4. In GitHub repository **Settings → Secrets and variables → Actions**, configure
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for the intended account.
   Follow Cloudflare's [Workers CI/CD token guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
   when creating a token scoped to deployment and the required domain access.
   Never commit the values.
5. Confirm the `dnlmn.dev` zone belongs to that Cloudflare account. The committed
   `wrangler.jsonc` declares `games.dnlmn.dev` as the Worker's custom domain.
   Review any existing DNS record/service on that exact subdomain before the
   first deployment. Do not overwrite an unrelated service. The root portfolio
   remains a separate site.
6. Merge/push the reviewed release to `main`. The existing `deploy` job runs only
   after CI passes and deploys the tested `dist` artifact. A manual alternative
   is `pnpm exec wrangler deploy` after local checks, with your authenticated
   Cloudflare account. Choose one release route and confirm its deployment log.

Cloudflare's [custom-domain guide](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
describes domain setup and DNS behavior. No deployment, DNS changes, repository
push or Search Console submission are performed merely by preparing this repo.

## After deployment

- Open `https://games.dnlmn.dev/` in a private window. Verify valid HTTPS, no
  authentication/challenge for normal visitors or crawlers, and no console or
  network errors. If HTTP is reachable, ensure Cloudflare redirects it to HTTPS.
- Confirm HTTP 200 for `/`, `/about/`, `/snake/`, `/typing-fortress/`,
  `/tile-rush/`, `/merge-2048/`, `/tetris/`, `/robots.txt`, `/sitemap.xml`,
  `/og/home.png` and each `/og/<slug>.png`.
- Confirm `/snake` redirects to `/snake/`, and a nonexistent URL returns **404**.
- View page source: canonical URLs must use `https://games.dnlmn.dev/`, published
  pages must have no `noindex`, and `og:image`/`twitter:image` must use the HTTPS
  PNG on this domain. Open the image directly before checking a social preview.
- Test a homepage and game URL in the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
  or [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/).
  Existing social messages may retain their original preview; use the
  inspector's refresh/re-scrape action and test a newly shared link. Social
  crawlers cache separately from the browser and Cloudflare.
- Link to `https://games.dnlmn.dev/` from the project entry on `dnlmn.dev` using a
  normal `<a href>` link. Use the static cover for that project card if desired.
  The portfolio's own share metadata belongs to its separate codebase.

## Google Search Console with an existing dnlmn.dev property

Being indexed and verifying a Search Console property are different. Check the
property selector to see which property you already own:

| Existing property | Coverage and next step |
| --- | --- |
| **Domain** `dnlmn.dev` | Already covers `games.dnlmn.dev` and all protocols/subdomains. Keep the DNS verification record. You can submit the games sitemap here. Optionally add the URL-prefix property below for a separate games-only dashboard. |
| **URL-prefix** `https://dnlmn.dev/` (or `https://www.dnlmn.dev/`) | Its reports do not cover the games hostname. Add **URL-prefix** `https://games.dnlmn.dev/`, or verify the parent **Domain** `dnlmn.dev` via DNS. Keep the original property. |

Google documents the distinction in [property types](https://support.google.com/webmasters/answer/34592?hl=en).
When adding a child property with the same verified owner, Search Console may
auto-verify it; see [child-property verification](https://support.google.com/webmasters/answer/9008080?hl=en).
If verification is requested, use Google's provided DNS TXT record. An HTML file
verification alternative goes in `public-root/`, followed by a deploy; use the
exact file supplied by Google. No placeholder verification token is included.

Once the live release is accessible:

1. Open [Search Console](https://search.google.com/search-console/), select the
   covering Domain property or add the exact games URL-prefix property above.
2. Open **Sitemaps** and submit
   `https://games.dnlmn.dev/sitemap.xml`. In the games URL-prefix property the UI
   may already show the hostname; enter only `sitemap.xml` in that case. Confirm
   **Success** after Google fetches it. The existing portfolio sitemap does not
   need to be replaced.
3. Use **URL inspection** on `https://games.dnlmn.dev/`, run **Test live URL**,
   check that indexing is allowed, and choose **Request indexing**. Repeat for
   the five published game URLs if desired; the sitemap discovers all of them.
4. After Google processes the site, review **Page indexing** for crawl failures,
   exclusions and canonical choices, and **Performance → Search results** for
   impressions. In the parent Domain property, filter pages to URLs containing
   `https://games.dnlmn.dev/` to isolate these results.

The existing portfolio stays in place: this is a new subdomain, so no Change of
Address, site move or removal request is needed. Submission helps discovery; it
does not promise indexing, rankings or immediate results. Google says crawling
can take days to weeks; see [requesting a recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
and [sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## Ongoing releases

New published manifests automatically enter the launcher, metadata, structured
game list, generated social images and sitemap. Keep descriptions, screenshots,
credits and controls accurate when changing a game. The sitemap deliberately
omits fabricated `lastmod` dates and meaningless priority/change-frequency hints.
Update the site's overview copy if the launch lineup changes. Keep the Google
verification record/file and periodically review indexing and real-user Web Vitals.
