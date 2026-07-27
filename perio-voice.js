// Vercel serverless function — turns a spoken perio charting command into structured ops via OpenAI.
// Requires env var OPENAI_API_KEY (set in Vercel project settings).

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    let body = req.body;
    if (!body || typeof body === "string") {
      const raw = typeof body === "string" ? body : await new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });
      body = raw ? JSON.parse(raw) : {};
    }
    const transcript = (body.transcript || "").trim();
    if (!transcript) return res.status(400).json({ error: "No transcript" });

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ error: "Server AI key not configured" });

    const system = "You convert a dentist's spoken periodontal charting command into JSON. Output ONLY JSON of the form {\"ops\":[...]}. Teeth use FDI numbering (11-48). Op types:\n"
      + "- pocket: {\"tooth\":26,\"type\":\"pocket\",\"aspect\":\"buccal\"|\"palatal\"|\"both\",\"position\":\"mesial\"|\"distal\"|\"mid\",\"value\":<mm number>}\n"
      + "- recession: same fields, \"type\":\"recession\"\n"
      + "- bleeding: {\"tooth\":,\"type\":\"bleeding\",\"aspect\":,\"position\":}\n"
      + "- caries: {\"tooth\":,\"type\":\"caries\",\"surface\":\"mesial\"|\"distal\"|\"occlusal\"|\"buccal\"|\"lingual\"}\n"
      + "- restoration: {\"tooth\":,\"type\":\"restoration\",\"restoration\":\"crown\"|\"inlay\"|\"onlay\"|\"f1\"|\"f2mo\"|\"f2do\"|\"f3m\"|\"f3d\"|\"f4\"|\"f5\"}\n"
      + "- status: {\"tooth\":,\"type\":\"status\",\"status\":\"missing\"|\"implant\"|\"present\"}\n"
      + "- fill_remaining: {\"type\":\"fill_remaining\",\"measure\":\"pocket\"|\"recession\",\"value\":<mm>}  Use this when the dentist wants the REST of the teeth / all other / all remaining / everything else set to a value, so they don't read out every tooth (e.g. \"mark 2 mm pocket in the rest of the teeth\").\n\n"
      + "IMPORTANT RULES:\n"
      + "1. If the dentist does NOT say buccal/labial or palatal/lingual for a pocket, recession or bleeding, set \"aspect\":\"both\" so it is recorded on BOTH the buccal and palatal of that position. Never ask which side — always default to both.\n"
      + "2. If no position (mesial/distal) is stated, use \"mid\".\n"
      + "3. Restoration mapping: class 1 -> f1; class 2 MO / MO filling -> f2mo; class 2 DO / DO -> f2do; class 3 mesial -> f3m; class 3 distal -> f3d; class 4 -> f4; class 5 -> f5.\n"
      + "4. A single utterance may contain several commands -> several ops. Ignore anything that is not a charting instruction. If nothing applies, return {\"ops\":[]}.";

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: transcript }]
      })
    });
    if (!r.ok) { const d = await r.text(); return res.status(502).json({ error: "AI provider error", detail: d }); }
    const data = await r.json();
    let parsed = { ops: [] };
    try { parsed = JSON.parse(data.choices[0].message.content); } catch (e) {}
    return res.status(200).json({ ops: Array.isArray(parsed.ops) ? parsed.ops : [] });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String((e && e.message) || e) });
  }
};
