// Vercel serverless function — emails the signed consent PDF to the clinic via Resend.
// Requires environment variables (set in Vercel project settings, never in code):
//   RESEND_API_KEY  — your Resend API key
//   CLINIC_EMAIL    — where signed PDFs are sent (e.g. front-desk@yourclinic.com)
//   FROM_EMAIL      — a verified Resend sender (e.g. consent@yourdomain.com, or onboarding@resend.dev for testing)

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    // body may arrive already-parsed (Vercel) or as a raw stream
    let body = req.body;
    if (!body || typeof body === "string") {
      const raw = typeof body === "string" ? body : await new Promise((resolve) => {
        let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d));
      });
      body = raw ? JSON.parse(raw) : {};
    }

    const { pdf, filename, patientName, phone, procedure, language, questions, when } = body;
    if (!pdf || !patientName || !procedure) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const key = process.env.RESEND_API_KEY;
    const to = process.env.CLINIC_EMAIL;
    const from = process.env.FROM_EMAIL;
    if (!key || !to || !from) {
      return res.status(500).json({ error: "Server email not configured" });
    }

    const html =
      "<h2 style='font-family:sans-serif'>Signed consent received</h2>" +
      "<table style='font-family:sans-serif;font-size:14px'>" +
      "<tr><td><b>Patient</b></td><td>" + escapeHtml(patientName) + "</td></tr>" +
      (phone ? "<tr><td><b>Phone</b></td><td>" + escapeHtml(phone) + "</td></tr>" : "") +
      "<tr><td><b>Procedure</b></td><td>" + escapeHtml(procedure) + "</td></tr>" +
      "<tr><td><b>Language</b></td><td>" + escapeHtml(language || "") + "</td></tr>" +
      "<tr><td><b>Signed at</b></td><td>" + escapeHtml(when || "") + "</td></tr>" +
      "</table>" +
      (questions ? "<p style='font-family:sans-serif;font-size:14px'><b>Questions for the doctor (to answer at signing):</b></p><ul style='font-family:sans-serif;font-size:14px'>" + String(questions).split(/\n+/).filter(function(x){return x.trim();}).map(function(x){return "<li>" + escapeHtml(x) + "</li>";}).join("") + "</ul>" : "") +
      "<p style='font-family:sans-serif;font-size:13px;color:#555'>The signed acknowledgment PDF is attached. This is a pre-visit acknowledgment — please complete the formal consent with the patient at the clinic.</p>";

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: from,
        to: [to],
        subject: "Signed consent — " + procedure + " — " + patientName,
        html: html,
        attachments: [{ filename: filename || "consent.pdf", content: pdf }]
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
