// Vercel Serverless Function: 傳回可在手機上左右滑的 HTML 頁面（純原生 HTML/CSS/JS）
// 預設會呼叫本服務的 /api/theverge/latest 端點載入資料

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const API = (req.query.api as string) || "/api/theverge/latest?limit=20";

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>我的探索（輕量版）</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#f6f7f9;--card:#fff;--muted:#667085;--brand:#16a34a;--danger:#ef4444;}
    *{box-sizing:border-box}
    html,body{height:100%}
    body{margin:0;font-family:Inter,ui-sans-serif,system-ui,"PingFang TC","Noto Sans CJK TC",sans-serif;background:linear-gradient(#fafafa,#f1f5f9);}
    .wrap{max-width:680px;margin:0 auto;padding:16px;}
    .top{display:flex;align-items:center;gap:8px;margin-bottom:12px}
    .title{font-weight:700;font-size:20px}
    .badge{background:#111827;color:#fff;border-radius:999px;padding:4px 10px;font-size:12px}
    .btn{border:1px solid #e5e7eb;background:#fff;border-radius:999px;padding:8px 12px;font-size:14px;cursor:pointer}
    .btn:active{transform:scale(.98)}
    .hint{color:var(--muted);font-size:12px;margin:4px 0 12px}

    /* 卡堆 */
    .stack{position:relative;height:70vh;min-height:420px}
    .card{position:absolute;inset:0;background:var(--card);border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:16px;display:flex;flex-direction:column}
    .card h2{font-size:18px;margin:8px 0 6px}
    .meta{display:flex;gap:8px;align-items:center;color:var(--muted);font-size:12px}
    .sum{color:#334155;font-size:14px;line-height:1.5;margin-top:8px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:7;-webkit-box-orient:vertical}
    .card .actions{margin-top:auto;display:flex;gap:8px}
    .link{background:#111827;color:#fff;border-radius:12px;padding:10px 12px;text-decoration:none;font-size:14px;display:inline-flex;align-items:center;justify-content:center}
    .skip{background:#fee2e2;color:#991b1b;border-radius:12px;padding:10px 12px;border:none}
    .save{background:#dcfce7;color:#166534;border-radius:12px;padding:10px 12px;border:none}

    /* 左右標籤 */
    .flag{position:absolute;top:12px;padding:6px 10px;border-radius:10px;font-weight:600;font-size:12px;opacity:0;transition:opacity .15s}
    .flag.left{left:12px;background:var(--danger);color:#fff}
    .flag.right{right:12px;background:var(--brand);color:#fff}

    /* 收藏清單 */
    .saved{margin-top:18px}
    .saved h3{font-size:16px;margin:0 0 8px}
    .saved .item{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px;margin-bottom:8px}
    .saved .item a{color:#111827;text-decoration:none}

    /* 進度條 */
    .progress{height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin:6px 0 10px}
    .bar{height:100%;width:0;background:linear-gradient(90deg,#22c55e,#06b6d4)}
  </style>
  <script>
    // 防止內容被外部嵌入
    if (window.top !== window.self) window.top.location = window.location;
  </script>
  <meta name="color-scheme" content="light dark" />
  <meta name="theme-color" content="#111827" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='50' fill='%23111827'/%3E%3Ctext x='50' y='58' font-size='44' text-anchor='middle' fill='white' font-family='Arial'%3ET%3C/text%3E%3C/svg%3E" />
  <link rel="apple-touch-icon" href="data:image/png;base64,iVBORw0KGgo=" />
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
    <div class="hint">左右滑動卡片：右滑收藏、左滑略過。可用 ?api= 自訂資料來源。</div>
    <div class="progress"><div class="bar" id="bar"></div></div>

    <div class="stack" id="stack"></div>

    <div class="saved" id="savedWrap" style="display:none">
      <h3>我的收藏</h3>
      <div id="saved"></div>
    </div>
  </div>

  <script>
  const API = new URL(location.href).searchParams.get('api') || ${JSON.stringify(API)};
  const stack = document.getElementById('stack');
  const bar = document.getElementById('bar');
  const refreshBtn = document.getElementById('refresh');
  const savedWrap = document.getElementById('savedWrap');
  const savedList = document.getElementById('saved');

  let data = []; // {title, link, published, summary, source}
  let order = []; // 顯示順序索引
  let cursor = 0; // 目前指向第幾張卡
  const saved = JSON.parse(localStorage.getItem('discover_saved_lite') || '[]');

  function timeAgo(iso){
    if(!iso) return '';
    const d = new Date(iso); if(isNaN(d.getTime())) return '';
    const diff = Date.now()-d.getTime();
    const m = Math.floor(diff/60000); if(m<1) return '剛剛'; if(m<60) return m+' 分鐘前';
    const h = Math.floor(m/60); if(h<24) return h+' 小時前';
    return Math.floor(h/24)+' 天前';
  }

  function updateProgress(){
    const total = order.length || 1;
    const p = Math.min(100, Math.round((cursor/total)*100));
    bar.style.width = p+'%';
  }

  function renderSaved(){
    savedWrap.style.display = saved.length ? '' : 'none';
    savedList.innerHTML = saved.map(s => `<div class="item"><a href="${s.link}" target="_blank">${s.title}</a><div style="font-size:12px;color:#64748b">${s.summary}</div></div>`).join('');
  }

  function createCard(a){
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <div class="meta">${a.source||'The Verge'} · <span>${timeAgo(a.published)}</span></div>
      <h2>${a.title}</h2>
      <div class="sum">${a.summary}</div>
      <div class="actions">
        <button class="skip">略過</button>
        <button class="save">收藏</button>
        <a class="link" href="${a.link}" target="_blank">前往閱讀</a>
      </div>
      <div class="flag left">略過</div>
      <div class="flag right">收藏</div>
    `;

    // 拖曳/滑動
    let sx=0, sy=0, dx=0, dy=0;
    const leftFlag = el.querySelector('.flag.left');
    const rightFlag = el.querySelector('.flag.right');

    function onStart(e){
      const p = e.touches? e.touches[0] : e; sx=p.clientX; sy=p.clientY; el.style.transition='';
    }
    function onMove(e){
      if(sx===0 && sy===0) return; const p=e.touches? e.touches[0]:e; dx=p.clientX-sx; dy=p.clientY-sy;
      el.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx/20}deg)`;
      const alpha = Math.min(1, Math.abs(dx)/160);
      if(dx>0){ rightFlag.style.opacity = alpha; leftFlag.style.opacity = 0; }
      else { leftFlag.style.opacity = alpha; rightFlag.style.opacity = 0; }
    }
    function onEnd(){
      const TH = 120;
      if(dx>TH){ doSave(a); dismiss(true); }
      else if(dx<-TH){ dismiss(false); }
      else { el.style.transition='transform .2s'; el.style.transform=''; leftFlag.style.opacity=0; rightFlag.style.opacity=0; }
      sx=sy=dx=dy=0;
    }
    function dismiss(savedSide){
      el.style.transition='transform .25s, opacity .25s';
      el.style.transform = `translate(${savedSide? 400:-400}px, 0) rotate(${savedSide? 15:-15}deg)`;
      el.style.opacity='0';
      setTimeout(next, 200);
    }

    el.addEventListener('pointerdown', onStart);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('touchstart', onStart, {passive:true});
    el.addEventListener('touchmove', onMove, {passive:true});
    el.addEventListener('touchend', onEnd);

    // 按鈕
    el.querySelector('.skip').addEventListener('click', () => dismiss(false));
    el.querySelector('.save').addEventListener('click', () => { doSave(a); dismiss(true); });
    return el;
  }

  function doSave(a){
    if(!saved.find(s=>s.link===a.link)) saved.unshift({title:a.title,link:a.link,summary:a.summary});
    localStorage.setItem('discover_saved_lite', JSON.stringify(saved.slice(0,100)));
    renderSaved();
  }

  function next(){
    cursor++; updateProgress();
    mountTopCard();
  }

  function mountTopCard(){
    stack.innerHTML = '';
    if(cursor >= order.length){ return; }
    const a = data[order[cursor]];
    const card = createCard(a);
    stack.appendChild(card);
  }

  async function load(){
    try {
      const r = await fetch(API, {cache:'no-store'});
      const json = await r.json();
      data = Array.isArray(json.articles)? json.articles: [];
      // 依時間排序（新→舊）
      const scored = data.map((a,i)=>({i,t:new Date(a.published||0).getTime()}));
      scored.sort((a,b)=>b.t-a.t);
      order = scored.map(x=>x.i);
      cursor = 0; updateProgress();
      mountTopCard(); renderSaved();
    } catch(e){
      stack.innerHTML = '<div style="padding:16px;color:#b91c1c">載入失敗：'+(e && e.message? e.message: e)+'</div>';
    }
  }

  refreshBtn.addEventListener('click', load);
  load();
  </script>
</body>
</html>`;

  res.status(200).send(html);
}


