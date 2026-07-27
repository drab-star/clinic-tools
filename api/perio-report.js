// Vercel serverless function — generates a periodontal case assessment (SOAP: Assessment) from chart data via OpenAI.
// Requires env var OPENAI_API_KEY.

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    let body = req.body;
    if (!body || typeof body === "string") {
      const raw = typeof body === "string" ? body : await new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
      body = raw ? JSON.parse(raw) : {};
    }
    const summary = (body.summary || "").trim();
    if (!summary) return res.status(400).json({ error: "No chart data" });

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ error: "Server AI key not configured" });

    const system = "You are a periodontist writing the ASSESSMENT (and a brief plan) of a SOAP note from periodontal charting data. "
      + "Return ONLY JSON with these string fields: "
      + '{"diagnosis":"","findings":"","risk":"","plan":"","patient_summary":""}. '
      + "diagnosis: the periodontal diagnosis using the 2017 AAP/EFP classification with stage (I-IV) and grade (A-C) and a one-line rationale. "
      + "findings: a concise summary of the key objective findings (bleeding %, number and distribution of deep pockets, attachment loss, notable teeth, caries and restorations). "
      + "risk: risk factors evident from the data and the overall prognosis. "
      + "plan: a short recommended periodontal treatment sequence and a recall interval. "
      + "patient_summary: 2-3 warm, plain-language sentences a patient could read. "
      + "Be concise and clinical. This is decision support for the treating clinician to review and confirm. Do not invent findings not implied by the input.";

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: summary }]
      })
    });
    if (!r.ok) { const d = await r.text(); return res.status(502).json({ error: "AI provider error", detail: d }); }
    const data = await r.json();
    let parsed = {};
    try { parsed = JSON.parse(data.choices[0].message.content); } catch (e) {}
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String((e && e.message) || e) });
  }
};
