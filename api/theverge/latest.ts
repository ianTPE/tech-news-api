import Parser from "rss-parser";

const FEED_URL = "https://www.theverge.com/rss/index.xml";
const parser = new Parser();

// Vercel Serverless Function
export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 50);
    const sinceParam = req.query.since ? String(req.query.since) : null;
    const since = sinceParam ? new Date(sinceParam) : null;

    const feed = await parser.parseURL(FEED_URL);

    const items = (feed.items || [])
      .map((it) => {
        const published =
          (it as any).isoDate || (it as any).pubDate || (it as any).date || "";
        const publishedISO = published ? new Date(published).toISOString() : "";
        return {
          title: it.title?.trim() || "",
          link: it.link || "",
          published: publishedISO,
          summary:
            (it as any).contentSnippet ||
            (it as any).content?.toString().replace(/<[^>]+>/g, "").slice(0, 280) ||
            "",
          source: "The Verge",
        };
      })
      .filter((it) => (since ? new Date(it.published) >= since : true))
      .slice(0, limit);

    // Cache-Control: 1 分鐘
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=30");

    return res.status(200).json({
      source: "The Verge",
      fetched_at: new Date().toISOString(),
      articles: items,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({
      error: "Failed to fetch or parse The Verge RSS",
      detail: err?.message || String(err),
    });
  }
}


