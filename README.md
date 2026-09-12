# Ladder & Loop — site source

Static site for Cloudflare Pages, no build step. Two-book bundle ("The
First-Year Bundle"), request-a-book form, and a small blog for SEO.

## ⚠️ Currently in test mode

There is no standalone `/about/` page — the "About" nav link points to the
short about-teaser section on the homepage (`/#about`) instead.

Every "Buy" / "Get the bundle" button on the site currently links straight
to `/thank-you/`, skipping Stripe entirely, so you can test the download
experience with your own book files before Stripe is set up. See the
comment at the top of `thank-you/index.html` for exactly what to change
before real launch (swap the buttons back to your Stripe Payment Link, and
let `functions/thank-you/index.js` take over order verification).

To test locally: put your two real book files in `assets/downloads/`,
named exactly `the-engineering-ladder.pdf` and `running-the-room.pdf`
(rename the extension in `thank-you/index.html` if yours aren't PDFs), then
open the site with a local server (e.g. VS Code's Live Server) and click
any "Buy" button.

## Deploy

1. Push this folder to a GitHub repo.
2. Cloudflare dashboard → Pages → Create project → connect the repo.
3. Build settings: **no framework, no build command, output directory `/`**.
4. Add environment variables (Pages → Settings → Environment variables):
   - `STRIPE_SECRET_KEY`
   - `NOTIFY_EMAIL`
   - `EMAIL_API_KEY`
   - `CONVERTKIT_API_KEY`, `CONVERTKIT_FORM_ID` (or swap for your provider)
   - `TURNSTILE_SECRET_KEY` (optional but recommended, for `/api/request-book`)
5. Add bindings:
   - KV namespace → bind as `DOWNLOADS_KV` (used by `functions/thank-you/index.js` to rate-limit link regeneration)
   - R2 bucket → bind as `R2_BUCKET`, containing `first-year-bundle.zip`
     (both books as PDFs, zipped together)
6. Point your domain's DNS to Cloudflare Pages (CNAME), SSL is automatic.

## Things left as placeholders — replace before launch

- All book cover art (currently plain color blocks) and author photo
- Author name/bio (`[Author Name]` / `[Author name]` throughout)
- Real preview page images in `/preview/` sections (currently gray line placeholders)
- `hello@ladderandloop.com` → your real inbox, everywhere it appears
- `ladderandloop.com` → your real domain, in every `<link rel="canonical">`,
  Open Graph tag, JSON-LD block, `robots.txt`, and `sitemap.xml`
- `/privacy/` and `/terms/` — both are drafts; have a lawyer review before
  launch, especially the EU digital-goods withdrawal-right clause in `/terms/`
- `price_REPLACE_WITH_BUNDLE_PRICE_ID` in `functions/thank-you/index.js` →
  your real Stripe Price ID for the bundle Payment Link
- `getSignedR2Url()` in `functions/thank-you/index.js` is a stub — implement
  real R2 signed-URL generation (or proxy the download through a Function)
- Stripe Payment Link's redirect URL should point to
  `https://ladderandloop.com/thank-you/?session_id={CHECKOUT_SESSION_ID}`
- Wire up a webhook-triggered confirmation email (Stripe webhook → email
  with the download link) as a backup to the thank-you page itself — don't
  rely on the page alone to deliver the download

## SEO notes

- Every page has a unique `<title>`, `<meta description>`, and
  `<link rel="canonical">`.
- JSON-LD structured data: `Book` schema on both book pages and embedded on
  the homepage, `Product`/`Offer` schema for the bundle, `BreadcrumbList` on
  book pages, `BlogPosting` on blog posts.
- `/thank-you/` and `/preview/` are excluded from indexing via both
  `robots.txt` and `X-Robots-Tag` headers in `_headers` — they have no SEO
  value and shouldn't compete with real pages.
- `sitemap.xml` lists every indexable page; update it whenever a page is
  added or removed.
- The blog post links back to its related book with real anchor text
  (not just "click here") — keep doing this in future posts, it's the
  main SEO purpose of the blog.

## When you add a second bundle later

1. Move everything currently on `/` into `/collections/first-year-bundle/`.
2. Turn `/` into a short list of bundles instead.
3. Add the new bundle's Stripe Price ID to the `PRODUCTS` map in
   `functions/thank-you/index.js`.
4. Add the new pages to `sitemap.xml`.
5. Add a 301 in `_redirects` for any old bookmarked links if needed.
