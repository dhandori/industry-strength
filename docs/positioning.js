/* 💰 포지셔닝 탭
   2026-11-12: 아티팩트 '스마트머니 포지셔닝 레이더'를 흐름판 탭으로 옮김.
   2026-11-18 사용자 요청으로 화면을 새로 짰다("한눈에 이해가 안 가고, 자잘하고 복잡하고, 글씨가 작다. 가시성·가독성을 높이고 내용 누락은 없게").
   - 맨 위 한 화면에 결론(제목·판정·핵심 숫자·가격 사다리)을 둔다. 자세한 풀이는 각 구역 아래 '자세히'를 눌러 펼친다.
   - 글씨는 본문 16px 이상, 핵심 숫자 24px 이상. 휴대폰 한 칸, PC 두 칸.
   - 그래프 라이브러리(d3)를 쓰지 않고 HTML 막대와 작은 SVG 로 그린다. 바깥 스크립트를 받지 않는다.
   데이터: docs/data/positioning.json 한 파일(dhandori/global-high-radar 의 예약 작업 '06-1 차트 갱신'이 만든다).
   이 탭은 #po, .po-* 이름만 쓴다(페어 탭이 .pr-* 를 쓴다). */
(() => {
  const st = { data: null, loading: null, built: false };
  const host = () => document.getElementById("viewPositioning");

  // ---------- 작은 도구 ----------
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
  const f0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const f1 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const f2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sgn = (v, f) => (v > 0 ? "+" : v < 0 ? "−" : "") + f(Math.abs(v));
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const dt = (s) => new Date(String(s).slice(0, 10) + "T00:00:00");
  const md = (s) => { const d = dt(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const mdw = (s) => { const d = dt(s); return `${d.getMonth() + 1}월 ${d.getDate()}일(${WD[d.getDay()]})`; };
  const ym = (s) => { const p = String(s).split("-"); return `${Number(p[0])}년 ${Number(p[1])}월`; };
  const todayKST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const days = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
  const usd = (v) => { // 억 달러
    const a = Math.abs(v);
    return (a >= 1000 ? f0.format(Math.round(a)) : a >= 100 ? f0.format(Math.round(a)) : f1.format(a)).replace(/\.0$/, "") + "억 달러";
  };
  const flowTxt = (v) => (v == null ? "자료 없음" : v === 0 ? "0" : `${usd(v)} ${v < 0 ? "매도" : "매수"}`);
  const paras = (t) => String(t || "").split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join("");

  const STANCE = {
    "팔고 있음": "sell", "사고 있음": "buy", "더 팔 수 있음": "maysell",
    "더 살 수 있음": "maybuy", "평소 수준": "norm", "판정 안 함": "none",
  };
  const stCls = (s) => "po-st-" + (STANCE[s] || "none");
  const pill = (s) => `<span class="po-pill ${stCls(s)}">${esc(s || "판정 안 함")}</span>`;
  const lvlCls = (l) => (/높음/.test(l || "") ? "sell" : /낮음/.test(l || "") ? "buy" : /보통/.test(l || "") ? "maysell" : "none");

  const ds = (name) => ((st.data && st.data.datasets) || {})[name] || [];
  const sec = (id, title, sub, body, extra = "") =>
    `<section class="po-sec ${extra}" id="${id}"><div class="po-sh"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${body}</section>`;
  const more = (label, body, open = false) => `<details class="po-more"${open ? " open" : ""}><summary>${label}</summary><div class="po-more-b">${body}</div></details>`;
  const terms = (...keys) => {
    const g = ds("glossary").filter((x) => keys.includes(x.sec));
    if (!g.length) return "";
    return more(`📘 이 부분에 나오는 말 ${g.length}개`, `<dl class="po-dl">${g.map((x) => `<dt>${esc(x.term)}</dt><dd>${esc(x.def)}</dd>`).join("")}</dl>`);
  };

  // ---------- 1. 맨 위: 결론 ----------
  function hero() {
    const art = ds("article");
    const head = (art.find((r) => r.part === "headline") || {}).text || "";
    const dek = (art.find((r) => r.part === "dek") || {}).text || "";
    const basis = st.data.basis_date, next = st.data.next_update, today = todayKST();
    const age = days(basis, today);
    const late = next && today > next;
    const ageTxt = age <= 0 ? "오늘 갱신" : `${age}일 전 숫자`;
    return `<header class="po-hero">
      <div class="po-stamp${late ? " po-late" : ""}">
        <b>${esc(mdw(basis))} 기준</b><span>${ageTxt}</span><span>매주 수요일 오후 1시쯤 갱신 · 다음 ${esc(mdw(next))}</span>
        ${late ? "<span class=\"po-warnline\">이번 주 갱신이 아직 들어오지 않았습니다. 지난주 숫자입니다.</span>" : ""}
      </div>
      <p class="po-kicker">스마트머니 포지셔닝 · 주가 뒤에서 누가 팔고, 누가 살 수 있나</p>
      <h1 class="po-h1">${esc(head)}</h1>
      <p class="po-dek">${esc(dek)}</p>
    </header>`;
  }

  // ---------- 2. 이번 주 판정(투자자 3곳) ----------
  function verdict() {
    const v = ds("verdict");
    const rows = v.map((r) => `<li class="${stCls(r.level)}"><div class="po-vtop"><b class="po-vwho">${esc(r.group)}</b>${pill(r.level)}</div><p>${esc(r.note || "")}</p></li>`).join("");
    const w = ds("weekly"), last = w[w.length - 1] || {};
    const total = last.total_level ? `<div class="po-total"><span>쏠림 종합</span><b class="po-lv-${lvlCls(last.total_level)}">${esc(last.total_level)}</b><small>펀드매니저 ${esc(last.fm_level || "판정 안 함")} · CTA ${esc(last.cta_level || "판정 안 함")}</small></div>` : "";
    return sec("po-sec-now", "이번 주 판정", "주요 투자자가 지금 무엇을 하고 있나", `<ul class="po-verdict">${rows}</ul>${total}`, "po-card");
  }

  // ---------- 3. 가격 사다리 ----------
  function ladder() {
    const w = ds("weekly"), last = w[w.length - 1] || {};
    let L = ds("levels").slice();
    if (!L.length && last.cta_mid != null) {
      const spx = num(last.spx);
      const d = (p) => (spx ? Math.round((p / spx - 1) * 1000) / 10 : null);
      L = [
        { label: "단기 트리거", price: last.cta_short, who: "골드만삭스", basis: "지수", kind: "sell", dist: d(last.cta_short), what: "이 아래에서는 CTA가 일부 매도합니다." },
        { label: "중기 트리거", price: last.cta_mid, who: "골드만삭스", basis: "지수", kind: "sell", dist: d(last.cta_mid), what: "이 아래로 내려가면 CTA 매도가 본격화합니다." },
        { label: "장기 트리거", price: last.cta_long, who: "골드만삭스", basis: "지수", kind: "deep", dist: d(last.cta_long), what: "이 아래로 내려가면 CTA 매도가 가장 커집니다." },
      ].filter((x) => x.price != null);
    }
    if (!L.length || last.spx == null) return "";
    const now = { now: true, price: num(last.spx) };
    const all = L.map((x) => ({ ...x, price: num(x.price) })).concat([now]).sort((a, b) => b.price - a.price);
    const rows = all.map((x) => {
      if (x.now) return `<li class="po-lad-now"><span class="po-lad-p">${f2.format(x.price)}</span><span class="po-lad-t"><b>지금 S&amp;P500</b><small>${esc(md(last.price_date || last.date))} 종가</small></span><span class="po-lad-d">◀ 현재</span></li>`;
      const d = num(x.dist);
      const dTxt = d == null ? "" : d > 0 ? `${f1.format(d)}% 위` : d < 0 ? `${f1.format(-d)}% 아래` : "지금 가격";
      return `<li class="po-lad-${x.kind}"><span class="po-lad-p">${f0.format(x.price)}</span><span class="po-lad-t"><b>${esc(x.label)}</b><small>${esc([x.who, x.basis].filter(Boolean).join(" · "))}</small>${x.what ? `<em>${esc(x.what)}</em>` : ""}</span><span class="po-lad-d">${dTxt}</span></li>`;
    }).join("");
    const mixed = L.some((x) => x.basis === "선물") && L.some((x) => x.basis === "지수");
    const foot = mixed ? "<p class=\"po-foot\">'선물' 가격은 S&amp;P500 선물 기준이고 거리도 선물 가격과 비교했습니다. 선물은 지수보다 보통 수십 포인트 높게 거래됩니다.</p>" : "";
    return sec("po-sec-ladder", "S&amp;P500은 지금 어디에 있나", "은행이 계산한 CTA 매매 가격과 지금 주가의 거리",
      `<ol class="po-ladder">${rows}</ol>
       <div class="po-key"><span class="po-k-buy">매수로 돌아서는 가격</span><span class="po-k-stop">매도가 멈추는 가격</span><span class="po-k-sell">매도가 시작·확대되는 가격</span></div>${foot}${terms("cta")}`, "po-card");
  }

  // ---------- 4. 투자자별 카드 ----------
  function parts() {
    const P = ds("participants");
    const order = ["팔고 있음", "더 팔 수 있음", "사고 있음", "더 살 수 있음", "평소 수준", "판정 안 함"];
    const P2 = P.slice().sort((a, b) => order.indexOf(a.stance) - order.indexOf(b.stance));
    const cnt = order.map((s) => [s, P.filter((p) => p.stance === s).length]).filter((x) => x[1]);
    const sum = `<div class="po-tally">${cnt.map(([s, n]) => `<span class="${stCls(s)}"><b>${n}</b>${esc(s)}</span>`).join("")}</div>`;
    const cards = P2.map((p) => `<article class="po-pc ${stCls(p.stance)}">
        <div class="po-pc-top"><h3>${esc(p.who)}</h3>${pill(p.stance)}</div>
        <div class="po-pc-now">${esc(p.now)}</div>
        <div class="po-pc-m">${esc(p.metric)}</div>
        ${p.change ? `<p class="po-pc-ch">${esc(p.change)}</p>` : ""}
        ${more("왜 이렇게 보나", `<p>${esc(p.read)}</p>`)}
      </article>`).join("");
    const legend = more("상태 표시는 이렇게 읽습니다", `<dl class="po-dl">
        <dt>${pill("팔고 있음")} ${pill("사고 있음")}</dt><dd>이번 주에 실제로 사거나 판 것으로 추정되는 쪽입니다.</dd>
        <dt>${pill("더 팔 수 있음")}</dt><dd>아직 판다는 자료는 없지만 이미 많이 사 둬서, 주가가 흔들리면 매물이 나올 수 있는 쪽입니다.</dd>
        <dt>${pill("더 살 수 있음")}</dt><dd>주식을 이미 줄였거나 현금이 많아, 시장이 안정되면 매수에 나설 수 있는 쪽입니다.</dd>
        <dt>${pill("평소 수준")}</dt><dd>지난 기록과 비교해 특별한 쏠림이 없는 쪽입니다.</dd>
        <dt>${pill("판정 안 함")}</dt><dd>자료가 오래돼 지금 상태를 말할 수 없는 쪽입니다.</dd></dl>`);
    return sec("po-sec-participants", "누가 팔고, 누가 살 수 있나", `투자자 ${P.length}곳의 지금 상태와 근거 숫자`, sum + `<div class="po-pcs">${cards}</div>` + legend + terms("parts"));
  }

  // ---------- 5. 주가 방향별 CTA 예상 매매 ----------
  function flows() {
    const F = ds("flows");
    if (!F.length) return "";
    const scopes = [...new Set(F.map((r) => r.scope))];
    const max = Math.max(1, ...F.flatMap((r) => [Math.abs(num(r.w1) || 0), Math.abs(num(r.m1) || 0)]));
    const bar = (v) => {
      if (v == null) return `<div class="po-bar po-bar-na">자료 없음</div>`;
      const w = Math.max(2, (Math.abs(v) / max) * 100);
      return `<div class="po-bar ${v < 0 ? "po-bar-s" : "po-bar-b"}"><i style="width:${w.toFixed(1)}%"></i><span>${flowTxt(v)}</span></div>`;
    };
    const SC = ["상승", "횡보", "하락"];
    const blocks = scopes.map((s) => {
      const rows = SC.map((k) => F.find((r) => r.scope === s && r.scenario === k)).filter(Boolean);
      return `<div class="po-flow"><h3>${esc(s)}</h3>
        ${rows.map((r) => `<div class="po-flow-r"><b>주가 ${esc(r.scenario)}</b><div class="po-flow-bs"><div><small>앞으로 1주</small>${bar(num(r.w1))}</div><div><small>앞으로 1개월</small>${bar(num(r.m1))}</div></div></div>`).join("")}</div>`;
    }).join("");
    const w = ds("weekly"), last = w[w.length - 1] || {};
    const src = last.cta_src_date ? `골드만삭스 추정(${md(last.cta_src_date)} 무렵 계산)` : "골드만삭스 추정";
    return sec("po-sec-flows", "주가가 움직이면 CTA는 얼마나 사고파나", `${src} · 빨강은 매도, 초록은 매수`, `<div class="po-flows">${blocks}</div>`, "po-card");
  }

  // ---------- 6. 주별 흐름 ----------
  function weekly() {
    const w = ds("weekly").slice().reverse();
    if (!w.length) return "";
    const max = Math.max(1, ...w.map((r) => Math.abs(num(r.w1_flat) || 0)));
    const rows = w.map((r, i) => {
      const spx = num(r.spx), mid = num(r.cta_mid), fl = num(r.w1_flat);
      const gap = spx && mid ? Math.round((spx / mid - 1) * 1000) / 10 : null;
      const gapTxt = gap == null ? "트리거 자료 없음" : `중기 트리거보다 ${f1.format(Math.abs(gap))}% ${gap >= 0 ? "위" : "아래"}`;
      const bw = fl == null ? 0 : Math.max(2, (Math.abs(fl) / max) * 100);
      return `<li>
        <div class="po-wk-h"><b>${esc(md(r.date))}</b><span class="po-wk-tags">${r.cta_level ? `<span class="po-tag po-lv-${lvlCls(r.cta_level)}">CTA 쏠림 ${esc(r.cta_level)}</span>` : ""}${r.fm_level ? `<span class="po-tag po-lv-${lvlCls(r.fm_level)}">펀드매니저 ${esc(r.fm_level)}</span>` : ""}${r.total_level ? `<span class="po-tag po-lv-${lvlCls(r.total_level)}">종합 ${esc(r.total_level)}</span>` : ""}</span></div>
        <div class="po-wk-n"><span>S&amp;P500 ${spx == null ? "—" : f2.format(spx)}</span><span class="${gap != null && gap < 0 ? "po-neg" : ""}">${gapTxt}</span></div>
        <div class="po-bar ${fl == null ? "po-bar-na" : fl < 0 ? "po-bar-s" : "po-bar-b"}">${fl == null ? "1주 예상 매매 자료 없음" : `<i style="width:${bw.toFixed(1)}%"></i><span>횡보 시 1주 ${flowTxt(fl)}</span>`}</div>
        ${r.record ? `<p>${esc(r.record)}</p>` : ""}
        ${i === 0 && r.note ? `<p class="po-wk-note">메모: ${esc(r.note)}</p>` : ""}
      </li>`;
    }).join("");
    return sec("po-sec-weekly", "주별 흐름", "위가 이번 주입니다. 막대는 주가가 횡보할 때 CTA의 1주 예상 매매(골드만삭스)", `<ol class="po-wk">${rows}</ol>${terms("flow-cta")}`, "po-card");
  }

  // ---------- 7. 펀드매니저 설문 ----------
  function fms() {
    const F = ds("fms"), M = ds("fms_monthly").slice().reverse();
    const lead = F.find((r) => r.item === "한눈에");
    const items = F.filter((r) => r.item !== "한눈에");
    const cash = items.find((r) => r.item === "현금 비중");
    let gauge = "";
    if (cash && num(cash.value) != null) {
      const lo = 3, hi = 6, x = (v) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
      const v = num(cash.value), p = num(cash.prev);
      gauge = `<div class="po-gauge"><div class="po-g-track"><span class="po-g-sell" style="width:${x(4)}%">매도 신호</span><span class="po-g-mid" style="width:${x(5) - x(4)}%">중간</span><span class="po-g-buy" style="width:${100 - x(5)}%">매수 신호</span></div>
        ${p != null ? `<i class="po-g-prev" style="left:${x(p)}%"></i>` : ""}
        <i class="po-g-now" style="left:${x(v)}%"><em>지금 ${f1.format(v)}%</em></i>
        <div class="po-g-ax"><span>3%</span><span style="left:${x(4)}%">4.0%</span><span style="left:${x(5)}%">5.0%</span><span style="right:0;left:auto">6%</span></div>
        <div class="po-g-leg"><span><i class="po-g-k-now"></i>지금 ${f1.format(v)}%</span>${p != null ? `<span><i class="po-g-k-prev"></i>${esc(cash.prev_label || "이전")} ${f1.format(p)}%</span>` : ""}<span>4.0% 이하 매도 신호 · 5.0% 이상 매수 신호(BofA 기준)</span></div></div>`;
    }
    const val = (r) => (typeof r.value === "number" ? `${f1.format(r.value).replace(/\.0$/, "")}${esc(r.unit || "")}` : esc(r.value || "—"));
    const prv = (r) => (r.prev == null ? "" : `${esc(r.prev_label || "이전")} ${typeof r.prev === "number" ? f1.format(r.prev).replace(/\.0$/, "") + esc(r.unit || "") : esc(r.prev)}`);
    const tiles = items.map((r) => `<article class="po-ft">
        <h3>${esc(r.item)}</h3><div class="po-ft-v">${val(r)}</div>${prv(r) ? `<div class="po-ft-p">${prv(r)}</div>` : ""}
        ${r.meaning ? `<p>${esc(r.meaning)}</p>` : ""}
        ${more("자세히", [["무슨 숫자인가", r.what], ["시장은 어떻게 반응하나", r.market], ["조심할 점", r.caution], ["다음 설문에서 볼 것", r.chance]].filter((x) => x[1]).map(([k, t]) => `<h4>${k}</h4><p>${esc(t)}</p>`).join(""))}
      </article>`).join("");
    const table = M.length ? `<div class="po-tw"><table class="po-t"><thead><tr><th>설문</th><th>현금 비중</th><th>기술주(늘림−줄임)</th><th>돈이 가장 쏠린 곳</th></tr></thead><tbody>${M.map((r) => `<tr><td>${esc(ym(r.month))}</td><td class="${num(r.cash) != null && r.cash <= 4 ? "po-neg" : ""}">${r.cash == null ? "—" : f1.format(r.cash) + "%"}</td><td>${r.tech_net == null ? "—" : sgn(r.tech_net, f0.format) + "%p"}</td><td>${r.crowded ? esc(r.crowded) + (r.crowded_pct != null ? " " + r.crowded_pct + "%" : "") : "—"}</td></tr>`).join("")}</tbody></table></div>` : "";
    const eq = M.some((r) => r.equity_net != null) ? `<p class="po-foot">주식 전체 비중(늘림−줄임): ${M.filter((r) => r.equity_net != null).map((r) => `${ym(r.month)} ${sgn(r.equity_net, f0.format)}%p`).join(", ")}.</p>` : "";
    const guide = more("다음 설문이 나오면 이렇게 읽습니다", `<dl class="po-dl">
      <dt>현금 비중이 4.0% 위로 올라오고, 쏠린 곳의 응답 비율도 줄었다</dt><dd>매물이 상당 부분 소화됐고 쏠림이 풀리고 있습니다. 주가가 진정되는지, CTA 매도가 멈추는지를 함께 확인합니다.</dd>
      <dt>현금 비중이 여전히 4.0% 이하이고, 쏠린 곳과 비율도 그대로다</dt><dd>급락을 겪고도 덜 판 상태입니다. 반등이 나와도 매물이 다시 나오기 쉽습니다.</dd>
      <dt>현금 비중이 5.0% 이상으로 뛰었다</dt><dd>BofA 기준 매수 신호입니다. 비관이 지나치면 오히려 살 때라고 해석하지만, 신호 직후에도 주가가 더 내릴 수 있어 진정되는지를 확인하는 편이 안전합니다.</dd></dl>`);
    const latest = M[0];
    const sub = latest && latest.release ? `BofA 펀드매니저 설문(FMS) · ${esc(ym(latest.month))} 설문, ${esc(mdw(latest.release))} 발표` : "BofA 펀드매니저 설문(FMS) · 한 달에 한 번";
    return sec("po-sec-fms", "펀드매니저는 얼마나 사 뒀나", sub,
      `${lead && lead.meaning ? `<p class="po-lead">${esc(lead.meaning)}</p>` : ""}${gauge}<div class="po-fts">${tiles}</div>${table}${eq}${guide}${terms("fms", "flow-fms")}`);
  }

  // ---------- 8. 선물 포지션(CFTC) ----------
  function cftc() {
    const H = ds("cftc_history").slice();
    const w = ds("weekly"), last = w[w.length - 1] || {};
    if (!H.length && last.cftc_date == null) return "";
    if (last.cftc_date && !H.some((r) => r.date === last.cftc_date)) H.push({ date: last.cftc_date, spx_hf: last.spx_hf, spx_am: last.spx_am, nq_hf: last.nq_hf, nq_am: last.nq_am });
    H.sort((a, b) => (a.date < b.date ? -1 : 1));
    const prevRow = (k) => { for (let i = w.length - 2; i >= 0; i--) if (w[i][k] != null && w[i].cftc_date !== last.cftc_date) return w[i]; return null; };
    const ITEMS = [["nq_hf", "헤지펀드 · 나스닥100 선물"], ["spx_hf", "헤지펀드 · S&P500 선물"], ["spx_am", "자산운용사 · S&P500 선물"], ["nq_am", "자산운용사 · 나스닥100 선물"]];
    const cards = ITEMS.map(([k, name]) => {
      const vals = H.map((r) => num(r[k])).filter((v) => v != null);
      if (!vals.length) return "";
      const v = vals[vals.length - 1];
      const sorted = vals.slice().sort((a, b) => a - b);
      const pct = Math.round((sorted.filter((x) => x <= v).length / sorted.length) * 100);
      const med = sorted[Math.floor(sorted.length / 2)];
      const lo = sorted[0], hi = sorted[sorted.length - 1], x = (t) => (hi === lo ? 50 : ((t - lo) / (hi - lo)) * 100);
      const pr = prevRow(k), ch = pr && num(pr[k]) != null ? v - num(pr[k]) : null;
      const pts = vals.map((t, i) => `${((i / Math.max(1, vals.length - 1)) * 100).toFixed(1)},${(30 - (x(t) / 100) * 28 - 1).toFixed(1)}`).join(" ");
      const tone = pct >= 90 ? "po-hi" : pct <= 10 ? "po-lo" : "";
      const ctr = (t) => (t < 0 ? `${f0.format(-t)}계약 순매도` : `${f0.format(t)}계약 순매수`);
      return `<article class="po-cf ${tone}"><h3>${esc(name)}</h3>
        <div class="po-cf-v">${ctr(v)}</div>
        <div class="po-cf-pct"><b>지난 3년 중 ${pct}% 위치</b>${ch != null ? `<span>한 주 ${ch >= 0 ? "+" : "−"}${f0.format(Math.abs(ch))}계약</span>` : ""}</div>
        <div class="po-pbar"><i style="left:${x(med)}%" class="po-pmed"></i><i style="left:${x(v)}%" class="po-pnow"></i></div>
        <div class="po-pax"><span>3년 최저</span><span>중간값 ${f0.format(Math.round(med))}</span><span>최고</span></div>
        <svg class="po-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="100" y1="${(30 - (x(med) / 100) * 28 - 1).toFixed(1)}" y2="${(30 - (x(med) / 100) * 28 - 1).toFixed(1)}" class="po-sp-med"/><polyline points="${pts}" class="po-sp-l"/></svg>
      </article>`;
    }).join("");
    const ty = last.ty_hf != null ? `<p class="po-foot">10년물 국채 선물: 헤지펀드 ${f0.format(last.ty_hf)}계약, 자산운용사 ${f0.format(last.ty_am)}계약(${esc(md(last.cftc_date))} 기준).</p>` : "";
    const first = H.length ? `${dt(H[0].date).getFullYear()}년 ${md(H[0].date)}` : "";
    return sec("po-sec-cftc", "선물 포지션, 지난 3년과 비교", `미국 선물 감독 기관(CFTC) 자료 · ${last.cftc_date ? esc(mdw(last.cftc_date)) + " 기준" : ""} · 3년 이력 ${esc(first)}부터 ${H.length}주`,
      `<p class="po-note">막대 위 진한 점이 지금 값, 흐린 선이 3년 중간값입니다. 90% 위면 평소보다 훨씬 많이 사 둔 것이고, 10% 아래면 훨씬 많이 판 것입니다. 헤지펀드의 S&amp;P500 선물은 평소에도 순매도라, 순매도 자체를 하락 베팅으로 보지 않습니다.</p><div class="po-cfs">${cards}</div>${ty}`);
  }

  // ---------- 9. 해설 ----------
  function article() {
    const A = ds("article");
    const lead = (A.find((r) => r.part === "lead") || {}).text;
    const S = A.filter((r) => r.part === "section");
    return sec("po-sec-story", "해설: 왜 이렇게 됐고, 앞으로는", "소제목을 누르면 본문이 펼쳐집니다",
      `${lead ? `<p class="po-lead">${esc(lead)}</p>` : ""}<div class="po-story">${S.map((r, i) => more(esc(r.title), paras(r.text), i === 0)).join("")}</div>${terms("story")}`);
  }

  // ---------- 10. 일정 · 주의 · 참고 ----------
  function calendar() {
    const C = ds("calendar");
    if (!C.length) return "";
    return sec("po-sec-next", "다음에 볼 것", "언제 무엇을 확인하나", `<ul class="po-cal">${C.map((r) => `<li><div class="po-cal-w">${esc(r.when)}</div><div><b>${esc(r.what)}</b>${r.why ? `<p>${esc(r.why)}</p>` : ""}</div></li>`).join("")}</ul>`, "po-card");
  }
  function notes() {
    const N = ds("notes");
    if (!N.length) return "";
    return `<section class="po-notes" id="po-sec-notes"><h2>⚠️ 이 숫자를 읽을 때 주의할 점 ${N.length}가지</h2>${N.map((n) => more(esc(n.title), `<p>${esc(n.text)}</p>`)).join("")}</section>`;
  }
  function refs() {
    const G = ds("glossary"), SRC = ds("sources"), w = ds("weekly"), M = ds("fms_monthly");
    const last = w[w.length - 1] || {}, lm = M[M.length - 1] || {};
    const sched = `<div class="po-tw"><table class="po-t"><thead><tr><th>자료</th><th>발표</th><th>지금 들어 있는 값</th></tr></thead><tbody>
      <tr><td>CTA 추정(은행)</td><td>은행이 수시로, 기사로 알려질 때</td><td>${last.cta_src_date ? esc(md(last.cta_src_date)) + " 무렵 계산" : "—"}</td></tr>
      <tr><td>CFTC 선물 자료</td><td>매주 금요일 오후(한국 토요일 새벽), 화요일 기준</td><td>${last.cftc_date ? esc(md(last.cftc_date)) + " 기준" : "—"}</td></tr>
      <tr><td>BofA 펀드매니저 설문</td><td>한 달에 한 번, 보통 중순 화요일</td><td>${lm.month ? esc(ym(lm.month)) + " 설문" : "—"}</td></tr>
      <tr><td>AAII 개인투자자 설문</td><td>매주 목요일</td><td>${last.aaii_bear != null ? "약세 응답 " + f1.format(last.aaii_bear) + "%" : "—"}</td></tr>
      <tr><td>지수 종가</td><td>매 거래일</td><td>${last.price_date ? esc(md(last.price_date)) + " 종가" : "—"}</td></tr></tbody></table></div>`;
    const rules = `<dl class="po-dl">
      <dt>이 화면을 보는 이유</dt><dd>다른 탭은 주가가 어떻게 움직였는지를 보여 줍니다. 이 탭은 그 뒤에서 누가 주식을 얼마나 사 뒀고, 누가 지금 팔고 있고, 누가 더 살 돈이 있는지를 봅니다. 같은 하락이라도 팔 사람이 많이 남아 있으면 길어지고, 이미 다 팔았으면 빨리 끝나는 경우가 많기 때문입니다.</dd>
      <dt>팔고 있음 · 사고 있음</dt><dd>은행이 추정한 CTA의 다음 1주 매매가 매도면 '팔고 있음', 매수면 '사고 있음'입니다. 은행 추정이 엇갈리면 더 최근 추정을 씁니다.</dd>
      <dt>더 팔 수 있음</dt><dd>선물 순매수가 지난 3년 중 90% 위치를 넘거나, 새 설문에서 펀드매니저 현금 비중이 4.0% 이하일 때입니다.</dd>
      <dt>더 살 수 있음</dt><dd>헤지펀드 순 레버리지가 최근 몇 년 중 낮을 때, 개인 비관 응답이 장기 평균보다 10%p 넘게 높을 때, 선물 순매수가 3년 중 10% 위치에 못 미칠 때, 새 설문에서 현금 비중이 5% 이상일 때입니다.</dd>
      <dt>평소 수준 · 판정 안 함</dt><dd>위 어디에도 들지 않으면 평소 수준입니다. 펀드매니저 설문은 발표 후 14일이 지나면 판정하지 않습니다.</dd>
      <dt>참고</dt><dd>판정은 보고서 숫자를 위 기준에 맞춰 본 것으로, 매매 권유가 아닙니다.</dd></dl>`;
    const gl = `<dl class="po-dl">${G.map((x) => `<dt>${esc(x.term)}</dt><dd>${esc(x.def)}</dd>`).join("")}</dl>`;
    const src = `<ol class="po-src">${SRC.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}${s.date ? ` <small>${esc(s.date)}</small>` : ""}</li>`).join("")}</ol>`;
    return `<section class="po-sec po-refs" id="po-sec-refs"><div class="po-sh"><h2>참고</h2></div>
      ${more("자료가 나오는 날", sched)}${more("판정 기준", rules)}${more(`용어 풀이 전체(${G.length}개)`, gl)}${more(`출처(${SRC.length}건)`, src)}</section>`;
  }

  function render() {
    const el = host();
    el.innerHTML = `<div id="po">
      ${hero()}
      <div class="po-g2">${verdict()}${ladder()}</div>
      ${notes()}
      ${parts()}
      <div class="po-g2">${flows()}${weekly()}</div>
      ${fms()}
      ${cftc()}
      ${article()}
      ${calendar()}
      ${refs()}
    </div>`;
  }

  async function show() {
    const el = host();
    if (!st.built) {
      if (!st.loading) st.loading = fetch("data/positioning.json?v=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });
      try { st.data = await st.loading; }
      catch (e) { st.loading = null; el.innerHTML = '<div id="po"><p class="po-fail">포지셔닝 자료를 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.</p></div>'; return; }
      try { render(); } catch (e) { console.error("positioning", e); el.innerHTML = '<div id="po"><p class="po-fail">화면을 그리지 못했습니다.</p></div>'; return; }
      st.built = true;
    }
  }
  window.__positioning = { show };
})();
