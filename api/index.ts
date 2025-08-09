export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(200).json({
    name: "Tech News API",
    description: "提供 The Verge 最新文章的 Serverless API，適用於 GPT Actions / 商機分析。",
    endpoints: {
      theVergeLatest: "/api/theverge/latest",
    },
    params: {
      limit: "最多 50，預設 20",
      since: "ISO 日期時間，例如 2025-01-01T00:00:00.000Z",
    },
    examples: [
      "/api/theverge/latest?limit=10",
      "/api/theverge/latest?limit=15&since=2025-01-01T00:00:00.000Z",
    ],
  });
}


