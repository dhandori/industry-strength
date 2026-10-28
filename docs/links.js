/* 바깥 링크 한 곳에서 만들기 (2026-10-28) — 산업 강도·52주 신고가·종목 상세가 같이 쓴다.
   - 네이버: 지금 주소 m.stock.naver.com/domestic/stock/코드/(total|news|finance/annual). 영문 섞인 새 코드(0158S0)도 그대로.
   - TradingView: 거래소를 꼭 붙인다. 한국 KRX:코드, 미국은 data/tv_ex.json(scripts/tv_symbols.py가 확인한 표)의 거래소.
     거래소 없이 'HAL'·'TD'만 넘기면 인도·캐나다 종목이 열린다. 표에 없으면 종목 페이지(/symbols/티커/)로 보내 TradingView가 고르게 한다.
     TradingView에 미국 상장으로 아예 없는 종목(표의 none, 예: ACA)은 엉뚱한 회사 대신 Finviz 차트로 보낸다.
   - 미국 점 티커: TradingView·SEC는 BRK.B, Finviz·Yahoo는 BRK-B. */
(() => {
  let EX = {}, NONE = new Set();
  fetch("data/tv_ex.json", { cache: "no-cache" }).then((r) => r.ok ? r.json() : null).then((d) => { if (d && d.map) { EX = d.map; NONE = new Set(d.none || []); } }).catch(() => {});
  const isKR = (m) => m === "KR";
  const krCode = (c) => String(c || "").trim().replace(/\.(KS|KQ)$/i, "").toUpperCase();
  const usTick = (c) => String(c || "").trim().toUpperCase().replace(/^([A-Z]+)-([A-Z])$/, "$1.$2");
  const enc = encodeURIComponent;
  // 'KRX:005930' · 'NYSE:HAL' · 표에 없으면 null
  function tvSym(code, market) {
    if (isKR(market)) return "KRX:" + krCode(code);
    const t = usTick(code), ex = EX[t];
    return ex ? ex + ":" + t : null;
  }
  window.__links = {
    tvSym,
    tvChart(code, market) {
      if (!isKR(market) && NONE.has(usTick(code))) return window.__links.finviz(code);
      const s = tvSym(code, market);
      return s ? `https://www.tradingview.com/chart/?symbol=${enc(s)}` : `https://www.tradingview.com/symbols/${enc(usTick(code))}/`;
    },
    tvPage(code, market) {
      if (!isKR(market) && NONE.has(usTick(code))) return window.__links.finviz(code);
      const s = tvSym(code, market);
      return `https://www.tradingview.com/symbols/${enc(s ? s.replace(":", "-") : usTick(code))}/`;
    },
    naver(code, sub) { return `https://m.stock.naver.com/domestic/stock/${enc(krCode(code))}/${sub || "total"}`; },
    finviz(code) { return `https://finviz.com/quote.ashx?t=${enc(usTick(code).replace(".", "-"))}`; },
    yahooNews(code) { return `https://finance.yahoo.com/quote/${enc(usTick(code).replace(".", "-"))}/news`; },
    sec(code) { return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${enc(usTick(code).replace(".", "-"))}&type=&dateb=&owner=include&count=40`; },
  };
  // 표가 늦게 와서 거래소 없이 그려진 링크는 누르는 순간 고쳐 보낸다
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href^="https://www.tradingview.com/symbols/"]');
    if (!a) return;
    const t = decodeURIComponent((a.getAttribute("href").match(/\/symbols\/([^/]+)\/$/) || [])[1] || "");
    if (t && !t.includes("-") && (EX[t] || NONE.has(t))) a.href = window.__links.tvPage(t, "US");
  }, true);
})();
