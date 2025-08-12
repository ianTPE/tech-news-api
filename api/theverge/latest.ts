import type { VercelRequest, VercelResponse } from '@vercel/node';
import Parser from 'rss-parser';

const FEED_URL = 'https://www.theverge.com/rss/index.xml';
const parser = new Parser();

// ---- utils ----
function safeParseDate(input?: string | null) {
  if (!input) return null;
  const d = new Date(input);
  return Number.isFinite(d.getTime()) ? d : null;
}

function looksLikeImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url);
}

function extractImageUrlFromItem(it: any) {
  try {
    const enclosureUrl = typeof it?.enclosure?.url === 'string' ? it.enclosure.url : '';
    if (enclosureUrl && (it?.enclosure?.type?.startsWith?.('image/') || looksLikeImage(enclosureUrl))) {
      return enclosureUrl;
    }
    const html = String(it?.content || it?.['content:encoded'] || '');
    const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m && m[1]) return m[1];
  } catch {}
  return '';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchFeedWithRetry(url: string, retries = 1) {
  try {
    return await parser.parseURL(url);
  } catch (e) {
    if (retries <= 0) throw e;
    await sleep(400);
    return fetchFeedWithRetry(url, retries - 1);
  }
}

// ---- handler ----
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // 以 WHATWG URL 解析查詢參數，避免 req.query 陣列/型別陷阱
    const url = new URL(req.url!, `https://${req.headers.host}`);
    const sp = url.searchParams;

    // limit：容錯 + 範圍限制 [1, 50]
    const rawLimit = parseInt(sp.get('limit') ?? '20', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;

    // since：YYYY-MM-DD -> 加上 +08:00；其他格式直接丟給 Date
    const sinceParam = sp.get('since');
    let since: Date | null = null;
    if (sinceParam) {
      const normalized = /\d{4}-\d{2}-\d{2}$/.test(sinceParam)
        ? `${sinceParam}T00:00:00+08:00`
        : sinceParam;
      const d = new Date(normalized);
      since = Number.isFinite(d.getTime()) ? d : null; // 非法則忽略過濾
    }

    // 拉 RSS（含一次重試）
    const feed = await fetchFeedWithRetry(FEED_URL, 1);

    // 轉乾淨 JSON
    const items = (feed.items || []).map((it: any) => {
      const rawDate = it.isoDate || it.pubDate || it.date || '';
      const publishedAt = safeParseDate(rawDate);
      const rawContent: string = it.contentSnippet || (it.content ? String(it.content) : '');
      const text = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const image = extractImageUrlFromItem(it);

      return {
        title: (it.title || '').trim(),
        link: it.link || '',
        publishedAt, // 內部排序/過濾用
        published: publishedAt ? publishedAt.toISOString() : '',
        summary: text.slice(0, 280),
        source: 'The Verge',
        image,
      };
    });

    // 依日期新→舊排序（無日期放最後）
    items.sort((a: any, b: any) => {
      const ta = a.publishedAt ? a.publishedAt.getTime() : -Infinity;
      const tb = b.publishedAt ? b.publishedAt.getTime() : -Infinity;
      return tb - ta;
    });

    // 過濾 + 截取
    const filtered = since ? items.filter((it: any) => it.publishedAt && it.publishedAt >= since!) : items;
    const top = filtered.slice(0, limit).map(({ publishedAt, ...rest }: any) => rest);

    // 快取
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');

    return res.status(200).json({
      source: 'The Verge',
      fetched_at: new Date().toISOString(),
      articles: top,
    });
  } catch (err: any) {
    console.error('RSS fetch error:', err);
    
    // 改善錯誤回應：加上 status 方便除錯
    const errorResponse: any = {
      error: 'Failed to fetch or parse The Verge RSS',
      detail: err?.message || String(err),
      fetched_at: new Date().toISOString(),
      status: err?.status || err?.statusCode || 500,
    };
    
    return res.status(500).json(errorResponse);
  }
}


