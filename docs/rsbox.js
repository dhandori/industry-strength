/* RS 한눈에 상자 (2026-11-18 사용자 요청)
   산업 서랍과 종목 상세 창에서 같은 모양으로 쓴다.
   - RS 점수(1~99)와 '시장 RS 기준선'(지수를 같은 잣대에 넣었을 때의 점수, {시장}.json 의 rs_base)을 한 막대에 그린다.
   - RS선(종목·산업 ÷ 지수)이 50일 평균 위인지로 최근 흐름을 더한다.
   - 'RS가 왜 중요한가요?' 풀이는 접어 둔다.
   기준선 자료가 아직 없는 날(배포 직후)에는 막대에 점수만 그리고 기준선 문장은 빼고 보여 준다.
   공용 파일(index.html·style.css)과 충돌하지 않도록 모양(CSS)과 서랍 안 자리(#dRs)는 이 파일이 직접 만든다. */
(function () {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const isNum = (v) => typeof v === "number" && isFinite(v);

  // 모양: style.css 대신 여기서 한 번만 넣는다.
  const CSS = `
.rs-box { margin: 12px 0; padding: 12px 14px; border: 1px solid var(--line); border-left: 4px solid var(--muted); border-radius: 12px; background: var(--surface); }
.rs-box.good { border-left-color: var(--good); }
.rs-box.mid { border-left-color: #d99a00; }
.rs-box.weak { border-left-color: var(--down); }
.rs-box h4 { margin: 0 0 6px; font-size: 15px; }
.rs-verdict { margin: 0 0 10px; font-size: 15px; line-height: 1.55; font-weight: 600; }
.rsg { position: relative; margin: 4px 6px 6px; }
.rsg-track { position: relative; height: 10px; border-radius: 6px; background: var(--accent-soft); }
.rsg-weak { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px 0 0 6px; background: var(--surface-2); }
.rsg-base { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--ink-2); }
.rsg-dot { position: absolute; top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: var(--accent); border: 2px solid var(--surface); box-shadow: 0 0 0 1px var(--accent); }
.rs-box.good .rsg-dot { background: var(--good); box-shadow: 0 0 0 1px var(--good); }
.rs-box.weak .rsg-dot { background: var(--down); box-shadow: 0 0 0 1px var(--down); }
.rsg-lab { position: relative; height: 18px; font-size: 12px; color: var(--ink-2); }
.rsg-lab span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.rsg-lab span.me { font-weight: 700; color: var(--ink); font-size: 13px; }
.rsg-lab.low span { color: var(--muted); }
.rsg-ends { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
.rs-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-top: 8px; }
.rs-facts div { background: var(--surface-2); border-radius: 10px; padding: 8px 10px; display: grid; gap: 2px; }
.rs-facts em { font-style: normal; font-size: 11.5px; color: var(--muted); }
.rs-facts b { font-size: 17px; font-variant-numeric: tabular-nums; }
.rs-facts small { font-size: 11.5px; color: var(--ink-2); }
.rs-why { margin-top: 10px; }
.rs-why summary { cursor: pointer; font-weight: 700; font-size: 14px; color: var(--accent); }
.rs-why p { margin: 8px 0 0; font-size: 14px; line-height: 1.65; color: var(--ink-2); }
.rs-why p b { color: var(--ink); }
`;
  (function addStyle() {
    if (document.getElementById("rsbox-style")) return;
    const st = document.createElement("style"); st.id = "rsbox-style"; st.textContent = CSS; document.head.append(st);
  })();

  // 산업 서랍 안 자리: 꼬리표(#dTags) 바로 아래에 상자 자리를 만들고, 서랍 아래쪽 RS선 차트(제목·범례·차트)를 그 밑으로 올린다.
  function drawerSlot() {
    let slot = document.getElementById("dRs");
    const tags = document.getElementById("dTags");
    if (!slot && tags) {
      slot = document.createElement("div"); slot.id = "dRs"; tags.after(slot);
      const lg = document.getElementById("lgRs"), ch = document.getElementById("cRs");
      const h = lg && lg.previousElementSibling && lg.previousElementSibling.tagName === "H4" ? lg.previousElementSibling : null;
      if (lg && ch) { let at = slot; [h, lg, ch].filter(Boolean).forEach((e) => { at.after(e); at = e; }); }
    }
    return slot;
  }

  // d: {시장}.json, b2: 두 번째 지수와 비교하는지, kind: "stock" | "industry"
  function baseOf(d, kind, b2) {
    const rb = d && d.rs_base && d.rs_base[kind];
    if (!rb) return null;
    const v = b2 ? rb.bench2 : rb.bench;
    const name = b2 ? (d.benchmark2 && d.benchmark2.name) : (d.benchmark && d.benchmark.name);
    return isNum(v) ? { v, name: name || "시장 지수" } : null;
  }

  function verdict(score, base, up, who) {
    if (!isNum(score)) return { cls: "", text: "RS 점수를 계산할 기록이 아직 부족합니다." };
    if (!base) {
      return { cls: up === true ? "good" : up === false ? "weak" : "", text: `RS 점수는 ${score}점입니다. ${up === true ? "RS선이 50일 평균 위에 있어 최근 흐름은 시장보다 강합니다." : up === false ? "RS선이 50일 평균 아래에 있어 최근 흐름은 시장보다 약합니다." : ""}` };
    }
    const gap = score - base.v, strong = gap > 0;
    if (strong && up !== false) return { cls: "good", text: `${who}은 시장보다 강합니다. RS 점수 ${score}점이 시장 기준선 ${base.v}점보다 ${gap}점 높고, RS선도 50일 평균 위에 있습니다.` };
    if (strong) return { cls: "mid", text: `1년으로 보면 시장보다 강하지만 최근 힘이 빠지고 있습니다. RS 점수 ${score}점은 시장 기준선 ${base.v}점보다 높지만, RS선이 50일 평균 아래로 내려왔습니다.` };
    if (up === true) return { cls: "mid", text: `아직은 시장보다 약하지만 최근 따라붙고 있습니다. RS 점수 ${score}점은 시장 기준선 ${base.v}점보다 ${-gap}점 낮지만, RS선은 50일 평균 위로 올라섰습니다.` };
    return { cls: "weak", text: `${who}은 시장보다 약합니다. RS 점수 ${score}점이 시장 기준선 ${base.v}점보다 ${-gap}점 낮습니다. 강의 기준으로는 주도주 후보에서 뺍니다.` };
  }

  function gauge(score, base) {
    if (!isNum(score)) return "";
    const pos = (v) => Math.max(1, Math.min(99, v));
    return `<div class="rsg" role="img" aria-label="RS 점수 ${score}점${base ? `, 시장 기준선 ${base.v}점` : ""}">
      <div class="rsg-track">${base ? `<i class="rsg-weak" style="width:${pos(base.v)}%"></i><i class="rsg-base" style="left:${pos(base.v)}%"></i>` : ""}<b class="rsg-dot" style="left:${pos(score)}%"></b></div>
      <div class="rsg-lab"><span style="left:${pos(score)}%" class="me">${score}</span></div>
      ${base ? `<div class="rsg-lab low"><span style="left:${pos(base.v)}%">시장 ${base.v}</span></div>` : ""}
      <div class="rsg-ends"><span>1 · 약함</span><span>99 · 강함</span></div>
    </div>`;
  }

  const WHY = {
    stock: [
      ["RS는 '반 평균'과 견준 성적입니다.", "같은 기간 시장(지수)보다 더 올랐는지를 봅니다. 많이 오른 종목은 비싸 보이지만, 주도주는 시장보다 강한 종목 가운데서 나옵니다. 덜 오른 종목은 싸서가 아니라 약해서 덜 올랐을 수 있습니다."],
      ["RS선과 RS 점수는 보는 것이 다릅니다.", "RS선은 주가를 지수로 나눈 선입니다. 선이 오르면 시장보다 강하다는 뜻이라 O/X로 읽습니다. RS 점수는 1년 수익률(최근 3개월 40%, 6·9·12개월 각 20%)을 시장 안 다른 종목과 견준 1~99 등수입니다. 최근 석 달의 비중이 가장 큽니다."],
      ["기준은 점수 크기가 아니라 시장 기준선입니다.", "시장 기준선은 지수를 같은 잣대로 쟀을 때 받는 점수입니다. 이보다 낮으면 시장보다 약한 종목이고, 높으면 주도주 후보입니다. 기준선 위라면 95점과 80점을 같은 후보로 봅니다. 점수가 지나치게 높으면 단기 고점일 수도 있습니다."],
      ["RSI와는 다른 지표입니다.", "RSI는 자기 과거와 견줘 최근에 너무 올랐는지, 너무 빠졌는지를 봅니다. RS는 시장과 견줍니다. RSI가 높다고 강한 종목이라는 뜻은 아닙니다."],
      ["RS 하나로 정하지 않습니다.", "업종이 같이 오르는지, 외국인·기관이 사는지, 추세가 우상향인지를 함께 봅니다. 여러 신호가 같은 방향을 가리킬 때 주도주일 가능성이 커집니다. 개인 위주로 혼자 급등한 테마주는 RS가 높아도 보류합니다."],
    ],
    industry: [
      ["업종 RS는 이 산업이 시장보다 강한지를 봅니다.", "기관과 외국인은 종목 하나보다 업종 단위로 돈을 넣는 경우가 많습니다. 그래서 진짜 추세는 업종 전체의 움직임에서 먼저 보입니다. 이를 인더스트리 액션이라고 부릅니다."],
      ["RS선과 RS 점수는 보는 것이 다릅니다.", "RS선은 같은 비중 바구니 지수를 시장 지수로 나눈 선입니다. 선이 오르면 시장보다 강하다는 뜻이라 O/X로 읽습니다. RS 점수는 1년 수익률(최근 3개월 40%, 6·9·12개월 각 20%)을 시장 안 다른 산업과 견준 1~99 등수입니다."],
      ["기준은 점수 크기가 아니라 시장 기준선입니다.", "시장 기준선은 지수를 산업과 함께 줄 세웠을 때 받는 점수입니다. 이보다 낮은 산업은 시장보다 약한 산업입니다. 기준선 위라면 점수 차이로 줄을 세울 필요는 없습니다."],
      ["섹터 1등이 곧 강한 종목은 아닙니다.", "업종 안에서 1등이어도 시장보다 약할 수 있습니다. 판단 순서는 시장 날씨, 업종이 같이 오르는지, 종목이 지수보다 강한지입니다. 아래 구성 종목 표의 RS 칸도 종목 창의 시장 기준선과 견줘 보시면 됩니다."],
    ],
  };

  function whyHtml(kind) {
    return `<details class="rs-why"><summary>RS가 왜 중요한가요?</summary>${(WHY[kind] || WHY.stock).map(([h, t]) => `<p><b>${esc(h)}</b> ${esc(t)}</p>`).join("")}</details>`;
  }

  // opts: { d, kind, b2, score, up, hiDist, who, scope }
  function html(o) {
    const base = baseOf(o.d, o.kind, o.b2);
    const v = verdict(o.score, base, o.up, o.who || (o.kind === "industry" ? "이 산업" : "이 종목"));
    const facts = [];
    if (isNum(o.score)) facts.push(`<div><em>RS 점수</em><b>${o.score}</b><small>${esc(o.scope || (o.kind === "industry" ? "시장 안 산업끼리 1~99" : "시장 안 종목끼리 1~99"))}</small></div>`);
    if (base) facts.push(`<div><em>시장 기준선</em><b>${base.v}</b><small>${esc(base.name)}를 같은 잣대로 잰 점수</small></div>`);
    if (o.up != null) facts.push(`<div><em>RS선 흐름</em><b class="${o.up ? "ok" : "no"}">${o.up ? "50일 평균 위" : "50일 평균 아래"}</b><small>${o.up ? "최근 시장보다 강해지는 중" : "최근 시장보다 약해지는 중"}</small></div>`);
    if (isNum(o.hiDist)) facts.push(`<div><em>RS선 1년 최고 대비</em><b>${o.hiDist >= -0.05 ? "신고가" : o.hiDist.toFixed(1) + "%"}</b><small>${o.hiDist >= -0.5 ? "시장 대비 강도가 1년 중 최고" : "1년 최고치보다 아래"}</small></div>`);
    return `<section class="rs-box ${v.cls}" aria-label="RS 한눈에">
      <h4>📐 RS · 시장보다 강한가</h4>
      <p class="rs-verdict">${esc(v.text)}</p>
      ${gauge(o.score, base)}
      ${facts.length ? `<div class="rs-facts">${facts.join("")}</div>` : ""}
      ${whyHtml(o.kind)}
    </section>`;
  }

  window.__rsbox = { html, baseOf, drawerSlot };
})();
