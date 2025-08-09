// Vercel Serverless Function: 輕量版探索頁（SSR + 前端增強）
// - 預設呼叫同部署下的 /api/theverge/latest?limit=20
// - 支援 ?api= 覆蓋資料來源

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const apiParam = typeof req.query.api === "string" ? req.query.api : undefined;
  const apiPath = apiParam || "/api/theverge/latest?limit=20";

  // 伺服端抓資料，先行渲染，避免前端腳本失敗時畫面為空
  let articles: Array<{ title: string; link: string; published?: string; summary?: string; source?: string; image?: string }>
    = [];
  try {
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
    const base = `${proto}://${host}`;
    const url = /^https?:\/\//i.test(apiPath) ? apiPath : `${base}${apiPath}`;
    const r = await fetch(url, { cache: "no-store" });
    const json = await r.json();
    articles = Array.isArray(json.articles) ? json.articles : [];
  } catch {}

  const escapeHtml = (s: string) =>
    s.replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" }[c] as string));

  const listHtml = articles
    .map((a) => {
      const img = a.image ? `<img class="thumb" loading="lazy" src="${escapeHtml(a.image)}" alt="" />` : '<div class="thumb"></div>';
      return `
      <div class="card">
        ${img}
        <div class="content">
          <div class="meta">${escapeHtml(a.source || "The Verge")}${a.published ? ` · <span>${escapeHtml(a.published)}</span>` : ""}</div>
          <h2>${escapeHtml(a.title || "")}</h2>
          <div class="sum">${escapeHtml(a.summary || "")}</div>
          <div class="actions">
            <button class="save">收藏</button>
            <a class="link" href="${escapeHtml(a.link || "#")}" target="_blank" rel="noopener">前往閱讀</a>
          </div>
        </div>
      </div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>我的探索（輕量版）</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#f6f7f9;--card:#fff;--muted:#667085}
    *{box-sizing:border-box}
    html,body{height:100%}
    body{margin:0;font-family:Inter,ui-sans-serif,system-ui,"PingFang TC","Noto Sans CJK TC",sans-serif;background:linear-gradient(#fafafa,#f1f5f9)}
    .wrap{max-width:720px;margin:0 auto;padding:16px}
    .top{display:flex;align-items:center;gap:8px;margin-bottom:12px}
    .title{font-weight:700;font-size:20px}
    .badge{background:#111827;color:#fff;border-radius:999px;padding:4px 10px;font-size:12px}
    .btn{border:1px solid #e5e7eb;background:#fff;border-radius:999px;padding:8px 12px;font-size:14px;cursor:pointer}
    .hint{color:var(--muted);font-size:12px;margin:4px 0 12px}

    /* 垂直列表 */
    .stack{display:grid;grid-template-columns:1fr;gap:14px;padding-bottom:24px}
    .card{background:var(--card);border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.06);padding:14px;display:grid;grid-template-columns:120px 1fr;gap:12px;align-items:start}
    .thumb{width:120px;height:120px;border-radius:12px;background:#e5e7eb;object-fit:cover}
    .card h2{font-size:17px;margin:2px 0 6px}
    .meta{display:flex;gap:8px;align-items:center;color:var(--muted);font-size:12px}
    .sum{color:#334155;font-size:14px;line-height:1.5;max-height:6lh;overflow:hidden}
    .actions{margin-top:8px;display:flex;gap:8px}
    .link{background:#111827;color:#fff;border-radius:10px;padding:8px 10px;text-decoration:none;font-size:13px;display:inline-flex;align-items:center;justify-content:center}
    .save{background:#dcfce7;color:#166534;border-radius:10px;padding:8px 10px;border:none}

    /* 收藏清單 */
    .saved{margin-top:18px}
    .saved h3{font-size:16px;margin:0 0 8px}
    .saved .item{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px;margin-bottom:8px}
    .saved .item a{color:#111827;text-decoration:none}
  </style>
  <script>if (window.top !== window.self) window.top.location = window.location;</script>
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#111827" />
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div class="title">我的探索</div>
      <span class="badge">The Verge</span>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn" id="refresh">重新整理</button>
        <a class="btn" href="?" id="reset">重設偏好</a>
      </div>
    </div>
    <div class="hint">上下捲動瀏覽卡片。可用 ?api= 自訂資料來源。</div>

    <div class="stack" id="stack">${listHtml}</div>

    <div class="saved" id="savedWrap" style="display:none">
      <h3>我的收藏</h3>
      <div id="saved"></div>
    </div>
  </div>

  <script>
  (function(){
    var API = new URL(location.href).searchParams.get('api') || ${JSON.stringify(apiPath)};
    var stack = document.getElementById('stack');
    var refreshBtn = document.getElementById('refresh');
    var savedWrap = document.getElementById('savedWrap');
    var savedList = document.getElementById('saved');
    var saved = JSON.parse(localStorage.getItem('discover_saved_lite') || '[]');

    function renderSaved(){
      savedWrap.style.display = saved.length ? '' : 'none';
      savedList.innerHTML = saved.map(function(s){
        return '<div class="item"><a href="'+s.link+'" target="_blank">'+s.title+'</a><div style="font-size:12px;color:#64748b">'+s.summary+'</div></div>';
      }).join('');
    }

    function doSave(a){
      if(!saved.find(function(s){ return s.link===a.link; })) saved.unshift({title:a.title,link:a.link,summary:a.summary});
      localStorage.setItem('discover_saved_lite', JSON.stringify(saved.slice(0,100)));
      renderSaved();
    }

    function bindSaveButtons(scope){
      var buttons = (scope || document).querySelectorAll('.save');
      buttons.forEach(function(btn){
        btn.addEventListener('click', function(){
          var card = btn.closest('.card');
          if(!card) return;
          var title = (card.querySelector('h2')||{}).textContent || '';
          var linkEl = card.querySelector('a.link');
          var link = linkEl ? linkEl.getAttribute('href') : '#';
          var sumEl = card.querySelector('.sum');
          var summary = sumEl ? sumEl.textContent : '';
          doSave({title:title, link:link, summary:summary});
        });
      });
    }

    async function load(){
      try {
        var r = await fetch(API, {cache:'no-store'});
        var json = await r.json();
        var list = Array.isArray(json.articles)? json.articles: [];
        var html = list.map(function(a){
          var img = a.image ? '<img class="thumb" loading="lazy" src="'+a.image+'" alt="" />' : '<div class="thumb"></div>';
          return '<div class="card">'+
            img+
            '<div class="content">'+
              '<div class="meta">'+(a.source||'The Verge')+'</div>'+ 
              '<h2>'+ (a.title||'') +'</h2>'+ 
              '<div class="sum">'+ (a.summary||'') +'</div>'+ 
              '<div class="actions">'+
                '<button class="save">收藏</button>'+ 
                '<a class="link" href="'+ (a.link||'#') +'" target="_blank" rel="noopener">前往閱讀</a>'+ 
              '</div>'+ 
            '</div>'+ 
          '</div>';
        }).join('');
        stack.innerHTML = html;
        bindSaveButtons(stack);
        renderSaved();
      } catch(e){
        stack.innerHTML = '<div style="padding:16px;color:#b91c1c">載入失敗：'+(e && e.message? e.message: e)+'</div>';
      }
    }

    bindSaveButtons(document);
    renderSaved();
    refreshBtn.addEventListener('click', load);
  })();
  </script>
</body>
</html>`;

  res.status(200).send(html);
}


