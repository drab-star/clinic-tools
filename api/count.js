// Vercel serverless function — privacy-safe usage counters via Upstash Redis (REST).
// Counts only (never patient data). Set these env vars in Vercel:
//   UPSTASH_REDIS_REST_URL    — from your Upstash database "REST API" section
//   UPSTASH_REDIS_REST_TOKEN  — from the same section
//   STATS_KEY                 — a passcode you choose; required to view the private /#stats breakdown
// If the vars are missing, this quietly returns configured:false and the app just hides the numbers.

// Public headline baseline — added ONLY to the public homepage number so a new site
// doesn't look empty. The private #stats page always shows the true raw counts.
// Change these anytime.
const BASELINE = { consent: 500, prompt: 400 };

const EVENTS = ["visit", "consent", "prompt", "perio", "review", "suggestion"];

function ym(d) { return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"); }

module.exports = async (req, res) => {
  // Tolerate values pasted with surrounding quotes/spaces or a trailing slash.
  const clean = (v) => String(v || "").trim().replace(/^["']+|["']+$/g, "").trim();
  const url = clean(process.env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, "");
  const token = clean(process.env.UPSTASH_REDIS_REST_TOKEN);

  const now = new Date();
  const curM = ym(now);
  const prevM = ym(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));

  // Not configured yet — respond gracefully so the front-end just hides the numbers.
  if (!url || !token) {
    return res.status(200).json({ configured: false });
  }

  async function pipe(cmds) {
    const r = await fetch(url + "/pipeline", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(cmds)
    });
    if (!r.ok) throw new Error("upstash " + r.status);
    return r.json(); // -> [{result:...}, ...]
  }

  try {
    if (req.method === "POST") {
      let body = req.body;
      if (!body || typeof body === "string") {
        const raw = typeof body === "string" ? body : await new Promise((resolve) => {
          let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => resolve(d));
        });
        body = raw ? JSON.parse(raw) : {};
      }
      const ev = String(body.event || "");
      if (EVENTS.indexOf(ev) < 0) return res.status(400).json({ error: "bad event" });
      await pipe([["INCR", "count:" + ev], ["INCR", "count:" + ev + ":" + curM]]);
      return res.status(200).json({ ok: true });
    }

    // GET
    const all = req.query && (req.query.all === "1" || req.query.all === "true");

    if (!all) {
      // Public headline totals (with baseline)
      const rr = await pipe([["MGET", "count:consent", "count:prompt"]]);
      const a = (rr[0] && rr[0].result) || [];
      return res.status(200).json({
        configured: true,
        totals: {
          consent: (+a[0] || 0) + (BASELINE.consent || 0),
          prompt: (+a[1] || 0) + (BASELINE.prompt || 0)
        }
      });
    }

    // Full private breakdown (raw numbers, no baseline) — passcode-protected.
    const secret = process.env.STATS_KEY || "";
    if (!secret) return res.status(503).json({ error: "stats passcode not configured" });
    const provided = req.headers["x-stats-key"] || (req.query && req.query.key) || "";
    if (provided !== secret) return res.status(401).json({ error: "unauthorized" });

    const keysAll = EVENTS.map((e) => "count:" + e);
    const keysCur = EVENTS.map((e) => "count:" + e + ":" + curM);
    const keysPrev = EVENTS.map((e) => "count:" + e + ":" + prevM);
    const rr = await pipe([["MGET", ...keysAll], ["MGET", ...keysCur], ["MGET", ...keysPrev]]);
    const a = (rr[0] && rr[0].result) || [];
    const c = (rr[1] && rr[1].result) || [];
    const p = (rr[2] && rr[2].result) || [];
    const toObj = (vals) => { const o = {}; EVENTS.forEach((e, i) => (o[e] = +vals[i] || 0)); return o; };
    return res.status(200).json({
      configured: true, month: curM, prevMonth: prevM,
      all: toObj(a), cur: toObj(c), prev: toObj(p)
    });
  } catch (e) {
    return res.status(500).json({ error: "count error", detail: String(e && e.message || e) });
  }
};
