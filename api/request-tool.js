// Vercel serverless function — emails a "request a tool" message via Resend.
// Reuses the same env vars as api/send.js:
//   RESEND_API_KEY  — your Resend API key
//   FROM_EMAIL      — a verified Resend sender
//   REQUEST_EMAIL   — where requests go (optional; falls back to CLINIC_EMAIL)
//   CLINIC_EMAIL    — fallback recipient

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    let body = req.body;
    if (!body || typeof body === "string") {
      const raw = typeof body === "string" ? body : await new Promise((resolve) => {
        let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d));
      });
      body = raw ? JSON.parse(raw) : {};
    }

    const { message, from, when } = body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Missing message" });
    }

    const key = process.env.RESEND_API_KEY;
    const to = process.env.REQUEST_EMAIL || process.env.CLINIC_EMAIL;
    const fromAddr = process.env.FROM_EMAIL;
    if (!key || !to || !fromAddr) {
      return res.status(500).json({ error: "Server email not configured" });
    }

    const html =
      "<h2 style='font-family:sans-serif'>New suggestion / idea</h2>" +
      "<p style='font-family:sans-serif;font-size:14px;white-space:pre-wrap'>" + escapeHtml(message) + "</p>" +
      (from ? "<p style='font-family:sans-serif;font-size:13px;color:#555'><b>From:</b> " + escapeHtml(from) + "</p>" : "") +
      (when ? "<p style='font-family:sans-serif;font-size:12px;color:#999'>" + escapeHtml(when) + "</p>" : "");

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddr,
        to: [to],
        subject: "Suggestion / idea — AI in Practice",
        html: html
      })
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(502).json({ error: "Email provider error", detail });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e && e.message || e) });
  }
};

function escapeHtml(x) {
  return String(x || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
