/**
 * functions/api/preview-signup.js
 * Cloudflare Pages Function — handles POST /api/preview-signup
 *
 * Adds the submitted email to your mailing list provider (ConvertKit /
 * Buttondown / etc) tagged as "sample chapter requested", and relies on
 * that provider's automation to actually email the sample chapter PDF.
 * This keeps the Function itself simple: it does not send the PDF directly.
 *
 * Required environment variables:
 *   - CONVERTKIT_API_KEY   (or swap this whole function for your provider's API)
 *   - CONVERTKIT_FORM_ID   the form/sequence that triggers the sample-chapter email
 */

export async function onRequestPost({ request, env }) {
  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return jsonError('Could not read form data', 400);
  }

  const email = (form.get('email') || '').toString().trim();
  if (!email || !isValidEmail(email)) {
    return jsonError('A valid email is required', 400);
  }

  try {
    const res = await fetch(
      `https://api.convertkit.com/v3/forms/${env.CONVERTKIT_FORM_ID}/subscribe`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: env.CONVERTKIT_API_KEY,
          email,
        }),
      }
    );
    if (!res.ok) throw new Error(`convertkit error: ${res.status}`);
  } catch (err) {
    return jsonError('Could not sign you up right now', 502);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
