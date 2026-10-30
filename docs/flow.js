/* 산업 흐름: 강도가 어디서 빠져 어디로 옮겨가는지 한눈에 (2026-10-23)
   - 한 줄 결론: 약해지는 분류 → 강해지는 분류, 강해진 산업 중 가격 추세도 살아 있는 비율
   - 강도 이동판: 분류마다 한 줄, 기간 전 강도(빈 점) → 지금 강도(화살촉). 주도·부상·식는 중·소외로 묶고 50선을 넘나든 분류는 따로 알림
     (2026-10-30: 점이 엉키던 로테이션 산점도를 대신함)
   - 큰 분류 흐름: 분류 안 세부 산업 순위 백분위 평균(5일 평균)의 40거래일 선
   - 순위 이동: 기간 전 자리(빈 점) → 지금 자리(찬 점). 오른쪽 끝이 1위 */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const md = (s) => { const [, m, dd] = s.split("-"); return `${+m}/${+dd}`; };
  const WEAK = ["상승 둔화", "하락 추세", "바닥 다지기"];
  const ALIVE = ["상승 추세", "상승 전환 시도"];
  const SMOOTH = 5, RISE_N = 10, FALL_N = 8, FLAT = 3;
  // shut: 접어 둔 묶음(처음엔 소외·제자리를 접는다 — 추세추종에 덜 급한 쪽)
  const st = { k: 20, d: null, alive: false, open: new Set(), shut: new Set(["lag", "flat"]) };
  // 어떤 기간을 골라도 20·60·200일 변화는 늘 같이 보여 준다(짧은 흐름이 긴 기간에 묻히지 않게)
  const ALSO = [20, 60, 200];

  // 순위 → 백분위(1위=100, 꼴찌=0)
  const pct = (r, n) => r == null || n < 2 ? null : (1 - (r - 1) / (n - 1)) * 100;
  const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  const smooth = (a, w) => a.map((_, k) => mean(a.slice(Math.max(0, k - w + 1), k + 1)));
  // 5일은 다듬지 않은 그대로(시작점이 정확히 5일 전), 긴 기간일수록 길게 다듬어 잔물결을 줄인다
  const smoothOf = (k) => k >= 200 ? 20 : k >= 60 ? 10 : k >= 20 ? SMOOTH : 1;
  const dir = (v) => v == null || Math.abs(v) < FLAT ? "flat" : v > 0 ? "up" : "down";

  // ---------- 큰 분류별 강도 선
  function groupFlow(d) {
    const H = d.history, n = d.n, T = H.dates.length, k = st.k;
    // 선 길이는 비교 기간이 보이도록 최소 40거래일, 길면 기간+10거래일
    // 긴 기간일수록 더 길게 다듬어 잔물결을 줄인다(5·20일 5일, 60일 10일, 200일 20일 평균)
    // 선은 정확히 고른 기간 전부터 지금까지
    const len = k + 1, sw = smoothOf(k), span = len + sw;
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
      const now = at(0), then = at(k);
      return { g, n: list.length, line: sm.slice(-len), now, then, delta: now == null || then == null ? null : now - then, per,
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

  // ---------- 강도 이동판 — 분류마다 한 줄: 기간 전(빈 점) → 지금(화살촉). 네 묶음으로 나눠 읽을 필요 없이 보이게
  const ZONES = () => [
    ["lead", "주도", "강하고 더 강해지는 중"],
    ["rise", "부상", "아직 약하지만 강해지는 중"],
    ["fade", "식는 중", "강하지만 약해지는 중"],
    ["lag", "소외", "약하고 더 약해지는 중"],
    ["flat", "제자리", `${st.k}일 동안 변화 ${FLAT}점 미만`],
  ];
  const zoneOf = (g) => g.delta == null || Math.abs(g.delta) < FLAT ? "flat" : g.delta > 0 ? (g.now >= 50 ? "lead" : "rise") : (g.now >= 50 ? "fade" : "lag");
  const sgn = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v));
  function moveBoard(gf) {
    const cross = (g) => g.then == null ? "" : g.then < 50 && g.now >= 50 ? "in" : g.then >= 50 && g.now < 50 ? "out" : "";
    const by = {};
    for (const g of gf) (by[zoneOf(g)] || (by[zoneOf(g)] = [])).push(g);
    const line = (g) => {
      const z = zoneOf(g), a = g.then ?? g.now, b = g.now, x = cross(g);
      const tip = `${g.g} · ${st.k}일 전 강도 ${Math.round(a)} → 지금 ${Math.round(b)} (${sgn(g.delta ?? 0)}) · 상위 25% ${g.top}/${g.n}개 · 누르면 아래 순위표를 이 분류로 걸러요`;
      return `<button class="mv-row z-${z}" type="button" data-group="${esc(g.g)}" title="${esc(tip)}" aria-label="${esc(tip)}">
        <span class="mv-name">${esc(g.g)}${x ? `<em class="mv-x ${x}">${x === "in" ? "강세 진입" : "강세 이탈"}</em>` : ""}</span>
        <span class="mv-track" aria-hidden="true"><i class="mv-mid"></i>
          ${z === "flat" ? "" : `<i class="mv-seg" style="left:${Math.min(a, b).toFixed(1)}%;width:${Math.abs(b - a).toFixed(1)}%"></i>${Math.abs(b - a) >= 5 ? `<i class="mv-was" style="left:${a.toFixed(1)}%"></i>` : ""}`}
          <i class="mv-now${z === "flat" ? "" : b >= a ? " r" : " l"}" style="left:${b.toFixed(1)}%"></i></span>
        <span class="mv-v"><b>${Math.round(b)}</b><small>${g.delta == null ? "" : (g.delta > 0 ? "▲" : g.delta < 0 ? "▼" : "") + Math.abs(Math.round(g.delta))}</small></span>
      </button>`;
    };
    const ins = gf.filter((g) => cross(g) === "in"), outs = gf.filter((g) => cross(g) === "out");
    const name = (l) => l.map((g) => `<button class="lnk" type="button" data-group="${esc(g.g)}">${esc(g.g)}</button>`).join(", ");
    const news = ins.length || outs.length ? `<p class="mv-news">${ins.length ? `<span class="in">⬆ 강세로 올라선 분류 <b>${name(ins)}</b></span>` : ""}${outs.length ? `<span class="out">⬇ 강세에서 내려온 분류 <b>${name(outs)}</b></span>` : ""}</p>` : "";
    return news + `<div class="mv-scale" aria-hidden="true"><span></span><span class="mv-axis"><em>0 · 약함</em><em>50</em><em>강함 · 100</em></span><span></span></div>`
      + ZONES().filter(([z]) => by[z]).map(([z, t, sub]) => {
        const list = by[z].sort((p, q) => Math.abs(q.delta ?? 0) - Math.abs(p.delta ?? 0)), shut = st.shut.has(z);
        // 접혀 있어도 이름과 변화는 한 줄로 보인다
        const brief = list.map((g) => `${esc(g.g)} <i>${g.delta == null ? "" : (g.delta > 0 ? "▲" : g.delta < 0 ? "▼" : "") + Math.abs(Math.round(g.delta))}</i>`).join(" · ");
        return `<div class="mv-zone z-${z}${shut ? " shut" : ""}">
          <button class="mv-zh" type="button" data-zone="${z}" aria-expanded="${!shut}"><b>${t}</b> ${sub} <span>${list.length}개 <em>${shut ? "펼치기 ▾" : "접기 ▴"}</em></span></button>
          <p class="mv-brief">${brief}</p>
          <div class="mv-rows">${list.map(line).join("")}</div></div>`;
      }).join("");
  }

  // 판 읽는 법(접었다 펴기)
  let helpOpen = false;
  const mapHelp = () => `<details class="fl-help"${helpOpen ? " open" : ""}>
      <summary>강도 이동판 읽는 법</summary>
      <ul>
        <li><b>한 줄 = 큰 분류 하나</b>예요. 강도는 그 분류 세부 산업들의 순위를 점수로 바꾼 평균이에요(1위 = 100, 꼴찌 = 0${smoothOf(st.k) > 1 ? `, ${smoothOf(st.k)}일 평균` : ""}).</li>
        <li><b>빈 점 = ${st.k}일 전, 화살촉 = 지금</b>이에요(조금만 움직였으면 빈 점은 화살촉에 가려 생략). 화살표가 길수록 많이 움직였고, 가운데 세로선(50)보다 오른쪽이면 지금 시장에서 강한 쪽이에요.</li>
        <li><b>주도</b>(강하고 더 강해짐) → <b>식는 중</b>(강하지만 약해짐) → <b>소외</b>(약하고 더 약해짐) → <b>부상</b>(약하지만 강해짐) → 다시 주도, 이렇게 돌아요.</li>
        <li>추세추종이라면 <b>주도</b>와 <b>강세 진입</b> 표시가 붙은 분류를 먼저 보고, <b>강세 이탈</b>·<b>식는 중</b>은 보유 비중을 점검하는 신호로 보세요.</li>
        <li>줄을 누르면 아래 순위표가 그 분류로 걸러져요.</li>
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
          <h3>강도 이동판 <span class="sub">큰 분류 · 빈 점 = ${st.k}일 전 → 화살촉 = 지금</span></h3>
          <div class="mv-board" id="flMap">${moveBoard(gf)}</div>
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
    $$(".mv-zh", el).forEach((b) => b.addEventListener("click", () => {
      const z = b.dataset.zone, box = b.closest(".mv-zone"), shut = box.classList.toggle("shut");
      shut ? st.shut.add(z) : st.shut.delete(z);
      b.setAttribute("aria-expanded", !shut);
      $("em", b).textContent = shut ? "펼치기 ▾" : "접기 ▴";
    }));
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
  // 판은 HTML이라 창 크기가 바뀌어도 다시 그릴 필요가 없다
  window.__flow = { render, redraw: () => {} };
})();
