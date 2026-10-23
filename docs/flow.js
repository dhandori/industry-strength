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
      : r >= 0.5 ? `<p class="fl-q good">강해진 세부 산업 ${rise.length}개 중 <b>${alive}개</b>는 가격도 오르고 있어요 → 실제로 돈이 들어오는 <b>진짜 강세</b>에 가까워요.</p>`
      : alive ? `<p class="fl-q mid">강해진 세부 산업 ${rise.length}개 중 가격까지 오르는 곳은 <b>${alive}개</b>뿐이에요 → 순환의 초입일 수 있으니 <b>추세↑</b> 표시가 붙은 산업부터 보세요.</p>`
      : `<p class="fl-q warn">강해진 세부 산업 ${rise.length}개 모두 가격 추세는 아직 약해요 → 실제로 올랐다기보다 <b>덜 빠져서</b> 순위만 오른 것일 수 있어요.</p>`;
    return `<div class="fl-head">
      <div class="fl-side"><span class="fl-lab">힘이 빠지는 곳</span><div class="fl-chips">${side(dns, "down", "뚜렷한 곳 없음")}</div></div>
      <div class="fl-arrow" aria-hidden="true">→</div>
      <div class="fl-side"><span class="fl-lab">힘이 몰리는 곳</span><div class="fl-chips">${side(ups, "up", "뚜렷한 곳 없음")}</div></div>
    </div>${q}`;
  }

  // ---------- 로테이션 지도 (SVG) — 모눈·눈금·굵어지는 꼬리·겹치지 않는 이름표 (2026-10-23 가시성 개선)
  function rotationMap(gf, W) {
    const H = Math.round(Math.max(320, Math.min(500, W * 1.02)));
    const P = { l: 34, r: 10, t: 10, b: 34 };
    const iw = W - P.l - P.r, ih = H - P.t - P.b;
    const ymax = Math.max(10, Math.ceil(Math.max(...gf.flatMap((g) => g.tail.map((p) => Math.abs(p.y)))) / 10) * 10);
    const X = (x) => P.l + (x / 100) * iw, Y = (y) => P.t + ih / 2 - (y / ymax) * (ih / 2);
    const colorOf = (p) => p.y >= FLAT ? (p.x >= 50 ? "var(--up)" : "var(--fl-rise)") : p.y <= -FLAT ? (p.x >= 50 ? "var(--down)" : "var(--muted)") : "var(--muted)";
    const f1 = (v) => v.toFixed(1);
    let s = `<svg class="fl-map" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="큰 분류 로테이션 지도">`;
    // 사분면 바탕(네 칸 모두 옅게)
    s += `<rect x="${X(50)}" y="${P.t}" width="${iw / 2}" height="${ih / 2}" class="q-lead"/>
      <rect x="${P.l}" y="${P.t}" width="${iw / 2}" height="${ih / 2}" class="q-rise"/>
      <rect x="${X(50)}" y="${Y(0)}" width="${iw / 2}" height="${ih / 2}" class="q-fade"/>
      <rect x="${P.l}" y="${Y(0)}" width="${iw / 2}" height="${ih / 2}" class="q-lag"/>`;
    // 모눈(10점 간격)
    for (let v = 10; v < 100; v += 10) if (v !== 50) s += `<line x1="${X(v)}" x2="${X(v)}" y1="${P.t}" y2="${P.t + ih}" class="gd"/>`;
    for (let v = -ymax + 10; v < ymax; v += 10) if (v) s += `<line x1="${P.l}" x2="${P.l + iw}" y1="${f1(Y(v))}" y2="${f1(Y(v))}" class="gd"/>`;
    s += `<rect x="${P.l}" y="${P.t}" width="${iw}" height="${ih}" class="frame"/>
      <line x1="${P.l}" x2="${P.l + iw}" y1="${Y(0)}" y2="${Y(0)}" class="ax"/>
      <line x1="${X(50)}" x2="${X(50)}" y1="${P.t}" y2="${P.t + ih}" class="ax"/>`;
    // 눈금 숫자
    for (const v of [0, 25, 50, 75, 100]) s += `<text x="${X(v)}" y="${P.t + ih + 14}" text-anchor="middle" class="tk">${v}</text>`;
    for (const v of [-ymax, -ymax / 2, 0, ymax / 2, ymax]) s += `<text x="${P.l - 5}" y="${f1(Y(v) + 4)}" text-anchor="end" class="tk">${v > 0 ? "+" + v : v < 0 ? "−" + Math.abs(v) : 0}</text>`;
    s += `<text x="${P.l}" y="${H - 5}" class="tk">← 지금 약함</text>
      <text x="${W - P.r}" y="${H - 5}" text-anchor="end" class="tk">지금 강함 →</text>`;
    const QL = [
      ["주도 · 강하고 더 강해짐", P.l + iw - 6, P.t + 16, "end", "lead"],
      ["부상 · 약하지만 강해지는 중", P.l + 6, P.t + 16, "start", "rise"],
      ["식는 중 · 강하지만 약해짐", P.l + iw - 6, P.t + ih - 8, "end", "fade"],
      ["소외 · 약하고 더 약해짐", P.l + 6, P.t + ih - 8, "start", "lag"],
    ];
    const tw = (t, f) => [...t].reduce((a, ch) => a + (/[가-힣]/.test(ch) ? f * 1.0 : f * 0.58), 0);
    const placed = [];
    for (const [t, x, y, a, c] of QL) {
      s += `<text x="${x}" y="${y}" text-anchor="${a}" class="qn ${c}">${t}</text>`;
      const w = tw(t, 11.5);
      placed.push(a === "end" ? [x - w, y - 12, x, y + 2] : [x, y - 12, x + w, y + 2]);
    }
    // 꼬리: 과거일수록 가늘고 흐리게, 최근일수록 굵고 진하게. 시작은 빈 점, 하루하루는 작은 점
    const dots = gf.map((g) => { const p = g.tail.at(-1); return { g, p, cx: X(p.x), cy: Y(p.y), c: colorOf(p) }; });
    let tails = "", marks = "", labels = "";
    for (const o of dots) {
      const pts = o.g.tail.map((p) => [X(p.x), Y(p.y)]), m = pts.length - 1;
      for (let j = 1; j <= m; j++) {
        tails += `<line x1="${f1(pts[j - 1][0])}" y1="${f1(pts[j - 1][1])}" x2="${f1(pts[j][0])}" y2="${f1(pts[j][1])}" stroke="${o.c}" stroke-opacity="${(0.25 + 0.6 * j / m).toFixed(2)}" stroke-width="${(1 + 1.8 * j / m).toFixed(1)}" stroke-linecap="round"/>`;
      }
      pts.slice(1, -1).forEach((q, j) => { tails += `<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="1.6" fill="${o.c}" fill-opacity="${(0.35 + 0.5 * j / Math.max(1, m - 2)).toFixed(2)}"/>`; });
      if (m > 0) tails += `<circle cx="${f1(pts[0][0])}" cy="${f1(pts[0][1])}" r="2.6" class="t0" stroke="${o.c}"/>`;
      placed.push([o.cx - 7, o.cy - 7, o.cx + 7, o.cy + 7]);
      pts.forEach((q) => placed.push([q[0] - 1.5, q[1] - 1.5, q[0] + 1.5, q[1] + 1.5]));
    }
    const hit = (b) => placed.reduce((a, o) => a + Math.max(0, Math.min(b[2], o[2]) - Math.max(b[0], o[0])) * Math.max(0, Math.min(b[3], o[3]) - Math.max(b[1], o[1])), 0);
    // 많이 움직인 분류부터 이름 자리를 먼저 잡는다
    for (const o of [...dots].sort((a, b) => Math.abs(b.g.delta ?? 0) - Math.abs(a.g.delta ?? 0))) {
      const tip = `${o.g.g} · 지금 강도 ${Math.round(o.g.now)} · ${st.k}일 동안 ${o.g.delta > 0 ? "+" : ""}${Math.round(o.g.delta)} · 상위 25% ${o.g.top}/${o.g.n}개`;
      marks += `<g class="fl-dot" data-group="${esc(o.g.g)}" tabindex="0" role="button" aria-label="${esc(tip)}"><title>${esc(tip)}</title><circle cx="${o.cx}" cy="${o.cy}" r="13" fill="transparent"/><circle cx="${o.cx}" cy="${o.cy}" r="6" fill="${o.c}" class="dt"/></g>`;
      const big = Math.abs(o.g.delta ?? 0) >= 20, fs = big ? 12.5 : 11.5, w = tw(o.g.g, fs), C = [];
      // 가까운 자리 8곳 + 멀리 떨어진 자리 8곳(이때는 점과 이름을 가는 선으로 잇는다)
      const near = [[9, 4, "start"], [-9, 4, "end"], [0, -10, "middle"], [0, 17, "middle"], [8, -7, "start"], [-8, -7, "end"], [8, 15, "start"], [-8, 15, "end"]];
      const far = [[24, 4, "start"], [-24, 4, "end"], [0, -24, "middle"], [0, 31, "middle"], [20, -18, "start"], [-20, -18, "end"], [20, 26, "start"], [-20, 26, "end"]];
      for (const [dx, dy, an, lead] of [...near, ...far.map((f) => [...f, 1])]) {
        const x0 = an === "start" ? o.cx + dx : an === "end" ? o.cx + dx - w : o.cx + dx - w / 2;
        const b = [x0 - 1, o.cy + dy - fs + 1, x0 + w + 1, o.cy + dy + 2];
        if (b[0] >= P.l + 1 && b[2] <= W - P.r - 1 && b[1] >= P.t + 1 && b[3] <= P.t + ih - 1) C.push({ x: o.cx + dx, y: o.cy + dy, an, b, lead });
      }
      // 이름이 다른 점 바로 옆에 붙으면 그 점의 이름으로 오해하므로 크게 감점
      // (가장자리 거리 기준으로 남의 점이 내 점보다 이름에 더 가까우면 감점)
      const gap = (d, b) => Math.hypot(Math.max(b[0] - d.cx, 0, d.cx - b[2]), Math.max(b[1] - d.cy, 0, d.cy - b[3]));
      const near2 = (b) => { const mine = gap(o, b); return dots.reduce((a, d) => d === o ? a : a + (gap(d, b) < 14 ? 400 : gap(d, b) < mine + 4 ? 250 : 0), 0); };
      const best = C.map((c) => ({ c, h: hit(c.b) + near2(c.b) + (c.lead ? 60 : 0) })).sort((a, b) => a.h - b.h)[0];
      if (best) {
        placed.push(best.c.b);
        if (best.c.lead) {
          const b = best.c.b, tx = Math.max(b[0], Math.min(o.cx, b[2])), ty = Math.max(b[1], Math.min(o.cy, b[3]));
          const dx = tx - o.cx, dy = ty - o.cy, dd = Math.hypot(dx, dy) || 1;
          labels = `<line x1="${f1(o.cx + dx / dd * 7)}" y1="${f1(o.cy + dy / dd * 7)}" x2="${f1(tx)}" y2="${f1(ty)}" class="ld"/>` + labels;
        }
        labels += `<text x="${f1(best.c.x)}" y="${f1(best.c.y)}" text-anchor="${best.c.an}" class="lb${big ? " big" : ""}" style="font-size:${fs}px" data-group="${esc(o.g.g)}">${esc(o.g.g)}</text>`;
      }
    }
    return s + tails + marks + labels + `</svg>`;
  }

  // 지도 읽는 법(접었다 펴기)
  let helpOpen = false;
  const mapHelp = () => `<details class="fl-help"${helpOpen ? " open" : ""}>
      <summary>로테이션 지도 읽는 법</summary>
      <ul>
        <li><b>점 하나 = 큰 분류 하나</b>예요. 강도는 그 분류에 속한 세부 산업들의 순위를 점수로 바꾼 평균이에요(1위 = 100, 꼴찌 = 0${smoothOf(st.k) > 1 ? `, ${smoothOf(st.k)}일 평균` : ""}).</li>
        <li><b>가로(→)는 지금 강도</b>예요. 오른쪽일수록 지금 시장에서 강한 분류이고, 가운데 세로선(50)이 중간이에요.</li>
        <li><b>세로(↑)는 고른 기간(${st.k}일) 동안 강도가 변한 정도</b>예요. 가운데 가로선(0)보다 위면 강해졌고, 아래면 약해졌어요.</li>
        <li><b>네 칸은 보통 시계 방향으로 돌아요.</b> 부상(왼쪽 위) → 주도(오른쪽 위) → 식는 중(오른쪽 아래) → 소외(왼쪽 아래) → 다시 부상.</li>
        <li><b>꼬리는 최근 ${tailOf(st.k) - 1}거래일 동안 지나온 길</b>이에요. 빈 점이 출발점이고, 굵고 진해지는 쪽이 최근이에요. 꼬리가 길수록 빠르게 움직이는 중이에요.</li>
        <li><b>꼬리가 가리키는 방향이 지금의 흐름</b>이에요. 오른쪽 위를 향하면 힘이 붙는 중, 왼쪽 아래를 향하면 힘이 빠지는 중이에요.</li>
        <li>추세추종이라면 <b>주도 칸</b>과 <b>부상에서 주도로 넘어가는 분류</b>를 먼저 보고, 주도에서 <b>식는 중으로 내려가는 분류</b>는 보유 비중을 점검하는 신호로 보세요.</li>
        <li>이름이 굵은 분류는 이 기간에 20점 넘게 움직인 곳이에요. 점이나 이름을 누르면 아래 순위표가 그 분류로 걸러져요.</li>
      </ul>
    </details>`;

  // 선은 '시작점 대비 변화': 모든 분류가 같은 높이(가운데 선)에서 출발해 얼마나 오르내렸는지. 세로 폭은 모든 분류 공통
  // 가운데 선 위는 빨강, 아래는 파랑으로 면을 채워 방향이 색으로 바로 보이게 한다
  let sparkId = 0;
  function spark(line0, delta, amp) {
    const W = 200, H = 46, base = line0.find((x) => x != null), id = ++sparkId;
    const line = line0.map((x) => x == null || base == null ? null : x - base);
    const xs = (k) => 3 + (k / (line.length - 1)) * (W - 10), ys = (x) => H / 2 - (x / amp) * (H / 2 - 3);
    let p = "", on = false, first = null, last = null;
    line.forEach((x, k) => { if (x == null) { on = false; return; } p += (on ? "L" : "M") + xs(k).toFixed(1) + " " + ys(x).toFixed(1); on = true; if (first == null) first = k; last = k; });
    const c = { up: "var(--up)", down: "var(--down)", flat: "var(--muted)" }[dir(delta)];
    const area = first == null ? "" : `${p}L${xs(last).toFixed(1)} ${H / 2}L${xs(first).toFixed(1)} ${H / 2}Z`;
    const guides = [10, 20].filter((t) => t < amp).flatMap((t) => [H / 2 - (t / amp) * (H / 2 - 3), H / 2 + (t / amp) * (H / 2 - 3)])
      .map((y) => `<line x1="0" x2="${W}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="fl-guide"/>`).join("");
    // 선 시작이 고른 기간 전이므로, 그보다 짧은 기간(20·60일 전)만 점선으로
    const marks = ALSO.filter((P) => P < line.length - 1)
      .map((P) => { const x = xs(line.length - 1 - P); return `<line x1="${x}" x2="${x}" y1="0" y2="${H}" class="fl-then"/>`; }).join("");
    // 점은 늘어나지 않도록 '길이 0인 둥근 선'으로 그린다(preserveAspectRatio="none"에서도 동그랗게)
    const dot = (k, y, w, cls) => `<line x1="${xs(k).toFixed(1)}" x2="${xs(k).toFixed(1)}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="${cls}" stroke-width="${w}" vector-effect="non-scaling-stroke" stroke-linecap="round"${cls === "fl-end" ? ` stroke="${c}"` : ""}/>`;
    return `<svg class="fl-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <defs><clipPath id="fsu${id}"><rect x="0" y="0" width="${W}" height="${H / 2}"/></clipPath><clipPath id="fsd${id}"><rect x="0" y="${H / 2}" width="${W}" height="${H / 2}"/></clipPath></defs>
      ${guides}
      ${area ? `<path d="${area}" class="fl-au" clip-path="url(#fsu${id})"/><path d="${area}" class="fl-ad" clip-path="url(#fsd${id})"/>` : ""}
      <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="fl-mid"/>
      ${marks}
      <path d="${p}" fill="none" stroke="${c}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
      ${first == null ? "" : dot(first, H / 2, 6.5, "fl-s0") + dot(first, H / 2, 3, "fl-s1")}
      ${last == null ? "" : dot(last, ys(line[last]), 11, "fl-ring") + dot(last, ys(line[last]), 8, "fl-end")}</svg>`;
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
    if (T <= st.k + smoothOf(st.k)) { el.innerHTML = `<p class="none">기록이 아직 ${st.k}거래일만큼 쌓이지 않아 그릴 수 없어요.</p>`; return; }
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
          <h3>로테이션 지도 <span class="sub">큰 분류 · 꼬리 = 최근 ${tailOf(st.k) - 1}거래일 이동(빈 점 → 큰 점)</span></h3>
          <div class="fl-map-wrap" id="flMap"></div>
          ${mapHelp()}
        </div>
        <div class="fl-col">
          <h3>큰 분류 흐름 <span class="sub">가운데 선 = ${st.k}일 전 강도 · 위(빨강) = 강해짐 · 아래(파랑) = 약해짐${ALSO.some((P) => P < st.k) ? ` · 세로 점선 = ${ALSO.filter((P) => P < st.k).join("·")}일 전` : ""} · 숫자 = 지금 강도와 ${st.k}일 변화</span></h3>
          <div class="fl-groups">${gRows}</div>
        </div>
      </div>
      <div class="fl-bottom">
        <div class="fl-col">
          <h3><span class="dot" style="color:var(--up)"></span>순위가 오른 세부 산업 <span class="sub">많이 오른 순</span>
            <button class="toggle fl-alive" type="button" aria-pressed="${st.alive}" title="가격도 상승 추세·상승 전환 시도인 산업만">가격도 오르는 산업만</button></h3>
          ${rise.length ? scale + fold("r", rise.map((m) => row(m, d)), 5) : `<p class="none">${st.alive ? "순위가 오른 산업 중 가격까지 오르고 있는 곳은 없어요." : "해당 없음"}</p>`}
        </div>
        <div class="fl-col">
          <h3><span class="dot" style="color:var(--down)"></span>상위권에서 밀려난 세부 산업 <span class="sub">${st.k}일 전 상위 25%였던 산업 중</span></h3>
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
    const hp = $(".fl-help", el); if (hp) hp.addEventListener("toggle", () => { helpOpen = hp.open; });
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
