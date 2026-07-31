// Vercel serverless function — analyses competitor reviews via OpenAI. Requires env var OPENAI_API_KEY.

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    let body = req.body;
    if (!body || typeof body === "string") {
      const raw = typeof body === "string" ? body : await new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
      body = raw ? JSON.parse(raw) : {};
    }
    const reviews = (body.reviews || "").trim();
    if (reviews.length < 20) return res.status(400).json({ error: "Not enough review text" });

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ error: "Server AI key not configured" });

    const system = "You are a dental practice growth advisor. You are given patient reviews of one or more competitor clinics. "
      + "Analyse them and return ONLY JSON of this shape: "
      + '{"summary":"","love":[{"point":"","quote":""}],"frustrations":[{"point":"","quote":""}],"opening":[{"point":"","action":""}]}. '
      + "summary: one short paragraph on the overall picture. "
      + "love: the recurring things patients praise — point is the theme, quote is a short representative snippet taken from the reviews. "
      + "frustrations: the recurring complaints, with point and a representative quote. "
      + "opening: 3 to 5 concrete opportunities for a competing clinic to win — point is the gap, action is what to do about it. "
      + "Base everything ONLY on the reviews provided; do not invent details. Keep each point concise. Return 3-6 items in love and frustrations where the data supports it.";

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: reviews.slice(0, 12000) }]
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
