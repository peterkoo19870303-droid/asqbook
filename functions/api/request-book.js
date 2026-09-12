/**
 * functions/api/request-book.js
 * Cloudflare Pages Function — handles POST /api/request-book
 *
 * Receives the homepage "request a book" form (email, requested title/topic,
 * optional note) and forwards it as an email to the site owner. No database
 * is used — this is intentionally the simplest possible version. If you
 * later want to track which titles get requested most often, swap the
 * "forward by email" step for a write to a KV namespace or D1 table as well.
 *
 * Required environment variables (Pages > Settings > Environment variables):
 *   - NOTIFY_EMAIL         where requests should be sent, e.g. hello@ladderandloop.com
 *   - EMAIL_API_KEY        API key for whichever transactional email
 *                          provider you use (Resend, SendGrid, Postmark, ...)
 *
 * Recommended: put Cloudflare Turnstile on the form and verify the token
 * here before sending, to keep bots from spamming this endpoint. See
 * TURNSTILE_SECRET_KEY note below — currently a no-op if not configured.
 */

export async function onRequestPost({ request, env }) {
  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return jsonError('Could not read form data', 400);
  }

  const email = (form.get('email') || '').toString().trim();
  const bookRequest = (form.get('request') || '').toString().trim();
  const note = (form.get('note') || '').toString().trim();
  const turnstileToken = (form.get('cf-turnstile-response') || '').toString();

  if (!email || !isValidEmail(email)) {
    return jsonError('A valid email is required', 400);
  }
  if (!bookRequest) {
    return jsonError('Please describe what you are looking for', 400);
  }

  // ---- Optional: verify Cloudflare Turnstile ----
  if (env.TURNSTILE_SECRET_KEY) {
    const ok = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, request);
    if (!ok) return jsonError('Verification failed, please try again', 400);
  }

  // ---- Forward the request by email ----
  try {
    await sendEmail(env, {
      to: env.NOTIFY_EMAIL,
      subject: `Book request: ${bookRequest.slice(0, 60)}`,
      text: `New book request from the site.\n\nFrom: ${email}\nRequest: ${bookRequest}\nNote: ${note || '(none)'}\n`,
    });
  } catch (err) {
    return jsonError('Could not send request right now', 502);
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

async function verifyTurnstile(token, secret, request) {
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret,
      response: token,
      remoteip: request.headers.get('CF-Connecting-IP') || '',
    }),
  });
  const data = await res.json();
  return !!data.success;
}

/**
 * Swap in your provider's API here. Example shown for Resend
 * (https://resend.com) — replace with SendGrid/Postmark/etc if preferred.
 */
async function sendEmail(env, { to, subject, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Ladder & Loop <no-reply@ladderandloop.com>',
      to,
      subject,
      text,
    }),
  });
  if (!res.ok) throw new Error(`email send failed: ${res.status}`);
}
