/**
 * functions/thank-you/index.js
 * Cloudflare Pages Function — handles GET /thank-you/
 *
 * Flow:
 *   1. Stripe redirects here after a successful Payment Link checkout:
 *      https://ladderandloop.com/thank-you/?session_id={CHECKOUT_SESSION_ID}
 *   2. We verify the session with the Stripe API (payment_status === 'paid').
 *   3. We look up which product was purchased (PRODUCTS map below, keyed by
 *      Stripe Price ID) and generate a short-lived signed R2 URL for its file.
 *   4. We render the thank-you page with the real download link.
 *
 * Required environment variables / bindings (set in Cloudflare Pages project settings):
 *   - STRIPE_SECRET_KEY   (Pages > Settings > Environment variables, encrypted)
 *   - DOWNLOADS_KV        (KV namespace binding — tracks which sessions have
 *                          already been used, so a session can't be replayed
 *                          endlessly to mint new links)
 *   - R2_BUCKET           (R2 bucket binding holding the zipped book files)
 *
 * Only one product exists today (the bundle), but PRODUCTS is a map so a
 * second bundle can be added later by adding one more entry — no other
 * logic here needs to change.
 */

const PRODUCTS = {
  // Replace with the real Stripe Price ID for the bundle Payment Link.
  'price_REPLACE_WITH_BUNDLE_PRICE_ID': {
    name: 'The First-Year Bundle',
    // Single zip containing both books as PDFs — see build notes below.
    file: 'first-year-bundle.zip',
  },
};

// How long a generated download link stays valid.
const LINK_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// How many times a single Stripe session is allowed to (re)generate a link.
// Prevents someone from bookmarking the thank-you URL and re-minting fresh
// signed links indefinitely.
const MAX_REGENERATIONS = 5;

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');

  if (!sessionId) {
    return renderNotFound();
  }

  // ---- 1. Verify the session with Stripe ----
  let session;
  try {
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}?expand[]=line_items`,
      { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } }
    );
    if (!stripeRes.ok) throw new Error('stripe lookup failed');
    session = await stripeRes.json();
  } catch (err) {
    return renderNotFound();
  }

  if (session.payment_status !== 'paid') {
    return renderNotFound();
  }

  // ---- 2. Figure out which product was purchased ----
  const priceId = session.line_items?.data?.[0]?.price?.id;
  const product = PRODUCTS[priceId];
  if (!product) {
    return renderNotFound();
  }

  // ---- 3. Rate-limit link (re)generation per session ----
  const kvKey = `dl:${sessionId}`;
  const uses = parseInt((await env.DOWNLOADS_KV.get(kvKey)) || '0', 10);
  if (uses >= MAX_REGENERATIONS) {
    return renderExpired(product, session.customer_details?.email);
  }
  await env.DOWNLOADS_KV.put(kvKey, String(uses + 1), {
    expirationTtl: LINK_TTL_SECONDS,
  });

  // ---- 4. Generate a signed R2 URL for the file ----
  const downloadUrl = await getSignedR2Url(env, product.file, LINK_TTL_SECONDS);

  return new Response(renderThankYou(product, downloadUrl, session.customer_details?.email), {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

/**
 * Generates a time-limited signed URL for an object in the R2 bucket.
 * Implementation depends on how you've set up R2 access — this is typically
 * done either via the S3-compatible API with AWS SigV4 signing, or by
 * proxying the download through this same Worker/Function with its own
 * short-lived token embedded in the URL. Fill in with your chosen approach.
 */
async function getSignedR2Url(env, key, ttlSeconds) {
  // Placeholder — replace with real signing logic.
  // Example if proxying through this Function instead of pre-signing R2 directly:
  //   return `/api/download?key=${encodeURIComponent(key)}&session=...&exp=...`;
  throw new Error('getSignedR2Url not implemented — see comment above');
}

function renderThankYou(product, downloadUrl, email) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Thank You — Your Download Is Ready | Ladder &amp; Loop</title>
<meta name="robots" content="noindex, nofollow">
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
  <div class="wrap nav">
    <a href="/" class="wordmark">Ladder <span>&amp;</span> Loop</a>
  </div>
  <div class="wrap ty-box">
    <h1>Thanks — your download is ready</h1>
    <p>${product.name} — PDF, zipped together.</p>
    <div class="ty-downloads">
      <a href="${downloadUrl}" class="btn">Download ${product.name}</a>
    </div>
    <p class="ty-note">This link stays active for 24 hours. A confirmation email${email ? ` was also sent to ${email}` : ''} with the same link, as a backup.</p>
    <p class="ty-note">Trouble downloading? Email hello@ladderandloop.com with your receipt.</p>
  </div>
</body>
</html>`;
}

function renderExpired(product, email) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Link limit reached</title>
     <link rel="stylesheet" href="/assets/css/style.css"></head><body>
     <div class="wrap ty-box">
       <h1>You've reached the download link limit for this order</h1>
       <p>Email hello@ladderandloop.com with your receipt${email ? ` (${email})` : ''} and we'll resend it directly.</p>
     </div></body></html>`,
    { headers: { 'Content-Type': 'text/html;charset=UTF-8', 'X-Robots-Tag': 'noindex' } }
  );
}

function renderNotFound() {
  // Note: this Function intercepts every request to /thank-you/, so the
  // static thank-you/index.html file in the repo is never actually served
  // in production — it only exists as a readable fallback/reference and as
  // a safety net if this Function is ever removed. Redirect home instead of
  // back to /thank-you/ to avoid a redirect loop.
  return Response.redirect('https://ladderandloop.com/', 302);
}
