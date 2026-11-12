/* 탭마다 마지막 갱신 시각과 다음 갱신 예정 시각 (2026-11-12 사용자 요청: 각 메뉴 옆에 기재)
   - 데스크톱: 탭 이름 아래 작은 글씨 두 줄('갱신 11/12 13:02' / '다음 오늘 15:52').
   - 휴대폰(560px 이하): 탭 칸이 좁아 탭 줄 바로 아래 한 줄에 지금 연 탭의 두 시각만 보여 준다.
   - 마지막 갱신은 각 자료 파일 맨 앞의 시각 칸을 읽는다. 파일 앞 400바이트만 받는다(Range 요청, GitHub Pages 지원).
   - 다음 갱신은 아래 SCHED 표(각 작업의 예약 시각)로 계산한다. 예약 시각을 바꾸면 이 표도 같이 바꾼다.
     휴장일은 모르므로 휴장일에는 하루 밀린다(툴팁에 적음). 모든 시각은 한국 시간(KST)이다. */
(() => {
  const NY = "America/New_York";
  // 요일: 0=일 … 6=토(그 시간대 기준)
  const WK = [1, 2, 3, 4, 5];
  const SCHED = {
    // update.yml: 한국 15:52(평일), 미국 뉴욕 16:12(평일) = 05:12/06:12 KST
    strength: { KR: [{ h: 15, m: 52, d: WK }], US: [{ tz: NY, h: 16, m: 12, d: WK }],
      src: "data/status.json", key: "updated_at", note: "한국 평일 15:52 · 미국 뉴욕 16:12(한국 05:12, 서머타임 해제 땐 06:12)" },
    // 52주 신고가 기록 예약 작업: 한국 16:05(평일), 미국 08:05 KST(화~토, 직전 미국장)
    highs: { KR: [{ h: 16, m: 5, d: WK }], US: [{ h: 8, m: 5, d: [2, 3, 4, 5, 6] }],
      src: "data/highs.json", key: "updated_at", note: "한국 평일 16:05 · 미국 화~토 08:05(직전 미국장)" },
    // wamo-choochoo-dashboard macro.yml: 07:05(월~토), 18:30(평일)
    macro: { all: [{ h: 7, m: 5, d: [1, 2, 3, 4, 5, 6] }, { h: 18, m: 30, d: WK }],
      src: "/wamo-choochoo-dashboard/wamo_macro.json", key: "asOf", note: "월~토 07:05 · 평일 18:30" },
    // ai-market.yml: 매일 09:20·18:20
    ai: { all: [{ h: 9, m: 20, d: [0, 1, 2, 3, 4, 5, 6] }, { h: 18, m: 20, d: [0, 1, 2, 3, 4, 5, 6] }],
      src: "data/ai_market.json", key: "updated_at", note: "매일 09:20 · 18:20" },
    // pairs.py 는 update.yml 안에서 돈다(산업 강도와 같은 시각)
    pairs: { all: [{ h: 15, m: 52, d: WK }, { tz: NY, h: 16, m: 12, d: WK }],
      src: "data/pairs.json", key: "updated_at", note: "산업 강도와 같이: 한국 평일 15:52 · 미국 뉴욕 16:12" },
    // 06·06-1 예약 작업: 매주 수요일 13:00쯤(12:54, 늦으면 19:54 재시도)
    positioning: { all: [{ h: 13, m: 0, d: [3] }],
      src: "data/positioning.json", key: "basis_date", note: "매주 수요일 13:00쯤(늦으면 20:00쯤 재시도)" },
  };
  const pad = (n) => String(n).padStart(2, "0");
  const DOW = "일월화수목금토";

  // tz 의 그 시각(벽시계)이 몇 시(UTC ms)인지
  function offsetMin(tz, ms) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ms / 60000) * 60000) / 60000;
  }
  function wallToUtc(tz, y, mo, d, h, m) {
    if (!tz) return Date.UTC(y, mo, d, h, m) - 9 * 3600e3;
    let t = Date.UTC(y, mo, d, h, m);
    t -= offsetMin(tz, t) * 60000;
    return Date.UTC(y, mo, d, h, m) - offsetMin(tz, t) * 60000;
  }
  function nextRun(slots, now = Date.now()) {
    let best = null;
    for (const s of slots) {
      const off = s.tz ? offsetMin(s.tz, now) : 540;
      const local = new Date(now + off * 60000);
      for (let add = 0; add < 9; add++) {
        const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + add));
        if (!s.d.includes(day.getUTCDay())) continue;
        const t = wallToUtc(s.tz, day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), s.h, s.m);
        if (t > now) { if (best == null || t < best) best = t; break; }
      }
    }
    return best;
  }
  function kstLabel(t, withTime = true) {
    const k = new Date(t + 9 * 3600e3), n = new Date(Date.now() + 9 * 3600e3);
    const dd = Math.round((Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())) / 864e5);
    const day = dd === 0 ? "오늘" : dd === 1 ? "내일" : `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${DOW[k.getUTCDay()]})`;
    return withTime ? `${day} ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}` : day;
  }
  // 자료 파일의 시각 → UTC ms. "2026-11-12 13:02 KST", "2026-11-12T11:53+09:00", "2026-11-11"(날짜만) 모양을 읽는다.
  function parseStamp(v) {
    if (!v) return null;
    const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!m) return null;
    return { t: Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) - 9 * 3600e3, dateOnly: !m[4] };
  }
  async function head(src, key) {
    try {
      const r = await fetch(src + "?v=" + Math.floor(Date.now() / 60000), { headers: { Range: "bytes=0-399" }, cache: "no-store" });
      if (!r.ok) return null;
      const txt = (await r.text()).slice(0, 4000);
      const m = txt.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`));
      return m ? parseStamp(m[1]) : null;
    } catch (e) { return null; }
  }

  const last = {};
  const market = () => (window.__isMarket && window.__isMarket()) || "KR";
  const slotsOf = (v) => SCHED[v].all || SCHED[v][market()] || [];
  function text(v) {
    const L = last[v], nx = nextRun(slotsOf(v));
    const a = L === undefined ? "갱신 …" : L ? `갱신 ${L.dateOnly ? kstLabel(L.t, false) : kstLabel(L.t)}` : "갱신 확인 못 함";
    const b = nx ? `다음 ${kstLabel(nx)}` : "";
    return [a, b];
  }
  const bar = document.createElement("div");
  bar.className = "vt-bar";
  bar.setAttribute("aria-live", "polite");
  const nav = document.querySelector(".view-tabs");
  if (!nav) return;
  nav.after(bar);

  function paint() {
    nav.querySelectorAll("button[data-view]").forEach((b) => {
      const v = b.dataset.view;
      if (!SCHED[v]) return;
      let el = b.querySelector(".vt-time");
      if (!el) { el = document.createElement("span"); el.className = "vt-time"; b.appendChild(el); }
      const [a, n] = text(v);
      el.innerHTML = `<span>${a}</span><span>${n}</span>`;
      b.title = `${a} · ${n}\n예약: ${SCHED[v].note} (한국 시간, 휴장일엔 하루 밀림)`;
    });
    const on = nav.querySelector("button[aria-selected=true]");
    const v = on && on.dataset.view;
    if (v && SCHED[v]) {
      const [a, n] = text(v);
      const ico = on.querySelector(".vt-ico"), name = [...on.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join("").trim();
      bar.textContent = `${ico ? ico.textContent + " " : ""}${name} · ${a}${n ? " · " + n : ""}`;
    }
  }
  async function refresh() {
    await Promise.all(Object.entries(SCHED).map(async ([v, s]) => { last[v] = await head(s.src, s.key); }));
    paint();
  }
  // 탭·시장을 바꾸면 다시 그린다(다음 갱신은 시장마다 다르다)
  new MutationObserver(paint).observe(nav, { attributes: true, subtree: true, attributeFilter: ["aria-selected"] });
  document.querySelectorAll(".seg[role=tablist] button").forEach((b) => b.addEventListener("click", () => setTimeout(paint, 0)));
  paint();
  refresh();
  setInterval(refresh, 5 * 60000);
  setInterval(paint, 60000);
})();
