import Parser from "rss-parser";

const FEED_URL = "https://www.theverge.com/rss/index.xml";
const parser = new Parser();

function safeParseDate(input?: string | null) {
  if (!input) return null;
  const d = new Date(input);
  return Number.isFinite(d.getTime()) ? d : null;
}

function looksLikeImage(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url);
}

function extractImageUrlFromItem(it: any): string {
  try {
    const enclosureUrl: string | undefined = it?.enclosure?.url || it?.enclosure?.url?.href;
    if (enclosureUrl && (it?.enclosure?.type?.startsWith?.("image/") || looksLikeImage(enclosureUrl))) {
      return enclosureUrl;
    }
    const html = String(it?.content || it?.["content:encoded"] || "");
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m && m[1]) return m[1];
  } catch {}
  return "";
}

// 以毫秒為單位的 sleep
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// 簡單重試：處理 RSS 暫時性超時/連線中斷
async function fetchFeedWithRetry(url: string, retries = 1) {
  try {
    return await parser.parseURL(url);
  } catch (e) {
    if (retries <= 0) throw e;
    await sleep(400);
    return fetchFeedWithRetry(url, retries - 1);
  }
}

// Vercel Serverless Function
export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    // limit：數值防呆與範圍限制 [1, 50]
    const rawLimit = Number.parseInt(String(req.query.limit ?? "20"), 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 50)
      : 20;

    // since：若是 YYYY-MM-DD 形式，補上台北時區避免被當成 UTC 零時
    const sinceParam = req.query.since ? String(req.query.since) : null;
    let since: Date | null = null;
    if (sinceParam) {
      const normalized = /\d{4}-\d{2}-\d{2}$/.test(sinceParam)
        ? `${sinceParam}T00:00:00+08:00`
        : sinceParam;
      const d = new Date(normalized);
      since = Number.isFinite(d.getTime()) ? d : null; // 非法字串時，不套用 since 過濾
    }

    // 抓取 RSS（含一次重試）
    const feed = await fetchFeedWithRetry(FEED_URL, 1);

    const items = (feed.items || []).map((it: any) => {
      const rawDate = it.isoDate || it.pubDate || it.date || "";
      const publishedAt = safeParseDate(rawDate);

      const rawContent: string =
        it.contentSnippet ||
        (it.content ? String(it.content) : "");

      // 去 HTML + 壓縮空白
      const text = rawContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const image = extractImageUrlFromItem(it);

      return {
        title: (it.title || "").trim(),
        link: it.link || "",
        publishedAt, // 僅內部用於排序/過濾
        published: publishedAt ? publishedAt.toISOString() : "",
        summary: text.slice(0, 280),
        source: "The Verge",
        image,
      };
    });

    // 先排序（新→舊），缺日期排最後
    items.sort((a: any, b: any) => {
      const ta = a.publishedAt ? a.publishedAt.getTime() : -Infinity;
      const tb = b.publishedAt ? b.publishedAt.getTime() : -Infinity;
      return tb - ta;
    });

    // 有 since 時，只取有日期且不早於 since 的項目；無 since 時全取
    const filtered = since
      ? items.filter((it: any) => it.publishedAt && it.publishedAt >= since!)
      : items;

    const top = filtered.slice(0, limit).map(({ publishedAt, ...rest }: any) => rest);

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
      fetched_at: new Date().toISOString(),
    });
  }
}


