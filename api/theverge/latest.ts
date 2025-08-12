import type { VercelRequest, VercelResponse } from '@vercel/node';
import Parser from "rss-parser";

// 支援多來源的 RSS URL 白名單
const ALLOWED_FEED_URLS = [
  "https://www.theverge.com/rss/index.xml",
  // 未來可在此添加更多允許的 RSS 來源
];

const DEFAULT_FEED_URL = "https://www.theverge.com/rss/index.xml";
const parser = new Parser({
  // 確保沒有內建限制
  maxRedirects: 5,
  timeout: 10000,
  // 添加自定義解析器選項
  customFields: {
    item: [
      ['media:content', 'media:content'],
      ['media:thumbnail', 'media:thumbnail'],
    ],
  },
});

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
    // 簡化 enclosure URL 處理：多數 RSS 是字串，不是物件
    const enclosureUrl = typeof it?.enclosure?.url === "string" ? it.enclosure.url : "";
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 簡單重試：處理 RSS 暫時性超時/連線中斷
async function fetchFeedWithRetry(url: string, retries = 1) {
  try {
    console.log(`Fetching RSS feed from: ${url}`);
    const result = await parser.parseURL(url);
    console.log(`RSS feed fetched successfully. Raw items count: ${result.items?.length || 0}`);
    return result;
  } catch (e) {
    if (retries <= 0) throw e;
    console.log(`RSS fetch failed, retrying... (${retries} retries left)`);
    await sleep(400);
    return fetchFeedWithRetry(url, retries - 1);
  }
}

// 驗證 RSS URL 是否在白名單中
function validateFeedUrl(url: string): string {
  if (!url || typeof url !== "string") {
    return DEFAULT_FEED_URL;
  }
  
  // 檢查是否在白名單中
  if (ALLOWED_FEED_URLS.includes(url)) {
    return url;
  }
  
  // 不在白名單中，回傳預設值
  console.warn(`Blocked unauthorized RSS URL: ${url}`);
  return DEFAULT_FEED_URL;
}

// Vercel Serverless Function
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    // 支援多來源：從 req.query.url 讀取並做白名單驗證
    const qUrl = req.query.url ?? null;
    const urlStr = Array.isArray(qUrl) ? qUrl[0] : qUrl;
    const feedUrl = validateFeedUrl(urlStr);

    // ---- 這裡做「陣列安全」處理 ----
    const qLimit = req.query.limit ?? "20";
    const limitStr = Array.isArray(qLimit) ? qLimit[0] : qLimit;
    const rawLimit = Number.parseInt(String(limitStr), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;

    const qSince = req.query.since ?? null;
    const sinceStr = Array.isArray(qSince) ? qSince[0] : qSince;
    let since: Date | null = null;
    if (sinceStr) {
      const normalized = /\d{4}-\d{2}-\d{2}$/.test(sinceStr) ? `${sinceStr}T00:00:00+08:00` : sinceStr;
      const d = new Date(normalized);
      since = Number.isFinite(d.getTime()) ? d : null;
    }
    // --------------------------------

    console.log(`Request parameters - limit: ${limit}, since: ${since}, feedUrl: ${feedUrl}`);

    // 抓取 RSS（含一次重試）
    const feed = await fetchFeedWithRetry(feedUrl, 1);

    // 調試：記錄原始 RSS 項目數量
    console.log(`RSS feed contains ${feed.items?.length || 0} items`);
    console.log(`Feed title: ${feed.title}`);
    console.log(`Feed description: ${feed.description}`);

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

    // 調試：記錄處理後的項目數量
    console.log(`Processed ${items.length} items`);

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

    // 調試：記錄過濾後的項目數量
    console.log(`After filtering: ${filtered.length} items, requested limit: ${limit}`);

    const top = filtered.slice(0, limit).map(({ publishedAt, ...rest }: any) => rest);

    // 調試：記錄最終返回的項目數量
    console.log(`Final result: ${top.length} articles`);

    // Cache-Control: 1 分鐘
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=30");

    return res.status(200).json({
      source: "The Verge",
      fetched_at: new Date().toISOString(),
      articles: top,
    });
  } catch (err: any) {
    console.error("RSS fetch error:", err);
    
    // 改善錯誤回應：加上 status 或 stack（避免洩漏敏感資訊）
    const errorResponse: any = {
      error: "Failed to fetch or parse RSS feed",
      detail: err?.message || String(err),
      fetched_at: new Date().toISOString(),
    };
    
    // 只在開發環境或特定條件下加入 stack trace
    if (process.env.NODE_ENV === "development" || process.env.VERCEL_ENV === "development") {
      errorResponse.stack = err?.stack;
    }
    
    // 加入 HTTP status code 方便除錯
    errorResponse.status = err?.status || err?.statusCode || 500;
    
    return res.status(500).json(errorResponse);
  }
}


