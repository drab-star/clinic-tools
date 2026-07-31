// Vercel serverless function — fetches a clinic listing page (Practo) and extracts name, address and review text.
// Google and Justdial block automated reading, so those are handled by pasting on the client. Requires OPENAI_API_KEY.

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    let body = req.body;
    if (!body || typeof body === "string") {
      const raw = typeof body === "string" ? body : await new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
      body = raw ? JSON.parse(raw) : {};
    }
    let url = (body.url || "").trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    if (!/^https?:\/\/[^\s]+$/i.test(url)) return res.status(400).json({ error: "Please enter a valid link." });

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ error: "Server AI key not configured" });

    let html = "";
    try {
      const pg = await fetch(url, { headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }});
      html = await pg.text();
    } catch (e) { return res.status(200).json({ error: "blocked" }); }

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;|&rsquo;|&apos;/gi, "'").replace(/&quot;/gi, '"')
      .replace(/\s+/g, " ").trim();
    if (text.length < 400) return res.status(200).json({ error: "blocked" });

    const snippet = text.slice(0, 16000);
    const system = "You are given the scraped text of a clinic's public listing page. Return ONLY JSON "
      + '{"name":"","address":"","reviews":""}. '
      + "name = the clinic's name. address = its full street address. "
      + "reviews = a single string containing ALL the patient review texts on the page, each review separated by a blank line; keep the patient's wording, but drop star ratings, dates, and interface labels. "
      + "Ignore navigation menus, adverts, other clinics, and footer links. If there are no patient reviews on the page, set reviews to an empty string.";

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: snippet }]
      })
    });
    if (!r.ok) { const d = await r.text(); return res.status(502).json({ error: "AI provider error", detail: d }); }
    const data = await r.json();
    let parsed = {};
    try { parsed = JSON.parse(data.choices[0].message.content); } catch (e) {}
    const reviews = (parsed.reviews || "").trim();
    if (reviews.length < 80) return res.status(200).json({ name: parsed.name || "", address: parsed.address || "", error: "no_reviews" });
    const count = reviews.split(/\n\s*\n/).filter((x) => x.trim().length > 30).length;
    return res.status(200).json({ name: parsed.name || "", address: parsed.address || "", reviews, count });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String((e && e.message) || e) });
  }
};
