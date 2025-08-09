import Parser from "rss-parser";

const FEED_URL = "https://www.theverge.com/rss/index.xml";
const parser = new Parser();

function safeParseDate(input?: string | null) {
  if (!input) return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

// Vercel Serverless Function
export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 50);

    // since：若是 YYYY-MM-DD 形式，補上台北時區避免被當成 UTC 零時
    const sinceParam = req.query.since ? String(req.query.since) : null;
    const since = sinceParam
      ? new Date(/\d{4}-\d{2}-\d{2}$/.test(sinceParam)
          ? `${sinceParam}T00:00:00+08:00`
          : sinceParam)
      : null;

    const feed = await parser.parseURL(FEED_URL);

    const items = (feed.items || []).map((it) => {
      const rawDate =
        (it as any).isoDate || (it as any).pubDate || (it as any).date || "";
      const publishedAt = safeParseDate(rawDate);
      const summary =
        (it as any).contentSnippet ||
        (it as any).content?.toString().replace(/<[^>]+>/g, "") ||
        "";

      return {
        title: it.title?.trim() || "",
        link: it.link || "",
        publishedAt, // 僅用於排序與過濾
        published: publishedAt ? publishedAt.toISOString() : "",
        summary: summary.slice(0, 280),
        source: "The Verge",
      };
    });

    // 先排序（新→舊），缺日期的排最後
    items.sort((a, b) => {
      const ta = a.publishedAt ? a.publishedAt.getTime() : -Infinity;
      const tb = b.publishedAt ? b.publishedAt.getTime() : -Infinity;
      return tb - ta;
    });

    // 有 since 時，只取有日期且不早於 since 的項目；無 since 時全取
    const filtered = since
      ? items.filter((it) => it.publishedAt && it.publishedAt >= since)
      : items;

    const top = filtered.slice(0, limit).map(({ publishedAt, ...rest }) => rest);

    // Cache-Control: 1 分鐘
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=30");

    return res.status(200).json({
      source: "The Verge",
      fetched_at: new Date().toISOString(),
      articles: top,
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({
      error: "Failed to fetch or parse The Verge RSS",
      detail: err?.message || String(err),
    });
  }
}


