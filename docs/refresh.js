/* 갱신 상태 표시와 "지금 갱신" 버튼.
   - 로그인 없음: 버튼은 GitHub의 수동 실행 화면을 새 탭으로 연다(거기서 Run workflow).
   - 같은 사이트의 status.json은 5분마다 확인(무료). GitHub 공개 API는 버튼을 누른 뒤
     실행을 따라갈 때와 처음 열 때 한 번만 쓴다(시간당 60회 제한, ETag로 절약). */
(() => {
  const REPO = (() => {
    const host = location.hostname, seg = location.pathname.split("/").filter(Boolean)[0];
    return host.endsWith(".github.io") && seg ? `${host.split(".")[0]}/${seg}` : "dhandori/industry-strength";
  })();
  const WF_URL = `https://github.com/${REPO}/actions/workflows/update.yml`;
  const API = `https://api.github.com/repos/${REPO}/actions/workflows/update.yml/runs?per_page=5`;
  const KEY = "is-run-pending";
  const MAX_WAIT = 40 * 60000;
  // update.yml의 예약 시각(KST, 평일). 바꾸면 여기도 같이 바꾼다.
  const SLOTS = [[6, 50, "미국"], [7, 30, "미국"], [8, 30, "미국"], [16, 40, "한국"], [17, 10, "한국"], [17, 40, "한국"], [18, 10, "한국"], [19, 30, "한국"]];

  const $ = (s) => document.querySelector(s);
  const box = $("#runbar");
  let status = null, etag = null, runs = null, pollT = null, onDone = () => {};
  let pending = null;
  try { const p = JSON.parse(localStorage.getItem(KEY) || "null"); if (p && Date.now() - p.at < MAX_WAIT) pending = p; } catch (e) {}
  const save = (p) => { pending = p; try { p ? localStorage.setItem(KEY, JSON.stringify(p)) : localStorage.removeItem(KEY); } catch (e) {} };

  const kstNow = () => new Date(Date.now() + 9 * 3600e3); // UTC 필드로 KST를 읽는다
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const weekday = (d) => d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
  function prevWeekday(d) { const x = new Date(d); do { x.setUTCDate(x.getUTCDate() - 1); } while (!weekday(x)); return x; }
  // 가장 최근에 장이 끝난 거래일(휴장일은 모름 → "휴장일이면 정상" 문구로 안내).
  function expected(market) {
    if (market === "KR") {
      const k = kstNow(); const after = weekday(k) && (k.getUTCHours() * 60 + k.getUTCMinutes()) >= 16 * 60;
      return ymd(after ? k : prevWeekday(k));
    }
    const ny = new Date(Date.now() + nyOffset() * 3600e3);
    const after = weekday(ny) && (ny.getUTCHours() * 60 + ny.getUTCMinutes()) >= 16 * 60 + 15;
    return ymd(after ? ny : prevWeekday(ny));
  }
  function nyOffset() { // 미국 동부 서머타임: 3월 둘째 일요일 ~ 11월 첫째 일요일
    const now = new Date(), y = now.getUTCFullYear();
    const nth = (m, n) => { const d = new Date(Date.UTC(y, m, 1)); const add = (7 - d.getUTCDay()) % 7; return Date.UTC(y, m, 1 + add + 7 * (n - 1), 7); };
    return now.getTime() >= nth(2, 2) && now.getTime() < nth(10, 1) ? -4 : -5;
  }
  function nextSlot() {
    const k = kstNow();
    for (let add = 0; add < 8; add++) {
      const d = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + add));
      if (!weekday(d)) continue;
      for (const [h, m, who] of SLOTS) {
        const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m);
        if (t > k.getTime()) return { label: `${add === 0 ? "오늘" : add === 1 ? "내일" : `${d.getUTCMonth() + 1}/${d.getUTCDate()}`} ${pad(h)}:${pad(m)}`, who };
      }
    }
    return null;
  }

  async function readStatus() {
    try {
      const r = await fetch("data/status.json?v=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const next = await r.json();
      const changed = status && next.updated_at !== status.updated_at;
      status = next; paint();
      if (changed) onDone();
    } catch (e) {}
  }
  async function readRuns() {
    try {
      const r = await fetch(API, { headers: etag ? { "If-None-Match": etag } : {} });
      if (r.status === 304) return runs;
      if (!r.ok) return runs;
      etag = r.headers.get("ETag"); runs = (await r.json()).workflow_runs || []; return runs;
    } catch (e) { return runs; }
  }
  const mins = (t) => Math.max(0, Math.round((Date.now() - t) / 60000));

  async function follow() {
    clearTimeout(pollT);
    const list = await readRuns();
    const active = (list || []).find((x) => x.status !== "completed");
    const mine = pending && (list || []).find((x) => Date.parse(x.created_at) >= pending.at - 120000);
    if (pending) {
      if (mine && mine.status === "completed") {
        save(null);
        if (mine.conclusion === "success") { await readStatus(); onDone(); flash("갱신 완료 · 새 데이터를 불러왔어요", "ok"); }
        else flash("갱신이 실패했어요 · 실행 기록에서 이유를 볼 수 있어요", "bad", mine.html_url);
      } else if (Date.now() - pending.at > MAX_WAIT) { save(null); flash("실행을 확인하지 못했어요 · 실행 기록을 열어 보세요", "bad", WF_URL); }
      else { paint(mine ? { text: `수집 중 · ${mins(Date.parse(mine.created_at))}분째 (보통 1~2분)`, cls: "busy", url: mine.html_url } : { text: "GitHub 창에서 ‘Run workflow’를 눌러 주세요 · 시작되면 여기서 따라가요", cls: "busy", url: WF_URL }); pollT = setTimeout(follow, 20000); }
      return;
    }
    if (active) { paint({ text: `자동 갱신 진행 중 · ${mins(Date.parse(active.created_at))}분째`, cls: "busy", url: active.html_url }); pollT = setTimeout(follow, 30000); }
    else paint();
  }
  let flashMsg = null;
  function flash(text, cls, url) { flashMsg = { text, cls, url, at: Date.now() }; paint(); setTimeout(() => { flashMsg = null; paint(); }, 15000); }

  function paint(run) {
    if (!box) return;
    const mk = (window.__isMarket && window.__isMarket()) || "KR";
    const st = status?.markets?.[mk];
    const exp = expected(mk), basis = st?.basis_date;
    const stale = basis && basis < exp;
    const next = nextSlot();
    const live = flashMsg || run;
    box.innerHTML = `
      <span class="rb-item"><b>${mk === "KR" ? "한국" : "미국"} 기준일</b> ${basis || "–"}
        <span class="rb-badge ${!st ? "" : st.ok === false ? "bad" : stale ? "warn" : "ok"}">${!st ? "확인 중" : st.ok === false ? "지난 수집 실패" : stale ? `${exp} 장 데이터 없음` : "최신"}</span></span>
      <span class="rb-item"><b>마지막 갱신</b> ${status?.updated_at?.replace(" KST", "") || "–"}</span>
      ${next ? `<span class="rb-item"><b>다음 자동</b> ${next.label} (${next.who})</span>` : ""}
      ${live ? `<span class="rb-live ${live.cls}">${live.url ? `<a href="${live.url}" target="_blank" rel="noopener noreferrer">${live.text}</a>` : live.text}</span>` : ""}
      <span class="rb-actions">
        <button type="button" class="toggle rb-run${stale && !pending ? " primary" : ""}" id="runNow"${pending ? " disabled" : ""}>${pending ? "갱신 따라가는 중…" : "지금 갱신"}</button>
        <a class="rb-log" href="${WF_URL}" target="_blank" rel="noopener noreferrer">실행 기록</a>
      </span>
      ${stale && !live ? `<span class="rb-hint">휴장일이면 정상이에요. 아니면 ‘지금 갱신’을 눌러 주세요.</span>` : ""}`;
    const btn = $("#runNow");
    if (btn) btn.onclick = () => {
      window.open(WF_URL, "_blank", "noopener");
      save({ at: Date.now() }); paint({ text: "GitHub 창에서 ‘Run workflow’를 눌러 주세요 · 시작되면 여기서 따라가요", cls: "busy", url: WF_URL });
      pollT = setTimeout(follow, 15000);
    };
  }

  window.__isRefresh = {
    init(done) { onDone = done; readStatus().then(follow); setInterval(() => { if (document.visibilityState === "visible") readStatus(); }, 5 * 60000); },
    repaint: () => paint(),
  };
})();
