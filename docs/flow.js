/* 산업 흐름: 강도가 어디서 빠져 어디로 옮겨가는지 한눈에 (2026-10-23)
   - 한 줄 결론: 약해지는 분류 → 강해지는 분류, 강해진 산업 중 가격 추세도 살아 있는 비율
   - 로테이션 지도: 가로 = 지금 강도, 세로 = 기간 동안 강도 변화, 꼬리 = 최근 8거래일 이동
   - 큰 분류 흐름: 분류 안 세부 산업 순위 백분위 평균(5일 평균)의 40거래일 선
   - 순위 이동: 기간 전 자리(빈 점) → 지금 자리(찬 점). 오른쪽 끝이 1위 */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const md = (s) => { const [, m, dd] = s.split("-"); return `${+m}/${+dd}`; };
  const WEAK = ["상승 둔화", "하락 추세", "바닥 다지기"];
  const ALIVE = ["상승 추세", "상승 전환 시도"];
  const SMOOTH = 5, TAIL = 8, RISE_N = 10, FALL_N = 8, FLAT = 3;
  const st = { k: 20, d: null, alive: false, open: new Set() };
  // 어떤 기간을 골라도 20·60·200일 변화는 늘 같이 보여 준다(짧은 흐름이 긴 기간에 묻히지 않게)
  const ALSO = [20, 60, 200];

  // 순위 → 백분위(1위=100, 꼴찌=0)
  const pct = (r, n) => r == null || n < 2 ? null : (1 - (r - 1) / (n - 1)) * 100;
  const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const smooth = (a, w) => a.map((_, k) => mean(a.slice(Math.max(0, k - w + 1), k + 1)));
  // 5일은 다듬지 않은 그대로(시작점이 정확히 5일 전), 긴 기간일수록 길게 다듬어 잔물결을 줄인다
  const smoothOf = (k) => k >= 200 ? 20 : k >= 60 ? 10 : k >= 20 ? SMOOTH : 1;
  // 5일은 하루하루가 들쭉날쭉해서 꼬리를 짧게(최근 3일)
  const tailOf = (k) => k <= 5 ? 4 : Math.min(TAIL, k + 1);
  const dir = (v) => v == null || Math.abs(v) < FLAT ? "flat" : v > 0 ? "up" : "down";

  // ---------- 큰 분류별 강도 선
  function groupFlow(d) {
    const H = d.history, n = d.n, T = H.dates.length, k = st.k;
    // 선 길이는 비교 기간이 보이도록 최소 40거래일, 길면 기간+10거래일
    // 긴 기간일수록 더 길게 다듬어 잔물결을 줄인다(5·20일 5일, 60일 10일, 200일 20일 평균)
    // 선은 정확히 고른 기간 전부터 지금까지
    const len = k + 1, sw = smoothOf(k), span = Math.max(len, k + tailOf(k)) + sw;
    const by = {};
    for (const it of d.items) (by[it.group] || (by[it.group] = [])).push(it);
    return Object.entries(by).map(([g, list]) => {
      const raw = [];
      for (let t = 0; t < T; t++) raw.push(mean(list.map((it) => pct((H.rank[it.id] || [])[t], n))));
      const sm = smooth(raw, sw).slice(-span);
      // 기간별 변화는 그 기간에 맞는 평균으로 따로 계산(200일을 골라도 20일 변화가 20일 평균에 묻히지 않게)
      const per = {};
      for (const P of new Set([...ALSO, k])) {
        const sp = smooth(raw, smoothOf(P)), a = sp.at(-1), b = sp[sp.length - 1 - P];
        per[P] = a == null || b == null ? null : a - b;
      }
      const at = (j) => sm[sm.length - 1 - j];
      const tail = [];
      for (let j = tailOf(k) - 1; j >= 0; j--) {
        const x = at(j), b = at(j + k);
        if (x != null && b != null) tail.push({ x, y: x - b });
      }
      const now = at(0), then = at(k);
      return { g, n: list.length, line: sm.slice(-len), now, delta: now == null || then == null ? null : now - then, tail, per,
        top: list.filter((it) => it.rank != null && it.rank <= d.top_cut).length };
    }).filter((g) => g.now != null).sort((a, b) => (b.delta ?? -1e9) - (a.delta ?? -1e9));
  }

  // ---------- 세부 산업 순위 이동
  function moves(d) {
    const H = d.history, T = H.dates.length, k = st.k;
    return d.items.filter((it) => it.rank != null && !it.stale).map((it) => {
      const seq = H.rank[it.id] || [];
      const was = seq[T - 1 - k];
      const per = {};
      for (const P of ALSO) { const r = seq[T - 1 - P]; per[P] = r == null ? null : r - it.rank; }
      return { it, was, now: it.rank, chg: was == null ? null : was - it.rank, per };
    }).filter((m) => m.chg != null);
  }

  // ---------- 한 줄 결론
  function headline(gf, rise) {
    const ups = gf.filter((g) => g.delta >= FLAT).slice(0, 3);
    const dns = gf.filter((g) => g.delta <= -FLAT).slice(-3).reverse();
    const chip = (g, c) => `<button class="fl-chip ${c}" type="button" data-group="${esc(g.g)}">${esc(g.g)}<b>${g.delta > 0 ? "▲" : "▼"}${Math.abs(Math.round(g.delta))}</b></button>`;
    const side = (list, c, none) => list.length ? list.map((g) => chip(g, c)).join("") : `<span class="fl-none">${none}</span>`;
    const alive = rise.filter((m) => ALIVE.includes(m.it.stage)).length;
    const r = rise.length ? alive / rise.length : 0;
    const q = !rise.length ? ""
      : r >= 0.5 ? `<p class="fl-q good">강해진 세부 산업 ${rise.length}개 중 <b>${alive}개</b>는 가격 추세도 살아 있어요 → 실제 돈이 들어가는 <b>진짜 강세</b>에 가까워요.</p>`
      : alive ? `<p class="fl-q mid">강해진 세부 산업 ${rise.length}개 중 가격 추세까지 살아 있는 곳은 <b>${alive}개</b>뿐이에요 → 순환 초입일 수 있으니 <b>추세↑</b> 표시부터 보세요.</p>`
      : `<p class="fl-q warn">강해진 세부 산업 ${rise.length}개 모두 가격 추세는 아직 약해요 → 오른 게 아니라 <b>덜 빠져서</b> 순위가 오른 순환일 수 있어요.</p>`;
    return `<div class="fl-head">
      <div class="fl-side"><span class="fl-lab">힘이 빠지는 곳</span><div class="fl-chips">${side(dns, "down", "뚜렷한 곳 없음")}</div></div>
      <div class="fl-arrow" aria-hidden="true">→</div>
      <div class="fl-side"><span class="fl-lab">힘이 몰리는 곳</span><div class="fl-chips">${side(ups, "up", "뚜렷한 곳 없음")}</div></div>
    </div>${q}`;
  }

  // ---------- 로테이션 지도 (SVG)
  function rotationMap(gf, W) {
    const H = Math.round(Math.max(290, Math.min(480, W * 0.86)));
    const P = { l: 30, r: 12, t: 12, b: 26 };
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const ymax = Math.max(10, Math.ceil(Math.max(...gf.flatMap((g) => g.tail.map((p) => Math.abs(p.y)))) / 10) * 10);
    const X = (x) => P.l + (x / 100) * iw, Y = (y) => P.t + ih / 2 - (y / ymax) * (ih / 2);
    const fs = W < 420 ? 11.5 : 12.5;
    const colorOf = (p) => p.y >= FLAT ? (p.x >= 50 ? "var(--up)" : "var(--fl-rise)") : p.y <= -FLAT ? (p.x >= 50 ? "var(--down)" : "var(--muted)") : "var(--ink-2)";
    let s = `<svg class="fl-map" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="큰 분류 로테이션 지도">`;
    // 사분면 배경과 이름
    s += `<rect x="${X(50)}" y="${P.t}" width="${iw / 2}" height="${ih / 2}" class="q-lead"/>
      <rect x="${P.l}" y="${P.t}" width="${iw / 2}" height="${ih / 2}" class="q-rise"/>
      <rect x="${X(50)}" y="${Y(0)}" width="${iw / 2}" height="${ih / 2}" class="q-fade"/>
      <line x1="${P.l}" x2="${W - P.r}" y1="${Y(0)}" y2="${Y(0)}" class="ax"/>
      <line x1="${X(50)}" x2="${X(50)}" y1="${P.t}" y2="${P.t + ih}" class="ax"/>
      <text x="${W - P.r - 6}" y="${P.t + 15}" text-anchor="end" class="qn lead">주도 · 강하고 더 강해짐</text>
      <text x="${P.l + 6}" y="${P.t + 15}" class="qn rise">부상 · 약하지만 강해지는 중</text>
      <text x="${W - P.r - 6}" y="${P.t + ih - 7}" text-anchor="end" class="qn">식는 중 · 강하지만 약해짐</text>
      <text x="${P.l + 6}" y="${P.t + ih - 7}" class="qn">소외 · 약하고 더 약해짐</text>
      <text x="${P.l}" y="${H - 8}" class="tk">← 지금 약함</text>
      <text x="${W - P.r}" y="${H - 8}" text-anchor="end" class="tk">지금 강함 →</text>
      <text x="${P.l - 6}" y="${Y(ymax) + 9}" text-anchor="end" class="tk">+${ymax}</text>
      <text x="${P.l - 6}" y="${Y(0) + 4}" text-anchor="end" class="tk">0</text>
      <text x="${P.l - 6}" y="${Y(-ymax)}" text-anchor="end" class="tk">−${ymax}</text>`;
    // 꼬리 → 점 → 이름 (이름은 겹치지 않게 자리 고르기)
    const fq = 11, qw = (t) => [...t].reduce((a, ch) => a + (/[가-힣]/.test(ch) ? fq * 0.98 : fq * 0.56), 0);
    const q1 = qw("주도 · 강하고 더 강해짐"), q2 = qw("부상 · 약하지만 강해지는 중"), q3 = qw("식는 중 · 강하지만 약해짐"), q4 = qw("소외 · 약하고 더 약해짐");
    const placed = [
      { x0: W - P.r - 6 - q1, x1: W - P.r - 6, y0: P.t + 4, y1: P.t + 18 },
      { x0: P.l + 6, x1: P.l + 6 + q2, y0: P.t + 4, y1: P.t + 18 },
      { x0: W - P.r - 6 - q3, x1: W - P.r - 6, y0: P.t + ih - 18, y1: P.t + ih - 4 },
      { x0: P.l + 6, x1: P.l + 6 + q4, y0: P.t + ih - 18, y1: P.t + ih - 4 },
    ];
    const dots = gf.map((g) => { const p = g.tail.at(-1); return { g, cx: X(p.x), cy: Y(p.y), c: colorOf(p) }; });
    dots.forEach((o) => placed.push({ x0: o.cx - 5, x1: o.cx + 5, y0: o.cy - 5, y1: o.cy + 5 }));
    const textW = (t) => [...t].reduce((a, ch) => a + (/[가-힣]/.test(ch) ? fs * 0.98 : fs * 0.56), 0);
    const hit = (b) => placed.reduce((a, o) => a + Math.max(0, Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0)) * Math.max(0, Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0)), 0);
    let tails = "", marks = "", labels = "";
    for (const o of dots) {
      const pts = o.g.tail.map((p) => [X(p.x), Y(p.y)]);
      for (let j = 1; j < pts.length; j++) {
        const op = (0.12 + 0.6 * (j / (pts.length - 1))).toFixed(2);
        tails += `<line x1="${pts[j - 1][0].toFixed(1)}" y1="${pts[j - 1][1].toFixed(1)}" x2="${pts[j][0].toFixed(1)}" y2="${pts[j][1].toFixed(1)}" stroke="${o.c}" stroke-opacity="${op}" stroke-width="2.2" stroke-linecap="round"/>`;
      }
      const tw = textW(o.g.g), th = fs + 2;
      const cands = [
        { x: o.cx + 8, y: o.cy + fs * 0.36, a: "start", b: { x0: o.cx + 7, x1: o.cx + 9 + tw, y0: o.cy - th / 2, y1: o.cy + th / 2 } },
        { x: o.cx - 8, y: o.cy + fs * 0.36, a: "end", b: { x0: o.cx - 9 - tw, x1: o.cx - 7, y0: o.cy - th / 2, y1: o.cy + th / 2 } },
        { x: o.cx, y: o.cy - 9, a: "middle", b: { x0: o.cx - tw / 2, x1: o.cx + tw / 2, y0: o.cy - 9 - th + 2, y1: o.cy - 7 } },
        { x: o.cx, y: o.cy + 9 + fs * 0.8, a: "middle", b: { x0: o.cx - tw / 2, x1: o.cx + tw / 2, y0: o.cy + 7, y1: o.cy + 9 + th } },
      ].filter((c) => c.b.x0 >= 0 && c.b.x1 <= W && c.b.y0 >= 0 && c.b.y1 <= H);
      const best = cands.map((c) => ({ c, h: hit(c.b) })).sort((a, b) => a.h - b.h)[0];
      const tip = `${o.g.g} · 지금 강도 ${Math.round(o.g.now)} · ${st.k}일 동안 ${o.g.delta > 0 ? "+" : ""}${Math.round(o.g.delta)} · 상위 25% ${o.g.top}/${o.g.n}개`;
      marks += `<g class="fl-dot" data-group="${esc(o.g.g)}" tabindex="0" role="button" aria-label="${esc(tip)}"><title>${esc(tip)}</title><circle cx="${o.cx}" cy="${o.cy}" r="12" fill="transparent"/><circle cx="${o.cx}" cy="${o.cy}" r="5.5" fill="${o.c}" stroke="var(--surface)" stroke-width="2"/></g>`;
      if (best) {
        placed.push(best.c.b);
        labels += `<text x="${best.c.x.toFixed(1)}" y="${best.c.y.toFixed(1)}" text-anchor="${best.c.a}" class="lb" fill="${o.c}" style="font-size:${fs}px" data-group="${esc(o.g.g)}">${esc(o.g.g)}</text>`;
      }
    }
    return s + tails + marks + labels + `</svg>`;
  }

  // 선은 '시작점 대비 변화': 모든 분류가 같은 높이(가운데 선)에서 출발해 얼마나 오르내렸는지. 세로 폭은 모든 분류 공통
  function spark(line0, delta, amp) {
    const W = 120, H = 30, base = line0.find((x) => x != null);
    const line = line0.map((x) => x == null || base == null ? null : x - base);
    const xs = (k) => (k / (line.length - 1)) * W, ys = (x) => H / 2 - (x / amp) * (H / 2);
    let p = "", on = false;
    line.forEach((x, k) => { if (x == null) { on = false; return; } p += (on ? "L" : "M") + xs(k).toFixed(1) + " " + ys(x).toFixed(1); on = true; });
    const c = { up: "var(--up)", down: "var(--down)", flat: "var(--muted)" }[dir(delta)];
    const ly = line.at(-1) == null ? null : ys(line.at(-1));
    // 선 시작이 고른 기간 전이므로, 그보다 짧은 기간(20·60일 전)만 점선으로
    const marks = ALSO.filter((P) => P < line.length - 1)
      .map((P) => { const x = xs(line.length - 1 - P); return `<line x1="${x}" x2="${x}" y1="0" y2="${H}" class="fl-then"/>`; }).join("");
    return `<svg class="fl-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="fl-mid"/>
      ${marks}
      <path d="${p}" fill="none" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      ${ly == null ? "" : `<circle cx="${W}" cy="${ly}" r="2.6" fill="${c}"/>`}</svg>`;
  }

  function track(m, d) {
    const n = d.n, a = pct(m.was, n), b = pct(m.now, n), up = m.chg > 0;
    const cut = pct(d.top_cut + 0.5, n);
    return `<span class="fl-track ${up ? "up" : "dn"}${up && WEAK.includes(m.it.stage) ? " weak" : ""}" aria-hidden="true">
      <i class="fl-zone" style="left:${cut}%"></i>
      <i class="fl-seg" style="left:${Math.min(a, b)}%;width:${Math.abs(b - a)}%"></i>
      <i class="fl-was" style="left:${a}%"></i>
      <i class="fl-now" style="left:${b}%"></i></span>`;
  }

  function row(m, d) {
    const it = m.it, up = m.chg > 0;
    const tag = ALIVE.includes(it.stage) ? `<em class="fl-ok" title="가격도 ${esc(it.stage)}">추세↑</em>`
      : up ? `<em class="fl-warn" title="순위는 올랐지만 가격 추세는 아직 ${esc(it.stage)}예요. 덜 빠져서 오른 순위일 수 있어요.">가격↓</em>` : "";
    return `<button class="fl-row" type="button" data-id="${it.id}" aria-label="${esc(it.name)} ${m.was}위에서 ${m.now}위">
      <span class="fl-name"><b>${esc(it.name)}</b>${tag}<small>${esc(it.group)}${perLine(m.per, 0)}</small></span>
      ${track(m, d)}
      <span class="fl-rk"><small>${m.was}→</small><b>${m.now}위</b><span class="chg ${up ? "up" : "down"}">${up ? "▲" : "▼"}${Math.abs(m.chg)}</span></span>
    </button>`;
  }

  // 휴대폰에서는 앞(과 끝) 몇 줄만 보이고 나머지는 '더 보기'로 접는다. PC는 다 보인다.
  function fold(key, rows, keep, tailKeep = 0) {
    const n = rows.length;
    if (n <= keep + tailKeep + 1) return rows.join("");
    const open = st.open.has(key), mid = rows.slice(keep, n - tailKeep);
    const label = tailKeep ? `가운데 ${mid.length}개 더 보기` : `${mid.length}개 더 보기`;
    const btn = `<button class="fl-more" type="button" data-fold="${key}" data-label="${label}">${open ? "접기" : label}</button>`;
    return `<div class="fl-fold${open ? " open" : ""}">${rows.slice(0, keep).join("")}${tailKeep ? btn : ""}`
      + mid.map((r) => r.replace('<button class="', '<button class="fl-x ')).join("")
      + `${rows.slice(n - tailKeep).join("")}${tailKeep ? "" : btn}</div>`;
  }

  // 고른 기간 말고 나머지 기간(20·60·200일) 변화를 작게: 짧은 흐름과 긴 흐름이 같은 쪽인지 바로 보이게
  function perLine(per, flat) {
    const out = ALSO.filter((P) => P !== st.k && per[P] != null).map((P) => {
      const v = Math.round(per[P]), c = Math.abs(v) <= flat || v === 0 ? "flat" : v > 0 ? "up" : "down";
      return `<i class="${c}">${P}일 ${c === "up" ? "▲" : c === "down" ? "▼" : ""}${c === "flat" ? "–" : Math.abs(v)}</i>`;
    });
    return out.length ? `<span class="fl-per">${out.join("")}</span>` : "";
  }

  const scale = `<div class="fl-scale" aria-hidden="true"><span></span><span class="fl-axis"><em>← 하위</em><em>상위 25% · 1위 →</em></span><span></span></div>`;

  function render(d) {
    if (d) st.d = d;
    d = st.d;
    const el = $("#flow");
    if (!el || !d || !d.history || !d.history.rank) return;
    const T = d.history.dates.length;
    if (T <= st.k + smoothOf(st.k)) { el.innerHTML = `<p class="none">기록이 ${st.k}거래일보다 짧아서 아직 못 그려요.</p>`; return; }
    $("#flow-h .sub").textContent = `${md(d.history.dates[T - 1 - st.k])} → ${md(d.basis_date)} · ${st.k}거래일 동안`;

    const gf = groupFlow(d);
    const ms = moves(d);
    const riseAll = ms.filter((m) => m.chg > 0).sort((a, b) => b.chg - a.chg || a.now - b.now);
    const riseTop = riseAll.slice(0, RISE_N);
    const rise = (st.alive ? riseAll.filter((m) => ALIVE.includes(m.it.stage)) : riseAll).slice(0, RISE_N);
    // 밀려나는 쪽은 기간 시작 때 상위권(상위 25%)이던 산업 중에서만: 원래 약하던 산업이 더 약해진 건 흐름이 아님
    const fall = ms.filter((m) => m.chg < 0 && m.was <= d.top_cut).sort((a, b) => a.chg - b.chg).slice(0, FALL_N);

    const amp = Math.max(5, ...gf.map((g) => { const b = g.line.find((x) => x != null); return Math.max(...g.line.map((x) => x == null || b == null ? 0 : Math.abs(x - b))); })) * 1.08;
    const gRows = fold("g", gf.map((g) => {
      const c = dir(g.delta);
      return `<button class="fl-g" type="button" data-group="${esc(g.g)}" title="${esc(g.g)} · 상위 25% ${g.top}/${g.n}개 · 누르면 아래 순위표를 이 분류로 걸러요">
        <span class="fl-gn"><span class="fl-gt">${esc(g.g)} <em>${g.top}/${g.n}</em></span>${perLine(g.per, FLAT)}</span>
        ${spark(g.line, g.delta, amp)}
        <span class="fl-gv ${c}"><b>${Math.round(g.now)}</b><span>${g.delta == null ? "" : c === "up" ? "▲" + Math.round(g.delta) : c === "down" ? "▼" + Math.abs(Math.round(g.delta)) : Math.round(g.delta) === 0 ? "0" : (g.delta > 0 ? "+" : "−") + Math.abs(Math.round(g.delta))}</span></span></button>`;
    }), 4, 3);

    el.innerHTML = `${headline(gf, riseTop)}
      <div class="fl-top">
        <div class="fl-col">
          <h3>로테이션 지도 <span class="sub">큰 분류 · 꼬리 = 최근 ${tailOf(st.k) - 1}거래일 이동</span></h3>
          <div class="fl-map-wrap" id="flMap"></div>
        </div>
        <div class="fl-col">
          <h3>큰 분류 흐름 <span class="sub">선 = ${st.k}일 전을 가운데 선에 맞춘 변화${ALSO.some((P) => P < st.k) ? ` · 점선 = ${ALSO.filter((P) => P < st.k).join("·")}일 전` : ""} · 숫자 = 지금 강도와 ${st.k}일 변화</span></h3>
          <div class="fl-groups">${gRows}</div>
        </div>
      </div>
      <div class="fl-bottom">
        <div class="fl-col">
          <h3><span class="dot" style="color:var(--up)"></span>강해지는 세부 산업 <span class="sub">순위가 가장 많이 오른 순</span>
            <button class="toggle fl-alive" type="button" aria-pressed="${st.alive}" title="가격도 상승 추세·상승 전환 시도인 산업만">가격 추세 살아 있는 것만</button></h3>
          ${rise.length ? scale + fold("r", rise.map((m) => row(m, d)), 5) : `<p class="none">${st.alive ? "순위가 오른 산업 중 가격 추세까지 살아 있는 곳이 없어요." : "해당 없음"}</p>`}
        </div>
        <div class="fl-col">
          <h3><span class="dot" style="color:var(--down)"></span>밀려나는 세부 산업 <span class="sub">${st.k}일 전 상위 25%였던 산업 중</span></h3>
          ${fall.length ? scale + fold("f", fall.map((m) => row(m, d)), 4) : `<p class="none">상위권에서 밀린 산업이 없어요.</p>`}
        </div>
      </div>`;
    drawMap(gf);
    $$(".fl-row", el).forEach((b) => b.addEventListener("click", () => window.__isBoard && window.__isBoard().open(b.dataset.id)));
    $$("[data-group]", el).forEach((b) => {
      b.addEventListener("click", () => pickGroup(b.dataset.group));
      b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickGroup(b.dataset.group); } });
    });
    $$(".fl-more", el).forEach((b) => b.addEventListener("click", () => {
      const box = b.closest(".fl-fold"), k = b.dataset.fold;
      const open = box.classList.toggle("open");
      open ? st.open.add(k) : st.open.delete(k);
      b.textContent = open ? "접기" : b.dataset.label;
    }));
    $(".fl-alive", el).addEventListener("click", () => { st.alive = !st.alive; render(); });
  }

  let lastGf = null;
  function drawMap(gf) {
    lastGf = gf || lastGf;
    const box = $("#flMap");
    if (!box || !lastGf) return;
    const W = Math.max(280, Math.floor(box.clientWidth || 340));
    box.innerHTML = rotationMap(lastGf, W);
    $$("[data-group]", box).forEach((b) => {
      b.addEventListener("click", () => pickGroup(b.dataset.group));
      b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickGroup(b.dataset.group); } });
    });
  }

  // 분류를 누르면 세부 산업 순위표를 그 분류로 거르고 그리로 이동
  function pickGroup(g) {
    const sel = $("#groupSel");
    if (!sel || ![...sel.options].some((o) => o.value === g)) return;
    sel.value = g;
    sel.dispatchEvent(new Event("change"));
    const card = $("#rank-h");
    if (card) card.closest(".card").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $$("#flowSeg button").forEach((b) => b.addEventListener("click", () => {
    st.k = +b.dataset.k;
    $$("#flowSeg button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    render();
  }));
  let rz, lastW = innerWidth;
  addEventListener("resize", () => {
    if (innerWidth === lastW) return;
    lastW = innerWidth; clearTimeout(rz); rz = setTimeout(() => drawMap(), 150);
  });
  window.__flow = { render, redraw: () => drawMap() };
})();
