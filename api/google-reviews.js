// Vercel serverless function — pulls a competitor's Google reviews via the Apify Google Maps Reviews Scraper.
// Requires env vars: APIFY_TOKEN (Apify personal API token). Reviews are then analysed by /api/reviews.

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
    if (!/google\./i.test(url)) return res.status(400).json({ error: "Please paste a Google Maps link." });

    const token = process.env.APIFY_TOKEN;
    if (!token) return res.status(500).json({ error: "Scraper token not configured" });

    const input = {
      startUrls: [{ url }],
      maxReviews: 80,
      reviewsOrigin: "google",
      language: "en",
      personalData: false
    };

    const r = await fetch("https://api.apify.com/v2/acts/compass~google-maps-reviews-scraper/run-sync-get-dataset-items?token=" + encodeURIComponent(token), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    if (!r.ok) { const d = await r.text(); return res.status(502).json({ error: "Scraper error", detail: d.slice(0, 300) }); }

    const items = await r.json();
    if (!Array.isArray(items) || !items.length) return res.status(200).json({ error: "no_reviews" });

    const first = items.find((x) => x && x.title) || items[0] || {};
    const name = first.title || "";
    const address = first.address || [first.street, first.city, first.state, first.postalCode].filter(Boolean).join(", ") || "";
    const reviews = items
      .map((it) => ((it.textTranslated || it.text || "") + "").trim())
      .filter((t) => t.length > 0)
      .join("\n\n");
    if (reviews.length < 80) return res.status(200).json({ name, address, error: "no_reviews" });
    const count = items.filter((it) => it && (it.text || it.textTranslated)).length;

    return res.status(200).json({ name, address, reviews, count });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String((e && e.message) || e) });
  }
};
