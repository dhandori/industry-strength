/* 💰 포지셔닝 탭 (2026-11-12 사용자 결정: 아티팩트 '스마트머니 포지셔닝 레이더'를 흐름판 탭으로 옮김)
   데이터: docs/data/positioning.json 한 파일. dhandori/global-high-radar 의 예약 작업 '06-1 차트 갱신'이
   claude-automations/dashboards/positioning_dashboard.py 로 만들어 매주 수요일 12:54 KST 쯤 올린다(이 저장소의 Actions 는 건드리지 않는다).
   그래프 코드는 아티팩트 화면을 그대로 옮겼고, 아티팩트 대시보드의 dash.data·dash.calc·dash.onData·dash.colors 네 가지만 아래 작은 연결부로 흉내 낸다.
   d3 는 이 탭을 처음 열 때만 불러온다. 다른 탭과 코드를 섞지 않는다. */
(() => {
  const HTML = "<div id=\"po\">\n  <header class=\"po-mast\" id=\"po-sec-top\">\n    <div class=\"po-cadence\" id=\"po-cadence\" role=\"note\">\n      <b>📅 이 탭은 매주 한 번, 수요일 오후 1시쯤(KST)에만 바뀝니다</b>\n      <span>다른 탭은 매일 갱신되지만, 이 탭의 숫자는 매주 수요일 스마트머니 포지셔닝 보고서가 나온 뒤에 한꺼번에 바뀝니다. 그 사이 요일에는 지난 수요일 숫자가 그대로 보입니다.</span>\n      <span class=\"po-cadence-line\">기준일 <b class=\"po-smark\" data-where=\"key=기준일\">—</b> · <span id=\"po-age\">—</span> · <span id=\"po-nextup\">다음 갱신 —</span></span>\n    </div>\n    <div class=\"po-kicker\">스마트머니 포지셔닝 레이더 · 가격 뒤의 돈(누가 팔고 있고, 누가 더 살 수 있나)</div>\n    <h1 class=\"po-headline dash-skeleton\" id=\"po-headline\" data-source=\"article\">—</h1>\n    <p class=\"po-dek dash-skeleton\" id=\"po-dek\" data-source=\"article\">—</p>\n  </header>\n  <section class=\"po-now\" id=\"po-sec-now\">\n    <b>이번 주 판정</b>\n    <ul class=\"po-vlist\" id=\"po-vnotes\" data-source=\"verdict\"></ul>\n  </section>\n  <section class=\"po-notes\" id=\"po-notes\" data-source=\"notes\" hidden></section>\n\n  <section id=\"po-sec-flowboard\">\n    <div class=\"po-h2\"><h2>1. 한눈에 보는 흐름</h2><span>CTA는 주 단위로, 펀드매니저 설문은 월 단위로 봅니다</span></div>\n    <div class=\"po-grid2\" style=\"margin-top:10px\">\n      <section class=\"po-card\" id=\"po-sec-cta-trail\">\n        <h3>CTA 주별 흐름</h3>\n        <div class=\"po-terms\" data-sec=\"flow-cta\" data-source=\"glossary\" hidden></div>\n        <p class=\"po-note\">가운데 굵은 선이 중기 트리거입니다. 점이 선보다 위에 있으면 CTA가 주식을 계속 들고 있고, 선 아래로 내려가면 팔기 시작합니다. 선 위에 있더라도 단기 트리거보다 낮으면 조금씩 팔기도 합니다. 점 옆의 금액은 골드만삭스가 추정한 '앞으로 1주일 매매 금액'으로, 주가가 횡보한다고 가정한 값입니다.</p>\n        <div id=\"po-trail\" class=\"po-chart dash-skeleton\" data-source=\"weekly\" style=\"min-height:270px\"></div>\n        <p class=\"po-note po-capline\" id=\"po-trail-cap\"></p>\n        <h3 id=\"po-sec-verdict-history\" style=\"margin-top:6px\">주별 판정 기록</h3>\n        <p class=\"po-note\">펀드매니저는 BofA의 새 설문이 나온 뒤 14일 동안만 판정합니다.</p>\n        <ul class=\"po-vlist po-vrec\" id=\"po-vhist\" data-source=\"weekly\"></ul>\n      </section>\n      <section class=\"po-card\" id=\"po-sec-fms-trail\">\n        <h3>펀드매니저 설문(FMS) 월별 흐름</h3>\n        <div class=\"po-terms\" data-sec=\"flow-fms\" data-source=\"glossary\" hidden></div>\n        <p class=\"po-note\">가운데 굵은 선은 현금 비중 4.0%입니다. BofA는 현금 비중이 이 선 아래로 내려가면 매도 신호로 봅니다. 점이 선 아래에 있는 달은 펀드매니저들이 현금을 거의 남기지 않고 주식을 사 둔 달입니다. 맨 아랫줄은 '돈이 가장 쏠린 곳'으로 꼽힌 투자처와 그렇게 답한 비율입니다.</p>\n        <div id=\"po-fmstrail\" class=\"po-chart dash-skeleton\" data-source=\"fms_monthly\" style=\"min-height:286px\"></div>\n        <p class=\"po-note po-capline\" id=\"po-fms-cap\"></p>\n        <div class=\"po-twrap\"><table id=\"po-fmsm\" data-source=\"fms_monthly\" data-row-key=\"month\">\n          <thead><tr><th data-field=\"month\">설문</th><th data-field=\"cash\">현금 비중</th><th data-field=\"equity_net\">주식(늘림−줄임)</th><th data-field=\"tech_net\">기술주(늘림−줄임)</th><th data-field=\"crowded\">돈이 가장 쏠린 곳</th></tr></thead><tbody></tbody></table></div>\n      </section>\n    </div>\n  </section>\n\n  <section id=\"po-sec-participants\">\n    <div class=\"po-h2\"><h2>2. 누가 팔고 있고, 누가 더 살 수 있나</h2><span>투자자별 현재 상태와 근거</span></div>\n    <p class=\"po-legend\" style=\"margin-top:8px\">카드 오른쪽 위의 표시는 그 투자자가 지금 무엇을 하고 있는지를 나타냅니다. '팔고 있음'과 '사고 있음'은 이번 주에 실제로 매매가 추정되는 경우입니다. '더 팔 수 있음'은 아직 팔지는 않았지만 이미 많이 사 둬서 주가가 흔들리면 매물이 나올 수 있는 경우이고, '더 살 수 있음'은 주식을 이미 줄여 놓았거나 현금이 많아서 살 돈이 남아 있는 경우입니다. '판정 안 함'은 자료가 오래돼서 지금 상태를 알 수 없는 경우입니다.</p>\n    <div class=\"po-terms\" data-sec=\"parts\" data-source=\"glossary\" hidden></div>\n    <div class=\"po-balance\" id=\"po-balance\" data-source=\"participants\" style=\"margin:10px 0\"></div>\n    <div class=\"po-parts\" id=\"po-parts\" data-source=\"participants\"></div>\n  </section>\n  <section id=\"po-sec-storyblock\">\n    <div class=\"po-h2\"><h2>3. 해설</h2><span>왜 이런 일이 생겼고, 앞으로 어떻게 될지</span></div>\n    <div class=\"po-terms\" data-sec=\"story\" data-source=\"glossary\" hidden></div>\n    <article class=\"po-article\" id=\"po-sec-story\" data-source=\"article\" style=\"margin-top:10px\"><div class=\"dash-skeleton\" style=\"min-height:420px\"></div></article>\n  </section>\n  <section id=\"po-sec-cta\">\n    <div class=\"po-h2\"><h2>4. CTA 자세히 보기</h2><span>골드만삭스 추정 기준</span></div>\n    <p class=\"po-legend\" style=\"margin-top:8px\">여기서는 세 가지를 차례로 봅니다. 첫째, 지금 주가가 트리거 세 개 가운데 어디쯤에 있는지. 둘째, 앞으로 주가가 오르거나 내리면 CTA가 얼마나 사고파는지. 셋째, 그 추정이 지난 몇 주 동안 어떻게 바뀌어 왔는지입니다. CTA 자료는 은행이 고객에게만 제공하기 때문에, 기사로 알려진 주에만 숫자가 들어옵니다.</p>\n    <div class=\"po-terms\" data-sec=\"cta\" data-source=\"glossary\" hidden></div>\n    <div class=\"po-grid2\" style=\"margin-top:10px\">\n      <section class=\"po-card\" id=\"po-sec-cta-ladder\">\n        <h3>① 지금 주가는 어느 구간에 있나 <span class=\"po-badge\" id=\"po-lad-badge\" hidden></span></h3>\n        <p class=\"po-note\">세로축은 S&amp;P500 지수입니다. 가로선 세 개가 단기·중기·장기 트리거이고, 주가가 아래로 내려가 트리거를 하나씩 밑돌 때마다 CTA는 더 많이 팝니다. 그래서 색이 아래로 갈수록 짙은 빨강이 됩니다. 오른쪽 화살표가 지금 주가입니다.</p>\n        <div id=\"po-ladder\" class=\"dash-skeleton\" data-source=\"weekly\" style=\"min-height:330px\"></div>\n        <ul class=\"po-points\" id=\"po-lad-points\"></ul>\n        <p class=\"po-note\">구간 이름은 '밑도는 트리거가 많을수록 더 많이 판다'는 일반적인 경향을 나타낸 것입니다. 실제로 얼마를 파는지는 ②번의 추정 금액을 보면 됩니다.</p>\n      </section>\n      <section class=\"po-card\" id=\"po-sec-cta-scen\">\n        <h3>② 주가가 움직이면 CTA는 얼마나 사고파나</h3>\n        <p class=\"po-note\">골드만삭스는 앞으로 주가가 오르는 경우, 제자리에 머무는 경우(횡보), 내리는 경우로 나눠 CTA의 매매 금액을 추정합니다. <b class=\"po-sellc\">빨간 막대는 매도</b>, <b class=\"po-buyc\">초록 막대는 매수</b>이고, 막대가 길수록 금액이 큽니다. 왼쪽 칸은 앞으로 1주일, 오른쪽 칸은 앞으로 1개월 동안의 금액입니다.</p>\n        <div id=\"po-scen\" class=\"dash-skeleton\" data-source=\"flows\" style=\"min-height:200px\"></div>\n        <ul class=\"po-points\" id=\"po-scen-points\"></ul>\n      </section>\n      <section class=\"po-card po-span\" id=\"po-sec-cta-hist\">\n        <h3>③ 이 추정은 지난 몇 주 동안 어떻게 바뀌었나</h3>\n        <p class=\"po-note\">위 ②번의 추정 금액을 보고서가 나온 주별로 나란히 놓았습니다. 맨 왼쪽이 이번 주이고 오른쪽으로 갈수록 예전입니다. 가로로 읽으면 같은 경우(예: '주가가 오르면')의 추정이 주마다 어떻게 달라졌는지 보입니다. <b class=\"po-sellc\">빨간 칸은 매도</b>, <b class=\"po-buyc\">초록 칸은 매수</b>이고, 색이 짙을수록 금액이 큽니다. 전 세계 주식 기준이고 단위는 억 달러입니다.</p>\n        <div class=\"po-twrap\" id=\"po-hist\" data-source=\"weekly\"></div>\n        <ul class=\"po-points\" id=\"po-hist-points\"></ul>\n      </section>\n    </div>\n  </section>\n  <section id=\"po-sec-cftc3y\">\n    <div class=\"po-h2\"><h2>5. 선물 포지션, 지난 3년과 비교</h2><span>CFTC 공식 자료, 매주 화요일 기준</span></div>\n    <p class=\"po-legend\" style=\"margin-top:8px\">실선이 점선(3년 중간값)보다 위에 있으면 평소보다 많이 사 둔 것이고, 아래에 있으면 평소보다 많이 판 것입니다. 오른쪽 끝의 숫자는 지금 값이 지난 3년 중 몇 % 위치인지를 나타냅니다.</p>\n    <div class=\"po-grid2\" style=\"margin-top:10px\">\n      <section class=\"po-card\"><h3>헤지펀드, 나스닥100 선물</h3><div id=\"po-c3-nq\" class=\"po-chart dash-skeleton\" data-source=\"cftc_history\"></div></section>\n      <section class=\"po-card\"><h3>헤지펀드, S&amp;P500 선물</h3><div id=\"po-c3-spx\" class=\"po-chart dash-skeleton\" data-source=\"cftc_history\"></div></section>\n      <section class=\"po-card\"><h3>자산운용사, S&amp;P500 선물</h3><div id=\"po-c3-am\" class=\"po-chart dash-skeleton\" data-source=\"cftc_history\"></div></section>\n      <section class=\"po-card\" id=\"po-sec-cftc\">\n        <h3>이번 주 숫자</h3>\n        <p class=\"po-note\" id=\"po-cftc-note\">산 계약에서 판 계약을 뺀 값입니다.</p>\n        <div class=\"po-twrap\"><table id=\"po-cftc\" data-source=\"cftc_now\" data-row-key=\"item\">\n          <thead><tr><th data-field=\"item\">상품과 투자자</th><th data-field=\"net\">순계약</th><th data-field=\"wow\">한 주 변화</th><th data-field=\"pct\">3년 중 위치</th></tr></thead><tbody></tbody></table></div>\n      </section>\n    </div>\n  </section>\n  <section id=\"po-sec-fmsblock\">\n    <div class=\"po-h2\"><h2>6. 펀드매니저 설문 자세히 보기</h2><span>BofA 설문, 한 달에 한 번</span></div>\n    <p class=\"po-legend\" style=\"margin-top:8px\">펀드매니저들이 지금 얼마나 사 두었는지를 알려 주는 설문입니다. 항목마다 무슨 숫자인지, 어떤 의미인지, 시장이 어떻게 반응하기 쉬운지, 무엇을 조심해야 하는지, 어떤 경우에 기회가 되는지를 차례로 적었습니다. 시장의 배경을 설명하는 내용이며, 사거나 팔라는 권유가 아닙니다.</p>\n    <div class=\"po-terms\" data-sec=\"fms\" data-source=\"glossary\" hidden></div>\n    <div class=\"po-fmslead\" id=\"po-fmslead\" data-source=\"fms\" hidden></div>\n    <div class=\"po-fmscards\" id=\"po-fms\" data-source=\"fms\"></div>\n    <section class=\"po-card\" id=\"po-sec-fms-next\" style=\"margin-top:var(--po-gap)\">\n      <h3>다음 설문이 나오면 이렇게 읽습니다</h3>\n      <p class=\"po-note\">설문은 한 달에 한 번 나옵니다. 새 숫자가 나오면 아래 세 가지 가운데 어디에 해당하는지를 먼저 봅니다.</p>\n      <div class=\"po-twrap\"><table class=\"po-guide\">\n        <thead><tr><th>새 설문에서 이렇게 나오면</th><th>이런 뜻입니다</th><th>이렇게 대비합니다</th></tr></thead>\n        <tbody>\n          <tr><td>현금 비중이 4.0% 위로 올라오고, 돈이 가장 쏠린 곳으로 꼽힌 비율도 줄었다</td><td>팔 사람은 이미 팔았습니다. 쏠림이 풀리고 있습니다.</td><td>추가 하락의 부담이 줄어든 상태입니다. 주가가 진정되는지, CTA 매도가 멈추는지를 함께 확인합니다.</td></tr>\n          <tr><td>현금 비중이 여전히 4.0% 이하이고, 쏠린 곳과 비율도 그대로다</td><td>급락을 겪고도 아직 덜 팔았습니다.</td><td>팔 물량이 남아 있는 상태입니다. 반등이 나와도 매물이 다시 나오기 쉬우니 서두르지 않는 편이 안전합니다.</td></tr>\n          <tr><td>현금 비중이 5.0% 이상으로 뛰었다</td><td>펀드매니저들이 겁을 먹고 현금을 쌓았습니다. BofA 기준으로는 매수 신호입니다.</td><td>BofA는 비관이 지나친 때를 거꾸로 주식을 살 때로 해석합니다. 다만 신호가 나온 직후에도 주가는 더 내릴 수 있으니, 주가가 실제로 진정되는지를 확인하는 편이 안전합니다.</td></tr>\n        </tbody></table></div>\n    </section>\n  </section>\n  <section id=\"po-sec-next\">\n    <div class=\"po-h2\"><h2>7. 다음 주에 볼 것</h2></div>\n    <ul class=\"po-cal\" id=\"po-cal\" data-source=\"calendar\" style=\"margin-top:10px\"></ul>\n  </section>\n  <section id=\"po-sec-schedule\">\n    <div class=\"po-h2\"><h2>8. 자료가 나오는 날</h2><span>이 화면의 숫자가 언제 새로 바뀌는지</span></div>\n    <div class=\"po-twrap\" style=\"margin-top:10px\"><table id=\"po-sched\" data-source=\"weekly fms_monthly\">\n      <thead><tr><th>자료</th><th>발표</th><th>이 화면 반영</th><th>지금 들어 있는 값</th></tr></thead><tbody></tbody></table></div>\n  </section>\n  <details id=\"po-sec-rules\"><summary>이 화면을 보는 이유와 판정 기준</summary><dl>\n    <dt>이 화면을 보는 이유</dt><dd>시장 흐름판과 와모 대시보드는 주가가 어떻게 움직였는지를 보여 줍니다. 이 화면은 그 뒤에서 누가 주식을 얼마나 사 두었는지, 누가 지금 팔고 있는지, 누가 더 살 돈을 갖고 있는지를 봅니다. 같은 하락이라도 팔 사람이 많이 남아 있으면 길어지고, 이미 다 팔았으면 금방 끝나는 경우가 많기 때문입니다.</dd>\n    <dt>팔고 있음 · 사고 있음</dt><dd>골드만삭스가 추정한 CTA의 1주일 매매(주가가 횡보할 때)가 매도이면 '팔고 있음', 매수이면 '사고 있음'으로 표시합니다.</dd>\n    <dt>더 팔 수 있음</dt><dd>아직 팔지는 않았지만 이미 많이 사 둔 경우입니다. 선물 순매수가 지난 3년 중 90% 위치를 넘거나, 새 설문에서 펀드매니저 현금 비중이 4.0% 이하일 때 이렇게 표시합니다.</dd>\n    <dt>더 살 수 있음</dt><dd>주식을 이미 줄여 놓았거나 현금이 많은 경우입니다. 헤지펀드 순 레버리지가 최근 몇 년 중 낮은 수준일 때, 개인투자자의 비관 응답이 장기 평균보다 10%p 넘게 높을 때, 선물 순매수가 지난 3년 중 10% 위치에 못 미칠 때, 새 설문에서 펀드매니저 현금 비중이 5% 이상일 때 이렇게 표시합니다.</dd>\n    <dt>평소 수준</dt><dd>위의 어느 경우에도 해당하지 않을 때입니다.</dd>\n    <dt>판정 안 함</dt><dd>자료가 오래돼서 지금 상태를 알 수 없을 때입니다. 펀드매니저 설문은 한 달에 한 번 나오기 때문에, 발표 후 14일이 지나면 판정하지 않고 다음 설문을 기다립니다.</dd>\n    <dt>참고</dt><dd>여기 적힌 판정은 보고서의 숫자를 위 기준에 맞춰 본 것일 뿐, 사거나 팔라는 권유가 아닙니다.</dd>\n  </dl></details>\n  <details id=\"po-sec-glossary\"><summary>용어 풀이 전체 보기</summary><dl id=\"po-gloss\" data-source=\"glossary\"></dl></details>\n  <details id=\"po-sec-sources\"><summary>출처</summary><ol class=\"po-src\" id=\"po-src\" data-source=\"sources\"></ol></details>\n</div>";
  const D3 = ["https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js", "https://unpkg.com/d3@7.9.0/dist/d3.min.js"];
  const st = { data: null, loading: null, built: false, cbs: [], calcs: {}, w: 0 };
  const host = () => document.getElementById("viewPositioning");

  function script(urls) {
    return new Promise((ok, no) => {
      if (window.d3) return ok();
      const next = (i) => {
        if (i >= urls.length) return no(new Error("d3"));
        const s = document.createElement("script");
        s.src = urls[i]; s.onload = () => ok(); s.onerror = () => { s.remove(); next(i + 1); };
        document.head.appendChild(s);
      };
      next(0);
    });
  }

  const dash = {
    colors: ["var(--accent)", "var(--ma20)", "var(--ma200)", "var(--good)"],
    meta: {},
    data(name) {
      if (!st.data) return { status: "loading" };
      if (name in st.calcs) return { status: "ok", data: st.calcs[name] };
      const d = st.data.datasets && st.data.datasets[name];
      return d == null ? { status: "missing" } : { status: "ok", data: d };
    },
    calc(name, o) { st.calcDefs = st.calcDefs || []; st.calcDefs.push([name, o]); },
    onData(cb) { st.cbs.push(cb); },
  };

  function page(dash) {
    var q=function(s){return document.querySelector(s)};
    var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
    var num=function(v){var n=Number(v);return v==null||v===''||isNaN(n)?null:n};
    var nf0=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
    var nf1=new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});
    var nf2=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    var sgn=function(v,f){return(v>0?'+':v<0?'-':'')+f(Math.abs(v))};
    var md=function(s){var p=String(s).slice(5,10).split('-');return Number(p[0])+'/'+Number(p[1])};
    var parseD=function(s){return new Date(String(s).slice(0,10))};
    var halo=function(sel){return sel.style('paint-order','stroke').style('stroke','var(--color-panel)').style('stroke-width','4px').style('stroke-linejoin','round')};
    var STC=[['팔고 있음','st-sell'],['사고 있음','st-buy'],['더 팔 수 있음','st-maysell'],['더 살 수 있음','st-maybuy'],['평소 수준','st-norm'],['판정 안 함','st-none']];
    var stClass=function(l){l=String(l||'');for(var i=0;i<STC.length;i++)if(l===STC[i][0])return STC[i][1];return /높음/.test(l)?'st-maysell':/낮음/.test(l)&&!/보통/.test(l)?'st-maybuy':/보통/.test(l)?'st-norm':'st-none'};
    var lvlClass=function(l){l=String(l||'');return /높음/.test(l)?'po-hi':/낮음/.test(l)&&!/보통/.test(l)?'po-lo':/보통/.test(l)?'po-mid':''};

    function fail(el,d){
      el.classList.remove('dash-skeleton');
      el.innerHTML=d.status==='missing'?'<div class="po-fail">아직 자료가 없습니다</div>':'<div class="po-fail"><span class="po-dot"></span>불러오지 못함</div>';
    }
    function ready(el,d){
      if(d.status==='loading'){el.classList.add('dash-skeleton');return false}
      if(d.status!=='ok'){fail(el,d);return false}
      el.classList.remove('dash-skeleton');return true;
    }
    function tipFor(card){
      var t=card.querySelector(':scope > .po-tip');
      if(!t){t=document.createElement('div');t.className='po-tip';card.appendChild(t)}
      return {
        show:function(evt,html){
          t.innerHTML=html;t.style.display='block';
          var r=card.getBoundingClientRect(),x=evt.clientX-r.left+12,y=evt.clientY-r.top+12;
          var w=t.offsetWidth,h=t.offsetHeight;
          if(x+w>r.width-6)x=Math.max(6,evt.clientX-r.left-w-12);
          if(y+h>r.height-6)y=Math.max(6,evt.clientY-r.top-h-12);
          t.style.left=x+'px';t.style.top=y+'px';
        },
        hide:function(){t.style.display='none'}
      };
    }
    function measure(svg,texts,size){
      var m=svg.append('text').attr('font-size',size||11).attr('opacity',0),w=0;
      texts.forEach(function(s){m.text(s);try{w=Math.max(w,m.node().getComputedTextLength())}catch(e){w=Math.max(w,String(s).length*7)}});
      m.remove();return w;
    }

    dash.calc('cftc_now',{
      inputs:['weekly','cftc_history'],
      title:'CFTC 이번 주와 지난 기록 비교',
      description:'가장 최근 보고서의 CFTC 순계약과 그 직전 기록의 차이입니다.',
      fn:(weekly,hist)=>{
        const rows=weekly.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
        const last=rows[rows.length-1]||{};
        const items=[['S&P500 헤지펀드','spx_hf'],['S&P500 자산운용사','spx_am'],['나스닥100 헤지펀드','nq_hf'],['나스닥100 자산운용사','nq_am'],['10년물 헤지펀드','ty_hf'],['10년물 자산운용사','ty_am']];
        return items.map(([item,k])=>{
          const prev=rows.slice(0,-1).reverse().find(r=>r[k]!=null);
          const net=last[k]==null?null:Number(last[k]);
          const hv=(hist||[]).map(h=>h[k]).filter(v=>v!=null);
          const pct=net!=null&&hv.length?Math.round(hv.filter(v=>v<=net).length/hv.length*100):null;
          return {item,net,wow:net!=null&&prev?net-Number(prev[k]):null,pct,prev_date:prev?prev.cftc_date:null,date:last.cftc_date||null};
        });
      }
    });

    function weeklyRows(){
      var d=dash.data('weekly');
      if(d.status!=='ok')return null;
      return (d.data||[]).slice().sort(function(a,b){return String(a.date).localeCompare(String(b.date))});
    }

    function renderHead(){
      var d=dash.data('article'),h=q('#po-headline'),k=q('#po-dek');
      [h,k].forEach(function(el){if(d.status==='loading')el.classList.add('dash-skeleton');else el.classList.remove('dash-skeleton')});
      if(d.status!=='ok'){h.textContent=d.status==='loading'?'—':'해설을 불러오지 못했습니다';k.textContent='';return}
      var rows=d.data||[];
      var hl=rows.find(function(r){return r.part==='headline'}),dk=rows.find(function(r){return r.part==='dek'});
      h.textContent=hl?hl.text:'—';k.textContent=dk?dk.text:'';
      var s=dash.data('summary');
      document.querySelectorAll('.po-smark').forEach(function(el){
        if(s.status!=='ok'){el.textContent='—';return}
        var key=(el.getAttribute('data-where')||'').slice(4);
        var r=(s.data||[]).find(function(x){return x.key===key});
        el.textContent=r&&r.value!=null?String(r.value):'—';
      });
    }

    function renderChips(){}

    function renderNotes(){
      var el=q('#po-notes'),d=dash.data('notes');
      var rows=d.status==='ok'?(d.data||[]):[];
      el.hidden=!rows.length;
      el.innerHTML='';
      if(!rows.length)return;
      var h=document.createElement('b');h.textContent='읽기 전에 알아 둘 점 '+rows.length+'가지';el.appendChild(h);
      var g=document.createElement('div');g.className='po-ngrid';
      rows.forEach(function(r,i){
        var c=document.createElement('div');c.className='po-nitem';
        var t=document.createElement('strong');t.textContent=(i+1)+'. '+(r.title||'알아 둘 점');c.appendChild(t);
        var x=document.createElement('span');x.textContent=r.text;c.appendChild(x);
        g.appendChild(c);
      });
      el.appendChild(g);
    }

    function spark(host,pts,risk,ref){
      var W=Math.max(140,host.clientWidth||200),H=42;
      host.innerHTML='';
      var svg=d3.select(host).append('svg').attr('width','100%').attr('viewBox','0 0 '+W+' '+H);
      var vals=pts.filter(function(p){return p.v!=null});
      if(vals.length<2){svg.append('text').attr('x',0).attr('y',H-6).attr('font-size',11).style('fill','var(--color-fg-muted)').text(vals.length?'기록이 한 번뿐입니다':'기록 없음');return}
      var ext=d3.extent(vals.map(function(p){return p.v}).concat(ref!=null?[ref]:[]));
      if(ext[0]===ext[1]){ext=[ext[0]-1,ext[1]+1]}
      var x=d3.scalePoint(pts.map(function(p){return p.k}),[4,W-6]);
      var y=d3.scaleLinear(ext,[H-5,5]);
      if(ref!=null)svg.append('line').attr('x1',4).attr('x2',W-6).attr('y1',y(ref)).attr('y2',y(ref)).attr('stroke-dasharray','3 3').style('stroke','var(--cds-chart-reference)');
      var line=d3.line().x(function(p){return x(p.k)}).y(function(p){return y(p.v)});
      svg.append('path').attr('d',line(vals)).attr('fill','none').style('stroke',dash.colors[0]).attr('stroke-width',2).attr('stroke-linecap','round').attr('stroke-linejoin','round');
      vals.forEach(function(p,i){svg.append('circle').attr('cx',x(p.k)).attr('cy',y(p.v)).attr('r',i===vals.length-1?3.6:2).style('fill',dash.colors[0])});
    }

    function renderArticle(){
      var el=q('#po-sec-story'),d=dash.data('article');
      if(d.status==='loading')return;
      if(d.status!=='ok'){fail(el,d);return}
      var rows=d.data||[];
      el.innerHTML='';
      rows.forEach(function(r){
        if(r.part==='lead'){var p=document.createElement('p');p.className='po-lead';p.textContent=r.text;el.appendChild(p)}
        if(r.part==='section'){
          var h=document.createElement('h3');h.textContent=r.title||'';el.appendChild(h);
          String(r.text||'').split(/\n\s*\n/).forEach(function(par){if(!par.trim())return;var p=document.createElement('p');p.textContent=par.trim();el.appendChild(p)});
        }
      });
    }

    function renderTrail(){
      var host=q('#po-trail'),cap=q('#po-trail-cap'),d=dash.data('weekly');
      if(!ready(host,d)){cap.textContent='';return}
      var rows=weeklyRows();
      var pts=rows.map(function(r){
        var has=num(r.spx)!=null&&num(r.cta_mid)!=null;
        return{k:r.date,pd:r.price_date,spx:num(r.spx),mid:num(r.cta_mid),v:has?(r.spx/r.cta_mid-1)*100:null,f:num(r.w1_flat)};
      });
      var vv=pts.filter(function(p){return p.v!=null});
      host.innerHTML='';
      if(!vv.length){host.innerHTML='<div class="po-fail">은행이 공개한 CTA 자료가 아직 없습니다</div>';cap.textContent='';return}
      var W=Math.max(280,host.clientWidth||320),H=270,narrow=W<460;
      var svg=d3.select(host).append('svg').attr('width','100%').attr('viewBox','0 0 '+W+' '+H);
      var m=Math.max(1,d3.max(vv,function(p){return Math.abs(p.v)})*2.2);
      var ml=44,mr=narrow?40:70,top=30,bot=H-44;
      var x=d3.scalePoint(pts.map(function(p){return p.k}),[ml+(narrow?26:46),W-mr]);
      var y=d3.scaleLinear([-m,m],[bot,top]);
      svg.append('rect').attr('x',ml).attr('y',top).attr('width',W-ml-6).attr('height',y(0)-top).style('fill','color-mix(in srgb, var(--color-ok) 8%, transparent)');
      svg.append('rect').attr('x',ml).attr('y',y(0)).attr('width',W-ml-6).attr('height',bot-y(0)).style('fill','color-mix(in srgb, var(--color-bad) 9%, transparent)');
      svg.append('line').attr('x1',ml).attr('x2',W-6).attr('y1',y(0)).attr('y2',y(0)).attr('stroke-width',2).style('stroke','var(--color-fg)');
      svg.append('text').attr('x',ml+6).attr('y',top-8).attr('font-size',11).attr('font-weight',600).style('fill','var(--color-ok)').text(narrow?'트리거 위: 들고 있음':'중기 트리거 위: CTA가 주식을 들고 있는 구간');
      svg.append('text').attr('x',ml+6).attr('y',bot-6).attr('font-size',11).attr('font-weight',600).style('fill','var(--color-bad)').text(narrow?'트리거 아래: 팜':'중기 트리거 아래: CTA가 파는 구간');
      d3.ticks(-m*0.8,m*0.8,4).forEach(function(t){
        svg.append('text').attr('x',ml-6).attr('y',y(t)+4).attr('text-anchor','end').attr('font-size',11).style('fill','var(--color-fg-muted)').text(t===0?'0%':sgn(t,nf1.format)+'%');
      });
      if(vv.length>1)svg.append('path').attr('d',d3.line().x(function(p){return x(p.k)}).y(function(p){return y(p.v)})(vv)).attr('fill','none').attr('stroke-width',2).attr('stroke-dasharray',vv.length<pts.length?'5 4':null).style('stroke','var(--cds-chart-reference)');
      var tip=tipFor(host.closest('.po-card'));
      var flowTxt=function(f){return f==null?'예상 매매 미공개':nf0.format(Math.abs(f))+'억 달러 '+(f<0?'매도':f>0?'매수':'변화 없음')};
      pts.forEach(function(p,i){
        svg.append('text').attr('x',x(p.k)).attr('y',H-24).attr('text-anchor','middle').attr('font-size',11).style('fill','var(--color-fg-muted)').text(md(p.k)+' 보고');
        if(p.v==null){
          svg.append('text').attr('x',x(p.k)).attr('y',H-8).attr('text-anchor','middle').attr('font-size',11).style('fill','var(--color-fg-muted)').text('자료 없음');
          return;
        }
        var col=p.f==null?'var(--cds-chart-muted)':p.f<0?'var(--color-bad)':'var(--color-ok)';
        var last=p===vv[vv.length-1];
        svg.append('circle').attr('cx',x(p.k)).attr('cy',y(p.v)).attr('r',last?7:5).style('fill',col).style('stroke','var(--color-panel)').attr('stroke-width',2)
          .on('mousemove',function(evt){tip.show(evt,'<span>'+esc(mdK(p.pd||p.k))+' 종가</span><br>S&amp;P500 '+esc(nf2.format(p.spx))+'<br>중기 트리거 '+esc(nf0.format(p.mid))+'<br>거리 '+esc(sgn(p.v,nf1.format))+'%<br>다음 1주 '+esc(flowTxt(p.f)))}).on('mouseleave',tip.hide);
        var up=p.v>=0,ty=up?y(p.v)-26:y(p.v)+20;
        halo(svg.append('text').attr('x',x(p.k)).attr('y',ty).attr('text-anchor','middle').attr('font-size',12).attr('font-weight',700).style('fill','var(--color-fg)')).text(sgn(p.v,nf1.format)+'%');
        halo(svg.append('text').attr('x',x(p.k)).attr('y',ty+14).attr('text-anchor','middle').attr('font-size',11).attr('font-weight',600).style('fill',col)).text(p.f==null?'미공개':nf0.format(Math.abs(p.f))+'억 '+(p.f<0?'매도':'매수'));
        svg.append('text').attr('x',x(p.k)).attr('y',H-8).attr('text-anchor','middle').attr('font-size',11).style('fill','var(--color-fg-muted)').text(md(p.pd||p.k)+' 종가');
      });
      var l=vv[vv.length-1],pv=vv[vv.length-2],below=vv.filter(function(p){return p.v<0}).length,run=0;
      for(var i=vv.length-1;i>=0&&(vv[i].v<0)===(l.v<0);i--)run++;
      var txt;
      if(!pv)txt=l.v<0?'첫 기록부터 종가가 중기 트리거보다 낮습니다.':'첫 기록에서는 종가가 중기 트리거보다 높습니다.';
      else if(l.v<0&&pv.v>=0)txt='종가가 매주 트리거에 가까워지다가 이번 주에 '+(below===1?'처음으로 ':'')+'그 아래로 내려왔습니다.';
      else if(l.v<0)txt='종가가 '+run+'주째 중기 트리거 아래에 머물고 있어 CTA 매도가 이어지고 있습니다.';
      else if(pv.v<0)txt='종가가 이번 주에 중기 트리거 위로 다시 올라와 CTA 매도가 잦아들고 있습니다.';
      else txt='종가가 '+run+'주째 중기 트리거 위에 있습니다. '+(l.v<pv.v?'다만 트리거와의 거리는 지난번보다 좁혀졌습니다.':'트리거와의 거리도 지난번보다 벌어졌습니다.');
      var miss=pts.filter(function(p){return p.v==null});
      if(miss.length)txt+=' '+miss.map(function(p){return mdK(p.k)}).join(', ')+' 보고서 때는 은행 자료가 공개되지 않아 비워 두었습니다.';
      cap.textContent=txt;
    }

    function renderFmsTrail(){
      var host=q('#po-fmstrail'),cap=q('#po-fms-cap'),tb=q('#po-fmsm tbody'),d=dash.data('fms_monthly');
      tb.innerHTML='';
      if(!ready(host,d)){cap.textContent='';return}
      var rows=(d.data||[]).slice().sort(function(a,b){return String(a.month).localeCompare(String(b.month))});
      var mon=function(k){return Number(String(k).slice(5,7))+'월'};
      var pts=rows.map(function(r){return{k:r.month,v:num(r.cash),c:num(r.crowded_pct),nm:r.crowded,rel:r.release}});
      var vv=pts.filter(function(p){return p.v!=null});
      host.innerHTML='';
      rows.slice().reverse().forEach(function(r){
        var tr=document.createElement('tr');tr.setAttribute('data-key',r.month);
        var cell=function(t,n){var c=document.createElement('td');if(n)c.className='po-num';c.textContent=t;tr.appendChild(c)};
        cell(mon(r.month)+' 설문');
        cell(num(r.cash)==null?'확인 못 함':nf1.format(r.cash)+'%',true);
        cell(num(r.equity_net)==null?'확인 못 함':sgn(r.equity_net,nf0.format)+'%p',true);
        cell(num(r.tech_net)==null?'확인 못 함':sgn(r.tech_net,nf0.format)+'%p',true);
        cell(r.crowded?(r.crowded+(num(r.crowded_pct)!=null?' '+nf0.format(r.crowded_pct)+'%':'')):'확인 못 함');
        tb.appendChild(tr);
      });
      if(!vv.length){host.innerHTML='<div class="po-fail">현금 비중을 확인한 설문이 아직 없습니다</div>';cap.textContent='';return}
      var REF=4.0,W=Math.max(280,host.clientWidth||320),H=286,narrow=W<460;
      var svg=d3.select(host).append('svg').attr('width','100%').attr('viewBox','0 0 '+W+' '+H);
      var m=Math.max(0.5,d3.max(vv,function(p){return Math.abs(p.v-REF)})*2.2);
      var ml=44,mr=narrow?44:70,top=30,bot=H-60;
      var x=d3.scalePoint(pts.map(function(p){return p.k}),[ml+(narrow?26:46),W-mr]);
      var y=d3.scaleLinear([REF-m,REF+m],[bot,top]);
      svg.append('rect').attr('x',ml).attr('y',top).attr('width',W-ml-6).attr('height',y(REF)-top).style('fill','color-mix(in srgb, var(--color-ok) 8%, transparent)');
      svg.append('rect').attr('x',ml).attr('y',y(REF)).attr('width',W-ml-6).attr('height',bot-y(REF)).style('fill','color-mix(in srgb, var(--color-bad) 9%, transparent)');
      svg.append('line').attr('x1',ml).attr('x2',W-6).attr('y1',y(REF)).attr('y2',y(REF)).attr('stroke-width',2).style('stroke','var(--color-fg)');
      svg.append('text').attr('x',ml+6).attr('y',top-8).attr('font-size',11).attr('font-weight',600).style('fill','var(--color-ok)').text(narrow?'4.0% 위: 현금 넉넉':'4.0% 위: 현금을 넉넉히 들고 있던 달');
      svg.append('text').attr('x',ml+6).attr('y',bot-6).attr('font-size',11).attr('font-weight',600).style('fill','var(--color-bad)').text(narrow?'4.0% 이하: 매도 신호':'4.0% 이하: BofA 매도 신호(현금이 적었던 달)');
      d3.ticks(REF-m*0.8,REF+m*0.8,4).forEach(function(t){
        svg.append('text').attr('x',ml-6).attr('y',y(t)+4).attr('text-anchor','end').attr('font-size',11).style('fill','var(--color-fg-muted)').text(nf1.format(t)+'%');
      });
      if(vv.length>1)svg.append('path').attr('d',d3.line().x(function(p){return x(p.k)}).y(function(p){return y(p.v)})(vv)).attr('fill','none').attr('stroke-width',2).attr('stroke-dasharray',vv.length<pts.length?'5 4':null).style('stroke','var(--cds-chart-reference)');
      var tip=tipFor(host.closest('.po-card'));
      pts.forEach(function(p){
        svg.append('text').attr('x',x(p.k)).attr('y',H-40).attr('text-anchor','middle').attr('font-size',11).attr('font-weight',600).style('fill','var(--color-fg-muted)').text(mon(p.k)+' 설문');
        svg.append('text').attr('x',x(p.k)).attr('y',H-24).attr('text-anchor','middle').attr('font-size',11).style('fill','var(--color-fg-muted)').text(p.v==null?'현금 비중 미확인':(p.rel?md(p.rel)+' 발표':'발표일 미확인'));
        svg.append('text').attr('x',x(p.k)).attr('y',H-8).attr('text-anchor','middle').attr('font-size',11).style('fill','var(--color-fg-muted)').text(p.c!=null?(p.nm||'쏠린 곳')+' '+nf0.format(p.c)+'%':'쏠린 곳 미확인');
        if(p.v==null)return;
        var low=p.v<=REF,col=low?'var(--color-bad)':'var(--color-ok)',last=p===vv[vv.length-1];
        svg.append('circle').attr('cx',x(p.k)).attr('cy',y(p.v)).attr('r',last?7:5).style('fill',col).style('stroke','var(--color-panel)').attr('stroke-width',2)
          .on('mousemove',function(evt){tip.show(evt,'<span>'+esc(mon(p.k))+' 설문'+(p.rel?' · '+esc(mdK(p.rel))+' 발표':'')+'</span><br>현금 비중 '+esc(nf1.format(p.v))+'%<br>매도 신호 기준 4.0%'+(p.nm?'<br>돈이 가장 쏠린 곳 '+esc(p.nm)+(p.c!=null?' '+esc(nf0.format(p.c))+'%':''):''))}).on('mouseleave',tip.hide);
        var up=p.v>REF,ty=up?y(p.v)-14:y(p.v)+22;
        halo(svg.append('text').attr('x',x(p.k)).attr('y',ty).attr('text-anchor','middle').attr('font-size',12).attr('font-weight',700).style('fill','var(--color-fg)')).text('현금 '+nf1.format(p.v)+'%');
      });
      var l=vv[vv.length-1],lowN=vv.filter(function(p){return p.v<=REF}).length;
      var txt=lowN===vv.length?'현금 비중이 확인된 '+vv.length+'번 모두 매도 신호 기준을 밑돌았습니다.':lowN===0?'현금 비중이 확인된 '+vv.length+'번 모두 매도 신호 기준보다 높았습니다.':'현금 비중이 확인된 '+vv.length+'번 가운데 '+lowN+'번은 매도 신호 기준을 밑돌았습니다.';
      var cc=pts.filter(function(p){return p.c!=null});
      if(cc.length>1){var c0=cc[0],c1=cc[cc.length-1];txt+=" '돈이 가장 쏠린 곳'으로 꼽은 응답은 "+mon(c0.k)+' 이후 '+(c1.c<c0.c?'줄어드는 추세입니다.':'늘어나는 추세입니다.')}
      var sm=dash.data('summary'),basis=null;
      if(sm.status==='ok'){var br=(sm.data||[]).find(function(r){return r.key==='기준일'});basis=br?br.value:null}
      if(l.rel&&basis){
        var age=daysBetween(l.rel,basis);
        txt+=age>14?' 가장 최근 설문이 '+age+'일 전에 나온 것이어서 이번 주 판정에는 쓰지 않았습니다.':' 가장 최근 설문이 나온 지 '+age+'일밖에 되지 않아 이번 주 판정에 썼습니다.';
      }
      cap.textContent=txt;
    }

    function renderTerms(){
      var d=dash.data('glossary'),rows=d.status==='ok'?(d.data||[]):[];
      document.querySelectorAll('#po .po-terms').forEach(function(el){
        var sec=el.getAttribute('data-sec'),mine=rows.filter(function(r){return r.sec===sec});
        el.hidden=!mine.length;el.innerHTML='';
        if(!mine.length)return;
        var h=document.createElement('b');h.textContent='먼저 알아 둘 말 '+mine.length+'가지';el.appendChild(h);
        var dl=document.createElement('dl');
        mine.forEach(function(r){
          var w=document.createElement('div'),t=document.createElement('dt'),x=document.createElement('dd');
          t.textContent=r.term;x.textContent=r.def;w.appendChild(t);w.appendChild(x);dl.appendChild(w);
        });
        el.appendChild(dl);
      });
    }

    function renderVNotes(){
      var el=q('#po-vnotes'),d=dash.data('verdict');
      el.innerHTML='';
      if(d.status!=='ok')return;
      (d.data||[]).forEach(function(r){
        var li=document.createElement('li');
        var b=document.createElement('b');b.textContent=r.group;li.appendChild(b);
        var st=document.createElement('span');st.className='po-st '+stClass(r.level);st.textContent=r.level;li.appendChild(st);
        if(r.note){var t=document.createElement('span');t.textContent=r.note;li.appendChild(t)}
        el.appendChild(li);
      });
    }

    function renderVHist(){
      var ul=q('#po-vhist'),d=dash.data('weekly');
      ul.innerHTML='';
      if(d.status!=='ok')return;
      weeklyRows().slice().reverse().forEach(function(r){
        var li=document.createElement('li');li.id='rec-'+r.date;
        var b=document.createElement('b');b.className='po-num';b.textContent=mdK(r.date);li.appendChild(b);
        var t=document.createElement('span');
        if(r.record){t.setAttribute('data-source','weekly');t.setAttribute('data-field','record');t.setAttribute('data-where','date='+r.date);t.textContent=r.record}
        else{t.textContent='이 주의 판정 기록 문장이 없습니다.'}
        li.appendChild(t);ul.appendChild(li);
      });
    }

    function lineChart(host,rows,series,opts){
      opts=opts||{};
      var W=Math.max(260,host.clientWidth||320),H=opts.h||220;
      host.innerHTML='';
      var svg=d3.select(host).append('svg').attr('width','100%').attr('viewBox','0 0 '+W+' '+H);
      var keys=rows.map(function(r){return r.date});
      var vals=[];series.forEach(function(s){rows.forEach(function(r){var v=s.get(r);if(v!=null)vals.push(v)})});
      if(!vals.length){host.innerHTML='<div class="po-fail">자료가 없습니다</div>';return}
      var ext=d3.extent(vals),pad=(ext[1]-ext[0])*0.12||Math.abs(ext[0])*0.02||1;
      var y=d3.scaleLinear([ext[0]-pad,ext[1]+pad],[H-26,10]).nice(4);
      var ticks=y.ticks(4);
      var yw=measure(svg,ticks.map(opts.yfmt||nf0.format)),ew=measure(svg,series.map(function(s){return s.name+' 0,000'}));
      var ml=Math.ceil(yw)+10,mr=Math.ceil(ew)+12;
      var x=d3.scalePoint(keys,[ml+8,W-mr]);
      ticks.forEach(function(t){
        svg.append('line').attr('x1',ml).attr('x2',W-mr+4).attr('y1',y(t)).attr('y2',y(t)).style('stroke','var(--cds-chart-grid)');
        svg.append('text').attr('x',ml-6).attr('y',y(t)+4).attr('text-anchor','end').attr('font-size',11).style('fill','var(--color-fg-muted)').text((opts.yfmt||nf0.format)(t));
      });
      keys.forEach(function(k){svg.append('text').attr('x',x(k)).attr('y',H-8).attr('text-anchor','middle').attr('font-size',11).style('fill','var(--color-fg-muted)').text(md(k))});
      var tip=tipFor(host.closest('.po-card')),ends=[];
      series.forEach(function(s){
        var pts=rows.map(function(r){return{k:r.date,v:s.get(r)}});
        var line=d3.line().x(function(p){return x(p.k)}).y(function(p){return y(p.v)});
        svg.append('path').attr('d',line(pts.filter(function(p){return p.v!=null}))).attr('fill','none').style('stroke',s.color).attr('stroke-width',s.dash?1.6:2.4).attr('stroke-dasharray',s.dash?'5 4':null).attr('stroke-linecap','round').attr('stroke-linejoin','round');
        var vv=pts.filter(function(p){return p.v!=null});
        vv.forEach(function(p){
          svg.append('circle').attr('cx',x(p.k)).attr('cy',y(p.v)).attr('r',s.dash?2.6:3.6).style('fill',(s.flag&&s.flag(p))?'var(--color-bad)':s.color)
            .on('mousemove',function(evt){tip.show(evt,'<span>'+esc(p.k)+'</span><br>'+esc(s.name)+' '+esc((opts.vfmt||nf2.format)(p.v)))}).on('mouseleave',tip.hide);
        });
        if(vv.length){var l=vv[vv.length-1];ends.push({x:x(l.k),y:y(l.v),t:s.name+' '+(opts.efmt||nf0.format)(l.v),c:s.color})}
      });
      ends.sort(function(a,b){return a.y-b.y});
      for(var i=1;i<ends.length;i++)if(ends[i].y-ends[i-1].y<13)ends[i].y=ends[i-1].y+13;
      ends.forEach(function(e){halo(svg.append('text').attr('x',e.x+8).attr('y',e.y+4).attr('font-size',11).attr('font-weight',600).style('fill',e.c)).text(e.t)});
    }

    function renderTLevels(){
      var host=q('#po-tlevels'),d=dash.data('weekly');
      if(!ready(host,d))return;
      var rows=weeklyRows();
      lineChart(host,rows,[
        {name:'S&P500',get:function(r){return num(r.spx)},color:dash.colors[0],flag:function(p){var r=rows.find(function(x){return x.date===p.k});return r&&r.cta_mid!=null&&r.spx<r.cta_mid}},
        {name:'단기',get:function(r){return num(r.cta_short)},color:'var(--cds-chart-muted)',dash:true},
        {name:'중기',get:function(r){return num(r.cta_mid)},color:'var(--color-bad)',dash:true},
        {name:'장기',get:function(r){return num(r.cta_long)},color:'var(--cds-chart-reference)',dash:true}
      ],{h:240,yfmt:nf0.format,vfmt:nf2.format,efmt:nf0.format});
    }

    function miniLine(host,pts,o){
      var W=Math.max(150,host.clientWidth||180),H=96;
      host.innerHTML='';
      var svg=d3.select(host).append('svg').attr('width','100%').attr('viewBox','0 0 '+W+' '+H);
      var vv=pts.filter(function(p){return p.v!=null});
      if(!vv.length){svg.append('text').attr('x',2).attr('y',H/2).attr('font-size',11).style('fill','var(--color-fg-muted)').text('기록 없음');return}
      var ext=d3.extent(vv.map(function(p){return p.v}).concat(o.ref!=null?[o.ref]:[]).concat(o.bars?[0]:[]));
      var pad=(ext[1]-ext[0])*0.18||Math.abs(ext[0])*0.05||1;
      var y=d3.scaleLinear(o.bars?[Math.min(0,ext[0]),ext[1]+pad]:[ext[0]-pad,ext[1]+pad],[H-18,8]);
      var x=d3.scalePoint(pts.map(function(p){return p.k}),o.bars?[24,W-24]:[8,W-8]);
      if(o.ref!=null){
        svg.append('line').attr('x1',4).attr('x2',W-4).attr('y1',y(o.ref)).attr('y2',y(o.ref)).attr('stroke-dasharray','3 3').style('stroke','var(--cds-chart-reference)');
        halo(svg.append('text').attr('x',W-4).attr('y',y(o.ref)-3).attr('text-anchor','end').attr('font-size',10).style('fill','var(--color-fg-muted)')).text(o.refLabel||'');
      }
      if(o.bars){
        var bw=Math.min(22,(W-16)/pts.length*0.5);
        vv.forEach(function(p){svg.append('rect').attr('x',x(p.k)-bw/2).attr('width',bw).attr('y',Math.min(y(p.v),y(0))).attr('height',Math.max(1,Math.abs(y(p.v)-y(0)))).attr('rx',3).style('fill',dash.colors[0]).attr('opacity',.85);
          halo(svg.append('text').attr('x',x(p.k)).attr('y',Math.min(y(p.v),y(0))-3).attr('text-anchor','middle').attr('font-size',10).style('fill','var(--color-fg-muted)')).text(o.vlab?o.vlab(p.v):p.v)});
      }else{
        var line=d3.line().x(function(p){return x(p.k)}).y(function(p){return y(p.v)});
        svg.append('path').attr('d',line(vv)).attr('fill','none').style('stroke',dash.colors[0]).attr('stroke-width',2).attr('stroke-linecap','round').attr('stroke-linejoin','round');
        vv.forEach(function(p,i){svg.append('circle').attr('cx',x(p.k)).attr('cy',y(p.v)).attr('r',i===vv.length-1?3.6:2.4).style('fill',dash.colors[0])});
      }
      pts.forEach(function(p,i){if(o.bars||i===0||i===pts.length-1)svg.append('text').attr('x',x(p.k)).attr('y',H-4).attr('text-anchor',o.bars?'middle':i===0?'start':'end').attr('font-size',10).style('fill','var(--color-fg-muted)').text(o.klab(p.k))});
    }

    function renderMinis(sel,src,defs,keyName,klab){
      var host=q(sel),d=dash.data(src);
      if(!ready(host,d))return;
      var rows=(d.data||[]).slice().sort(function(a,b){return String(a[keyName]).localeCompare(String(b[keyName]))});
      host.innerHTML='';
      var jobs=[];
      defs.forEach(function(df){
        var box=document.createElement('div');box.className='po-mini';
        var b=document.createElement('b');b.textContent=df.name;box.appendChild(b);
        var pts=rows.map(function(r){return{k:r[keyName],v:df.get(r)}});
        var vv=pts.filter(function(p){return p.v!=null});
        var mv=document.createElement('div');mv.className='po-mval';
        if(vv.length){
          var l=vv[vv.length-1],p=vv[vv.length-2];
          mv.textContent='최근 '+df.fmt(l.v)+(p?' · 이전 '+df.fmt(p.v):'');
        }else mv.textContent='기록 없음';
        box.appendChild(mv);
        var ch=document.createElement('div');box.appendChild(ch);
        host.appendChild(box);
        jobs.push([ch,pts,{ref:df.ref,refLabel:df.refLabel,bars:df.bars,vlab:df.fmt,klab:klab}]);
      });
      jobs.forEach(function(j){miniLine(j[0],j[1],j[2])});
    }


    var won=function(v){return nf0.format(Math.abs(v))+'억 달러 '+(v<0?'매도':v>0?'매수':'변화 없음')};
    var wonS=function(v){return nf0.format(Math.abs(v))+'억 '+(v<0?'매도':v>0?'매수':'0')};
    function pointsList(sel,items){
      var ul=q(sel);ul.innerHTML='';
      items.forEach(function(it){var li=document.createElement('li');if(it[0]){var b=document.createElement('b');b.textContent=it[0];li.appendChild(b)}li.appendChild(document.createTextNode(it[1]));ul.appendChild(li)});
    }
    function renderCtaLadder(){
      var host=q('#po-ladder'),d=dash.data('weekly'),badge=q('#po-lad-badge');
      if(!ready(host,d)){pointsList('#po-lad-points',[]);badge.hidden=true;return}
      var rows=weeklyRows(),latest=rows[rows.length-1];
      var r=rows.slice().reverse().find(function(x){return num(x.cta_mid)!=null&&num(x.cta_short)!=null&&num(x.cta_long)!=null&&num(x.spx)!=null});
      host.innerHTML='';
      if(!r){host.innerHTML='<div class="po-fail">은행이 공개한 트리거 자료가 아직 없습니다</div>';pointsList('#po-lad-points',[]);badge.hidden=true;return}
      var age=latest&&r!==latest?daysBetween(r.cta_src_date||r.date,latest.date):0;
      badge.hidden=false;badge.className='po-badge '+(r===latest?'ok':'warn');
      badge.textContent=r===latest?'이번 주 자료':age+'일 전 자료';
      var px=num(r.spx),T=[{n:'단기',v:num(r.cta_short)},{n:'중기',v:num(r.cta_mid)},{n:'장기',v:num(r.cta_long)}].sort(function(a,b){return b.v-a.v});
      var top=T[0].v,bot=T[2].v,span=top-bot||1;
      var hi=Math.max(top+span*0.3,px+span*0.12),lo=Math.min(bot-span*0.3,px-span*0.12);
      var W=Math.max(280,host.clientWidth||320),H=330,narrow=W<420;
      var svg=d3.select(host).append('svg').attr('width','100%').attr('viewBox','0 0 '+W+' '+H);
      var y=d3.scaleLinear([lo,hi],[H-10,10]);
      var bx=narrow?92:120,bw=Math.max(110,W-bx-(narrow?104:150));
      var zones=[
        {a:hi,b:T[0].v,t:'팔지 않음',s:'세 트리거보다 모두 위',c:'color-mix(in srgb, var(--color-ok) 22%, var(--color-panel))'},
        {a:T[0].v,b:T[1].v,t:'조금 팖',s:'단기 트리거만 밑돎',c:'color-mix(in srgb, var(--color-bad) 14%, var(--color-panel))'},
        {a:T[1].v,b:T[2].v,t:'본격적으로 팖',s:'단기·중기 트리거를 밑돎',c:'color-mix(in srgb, var(--color-bad) 32%, var(--color-panel))'},
        {a:T[2].v,b:lo,t:'가장 많이 팖',s:'세 트리거를 모두 밑돎',c:'color-mix(in srgb, var(--color-bad) 55%, var(--color-panel))'}
      ];
      var zi=px>=T[0].v?0:px>=T[1].v?1:px>=T[2].v?2:3;
      zones.forEach(function(z,i){
        var y0=y(z.a),h=y(z.b)-y(z.a);
        svg.append('rect').attr('x',bx).attr('y',y0).attr('width',bw).attr('height',h).style('fill',z.c).attr('stroke-width',i===zi?2:0).style('stroke','var(--color-fg)');
        var cy=y0+h/2,two=h>=34&&!narrow;
        svg.append('text').attr('x',bx+bw/2).attr('y',cy+(two?-2:4)).attr('text-anchor','middle').attr('font-size',13).attr('font-weight',700).style('fill','var(--color-fg)').text(z.t);
        if(two)svg.append('text').attr('x',bx+bw/2).attr('y',cy+13).attr('text-anchor','middle').attr('font-size',10.5).style('fill','var(--color-fg)').text(z.s);
      });
      T.forEach(function(t){
        svg.append('line').attr('x1',bx-6).attr('x2',bx+bw).attr('y1',y(t.v)).attr('y2',y(t.v)).attr('stroke-width',1.5).style('stroke','var(--color-fg)');
        svg.append('text').attr('x',bx-10).attr('y',y(t.v)-3).attr('text-anchor','end').attr('font-size',11).attr('font-weight',700).style('fill','var(--color-fg)').text(t.n+' 트리거');
        svg.append('text').attr('x',bx-10).attr('y',y(t.v)+10).attr('text-anchor','end').attr('font-size',11).style('fill','var(--color-fg-muted)').text(nf0.format(t.v));
      });
      var py=y(px),ax=bx+bw;
      svg.append('line').attr('x1',bx).attr('x2',ax+10).attr('y1',py).attr('y2',py).attr('stroke-width',2).attr('stroke-dasharray','4 3').style('stroke',dash.colors[0]);
      svg.append('path').attr('d','M'+(ax+2)+','+py+' l12,-7 l0,14 z').style('fill',dash.colors[0]);
      svg.append('text').attr('x',ax+18).attr('y',py-2).attr('font-size',12).attr('font-weight',700).style('fill',dash.colors[0]).text('지금 '+nf2.format(px));
      svg.append('text').attr('x',ax+18).attr('y',py+12).attr('font-size',10.5).style('fill','var(--color-fg-muted)').text(mdK(r.price_date||r.date)+' 종가');
      var below=T.filter(function(t){return px<t.v}),names=below.map(function(t){return t.n}).reverse();
      var up=below.length?below[below.length-1]:null;
      var stopT=T[0],downT=T.filter(function(t){return px>=t.v})[0]||null;
      var pct=function(v){return nf1.format(Math.abs((v/px-1)*100))};
      var items=[];
      items.push(['지금',below.length===0?'주가가 세 트리거보다 모두 위에 있습니다. CTA가 팔지 않는 구간입니다.':'주가가 세 트리거 가운데 '+below.length+'개('+T.filter(function(t){return px<t.v}).map(function(t){return t.n}).join('·')+')를 밑돌고 있습니다. CTA가 '+zones[zi].t.replace('팖','파는')+' 구간입니다.']);
      if(below.length)items.push(['매도가 멈추려면','주가가 '+pct(stopT.v)+'% 올라 단기 트리거인 '+nf0.format(stopT.v)+' 위로 올라서야 합니다.'+(up&&up!==stopT?' 먼저 '+pct(up.v)+'% 올라 '+up.n+' 트리거인 '+nf0.format(up.v)+' 선을 되찾으면 매도가 줄어듭니다.':'')]);
      if(downT)items.push([below.length?'매도가 더 커지는 경우':'매도가 시작되는 경우','주가가 '+pct(downT.v)+'% 더 내려 '+downT.n+' 트리거인 '+nf0.format(downT.v)+' 선이 깨질 때입니다.'+(downT===T[2]?' 그러면 세 트리거를 모두 밑돌아 매도가 가장 커집니다.':'')]);
      else items.push(['더 내려가면','이미 세 트리거를 모두 밑돌고 있어 매도가 가장 큰 구간입니다.']);
      if(r!==latest)items.push(['참고','이번 주에는 은행 자료가 공개되지 않아 '+mdK(r.cta_src_date||r.date)+' 기준 트리거를 그대로 보여 드립니다.']);
      pointsList('#po-lad-points',items);
    }
    function dvCell(v,max){
      var c=document.createElement('div');
      if(v==null){c.className='po-dv none';var l0=document.createElement('div');l0.className='lab';l0.textContent='자료 없음';c.appendChild(l0);return c}
      c.className='po-dv '+(v<0?'sell':'buy');
      var l=document.createElement('div');l.className='lab';l.textContent=wonS(v);c.appendChild(l);
      var t=document.createElement('div');t.className='track';var i=document.createElement('i');i.style.width=Math.max(1.5,Math.abs(v)/max*50)+'%';t.appendChild(i);c.appendChild(t);
      return c;
    }
    var SCN=[['상승','주가가 오르면'],['횡보','제자리면(횡보)'],['하락','주가가 내리면']];
    function renderCtaScen(){
      var host=q('#po-scen'),d=dash.data('flows');
      if(!ready(host,d)){pointsList('#po-scen-points',[]);return}
      var rows=d.data||[];host.innerHTML='';
      if(!rows.length){host.innerHTML='<div class="po-fail">이번 주에는 은행이 공개한 추정 금액이 없습니다</div>';pointsList('#po-scen-points',[]);return}
      var scopes=[];rows.forEach(function(r){if(scopes.indexOf(r.scope)<0)scopes.push(r.scope)});
      var title={'전 세계 CTA':'전 세계 주식 전체','S&P500만':'그중 미국 S&P500만'};
      scopes.forEach(function(sc){
        var rs=rows.filter(function(r){return r.scope===sc});
        var max=d3.max(rs,function(r){return Math.max(Math.abs(num(r.w1)||0),Math.abs(num(r.m1)||0))})||1;
        var blk=document.createElement('div');blk.className='po-scenblock';
        var h=document.createElement('h4');h.textContent=(title[sc]||sc)+' · 단위 억 달러';blk.appendChild(h);
        var g=document.createElement('div');g.className='po-scengrid';
        ['','앞으로 1주일','앞으로 1개월'].forEach(function(t){var e=document.createElement('div');e.className='hd';e.textContent=t;g.appendChild(e)});
        SCN.forEach(function(k){
          var r=rs.find(function(x){return x.scenario===k[0]});if(!r)return;
          var rl=document.createElement('div');rl.className='rl';rl.textContent=k[1];g.appendChild(rl);
          g.appendChild(dvCell(num(r.w1),max));g.appendChild(dvCell(num(r.m1),max));
        });
        blk.appendChild(g);
        var ax=document.createElement('div');ax.className='po-axisnote';ax.innerHTML='<span>← 가운데 선 왼쪽은 매도</span><span>오른쪽은 매수 →</span>';blk.appendChild(ax);
        host.appendChild(blk);
      });
      var g0=rows.filter(function(r){return r.scope===scopes[0]}),get=function(n){return g0.find(function(x){return x.scenario===n})||{}};
      var up=get('상승'),fl=get('횡보'),dn=get('하락'),w=[num(up.w1),num(fl.w1),num(dn.w1)].filter(function(v){return v!=null});
      var items=[];
      if(w.length===3){
        if(w.every(function(v){return v<0}))items.push(['앞으로 1주일','세 경우 모두 빨간 막대입니다. 주가가 올라도, 제자리여도, 내려도 CTA는 판다는 뜻입니다. 오르면 '+won(up.w1)+', 제자리면 '+won(fl.w1)+', 내리면 '+won(dn.w1)+'입니다.']);
        else if(w.every(function(v){return v>0}))items.push(['앞으로 1주일','세 경우 모두 초록 막대입니다. 주가가 어느 쪽으로 움직여도 CTA는 산다는 뜻입니다.']);
        else items.push(['앞으로 1주일','오르면 '+won(up.w1)+', 제자리면 '+won(fl.w1)+', 내리면 '+won(dn.w1)+'입니다. 주가 방향에 따라 사고파는 쪽이 갈립니다.']);
      }
      if(num(up.m1)!=null&&num(up.w1)!=null&&(up.m1>0)!==(up.w1>0))items.push(['한 달로 넓혀 보면','주가가 오르는 경우의 막대 색이 바뀝니다. 1주일 동안은 '+won(up.w1)+'이지만, 오름세가 한 달 이어지면 '+won(up.m1)+'로 돌아섭니다.']);
      if(num(dn.m1)!=null)items.push(['가장 긴 막대','주가가 한 달 내내 내리는 경우로, '+won(dn.m1)+'입니다. CTA 매물이 가장 많이 나오는 경우입니다.']);
      pointsList('#po-scen-points',items);
    }
    function renderCtaHist(){
      var host=q('#po-hist'),d=dash.data('weekly');
      host.innerHTML='';
      if(d.status!=='ok'){pointsList('#po-hist-points',[]);return}
      var rows=weeklyRows().slice(-6).reverse();
      var groups=[['앞으로 1주일 동안',[['w1_up','주가가 오르면'],['w1_flat','제자리면(횡보)'],['w1_down','주가가 내리면']]],['앞으로 1개월 동안',[['m1_up','주가가 오르면'],['m1_flat','제자리면(횡보)'],['m1_down','주가가 내리면']]]];
      var tb=document.createElement('table');tb.className='po-heat';
      var hr=document.createElement('tr');var h0=document.createElement('th');hr.appendChild(h0);
      rows.forEach(function(r,i){var th=document.createElement('th');th.textContent=(i===0?'이번 주 · ':'')+md(r.date)+' 보고';hr.appendChild(th)});tb.appendChild(hr);
      groups.forEach(function(gp){
        var keys=gp[1].map(function(k){return k[0]});
        var max=d3.max(rows,function(r){return d3.max(keys,function(k){return Math.abs(num(r[k])||0)})})||1;
        var gr=document.createElement('tr');var gh=document.createElement('th');gh.className='grp';gh.colSpan=rows.length+1;gh.textContent=gp[0];gr.appendChild(gh);tb.appendChild(gr);
        gp[1].forEach(function(k){
          var tr=document.createElement('tr');var th=document.createElement('th');th.className='rl';th.textContent=k[1];tr.appendChild(th);
          rows.forEach(function(r){
            var v=num(r[k[0]]),td=document.createElement('td');
            if(v==null){td.className='none';td.textContent='자료 없음'}
            else{var a=Math.round(12+Math.abs(v)/max*48);td.style.background='color-mix(in srgb, var('+(v<0?'--color-bad':'--color-ok')+') '+a+'%, var(--color-panel))';td.textContent=wonS(v)}
            tr.appendChild(td);
          });
          tb.appendChild(tr);
        });
      });
      host.appendChild(tb);
      var has=rows.slice().reverse().filter(function(r){return num(r.w1_flat)!=null}),items=[];
      if(has.length>=2){
        var c=has[has.length-1],p=has[has.length-2],lab={w1_up:'주가가 오르면',w1_flat:'제자리면',w1_down:'주가가 내리면'};
        var flips=['w1_up','w1_flat','w1_down'].filter(function(k){return num(c[k])!=null&&num(p[k])!=null&&(c[k]<0)!==(p[k]<0)});
        if(flips.length)items.push(['색이 바뀐 칸',md(p.date)+' 보고와 비교하면 '+flips.map(function(k){return "'"+lab[k]+"'이 "+won(p[k])+'에서 '+won(c[k])+'로'}).join(', ')+' 바뀌었습니다.'+(c.w1_up<0&&p.w1_up>=0?' 주가가 올라도 판다는 추정이 나온 것은 기록한 기간 가운데 '+(has.filter(function(r){return r.w1_up<0}).length===1?'이번이 처음입니다.':'드문 일입니다.'):'')]);
        else items.push(['지난번과 비교',md(p.date)+' 보고와 사고파는 방향은 같고 금액만 달라졌습니다. 제자리일 때 '+won(p.w1_flat)+'에서 '+won(c.w1_flat)+'로 바뀌었습니다.']);
        if(num(c.m1_down)!=null&&num(p.m1_down)!=null)items.push(['한 달 내내 내릴 때',"팔 금액은 "+won(p.m1_down)+'에서 '+won(c.m1_down)+'로 '+(Math.abs(c.m1_down)<Math.abs(p.m1_down)?'줄었습니다. 이미 일부를 판 만큼 남은 물량이 줄었다고 볼 만합니다.':'늘었습니다.')]);
      }
      var miss=rows.filter(function(r){return num(r.w1_flat)==null});
      if(miss.length)items.push(['빈칸',miss.map(function(r){return md(r.date)}).join(', ')+' 보고 때는 은행 자료가 공개되지 않았습니다.']);
      pointsList('#po-hist-points',items);
    }

    function renderCftc(){
      var tb=q('#po-cftc tbody'),d=dash.data('cftc_now'),note=q('#po-cftc-note');
      tb.innerHTML='';
      if(d.status!=='ok')return;
      var rows=d.data||[];
      var dt=rows.length&&rows[0].date,pd=rows.find(function(r){return r.prev_date});
      note.textContent='산 계약에서 판 계약을 뺀 값입니다. '+(dt?mdK(dt)+' 기준이고':'')+(pd?', 한 주 변화는 '+mdK(pd.prev_date)+' 기준 값과 비교했습니다.':'.');
      rows.forEach(function(r){
        var tr=document.createElement('tr');tr.setAttribute('data-key',r.item);
        var a=document.createElement('td');a.className='po-strong';a.textContent=r.item;tr.appendChild(a);
        var b=document.createElement('td');b.className='po-num';b.textContent=r.net==null?'확인 못 함':sgn(r.net,nf0.format);tr.appendChild(b);
        var c=document.createElement('td');c.className='po-num';
        if(r.wow==null)c.textContent='—';else{c.textContent=sgn(r.wow,nf0.format);c.style.color=r.wow>0?'var(--color-ok)':r.wow<0?'var(--color-bad)':''}
        tr.appendChild(c);
        var e=document.createElement('td');e.className='po-num';e.textContent=r.pct==null?'—':r.pct+'%';tr.appendChild(e);
        tb.appendChild(tr);
      });
    }

    function renderFms(){
      var host=q('#po-fms'),lead=q('#po-fmslead'),d=dash.data('fms');
      host.innerHTML='';lead.hidden=true;lead.innerHTML='';
      if(d.status!=='ok')return;
      var rows=d.data||[];
      var mo=dash.data('fms_monthly'),last=null;
      if(mo.status==='ok'){var ms=(mo.data||[]).slice().sort(function(a,b){return String(a.month).localeCompare(String(b.month))});last=ms[ms.length-1]||null}
      var sm=dash.data('summary'),basis=null;
      if(sm.status==='ok'){var br=(sm.data||[]).find(function(r){return r.key==='기준일'});basis=br?br.value:null}
      var which=last?Number(String(last.month).slice(5,7))+'월 설문':'가장 최근 설문';
      var ageTxt=last&&last.release&&basis?' · '+mdK(last.release)+' 발표, '+daysBetween(last.release,basis)+'일 전':'';
      var fmt=function(v,u){if(v==null||v==='')return null;if(typeof v==='string')return v;var n=Number(v);return (u==='%p'&&n>0?'+':'')+(Math.round(n)===n?nf0.format(n):nf1.format(n))+u};
      var Q=[['what','무슨 숫자인가',''],['meaning','어떤 의미인가',''],['market','시장은 어떻게 반응하기 쉬운가','q-market'],['caution','조심할 점','q-caution'],['chance','기회가 되는 경우','q-chance']];
      rows.forEach(function(r){
        if(r.item==='한눈에'){
          lead.hidden=false;
          var b=document.createElement('b');b.textContent=which+' 한눈에 보기'+ageTxt;lead.appendChild(b);
          var p=document.createElement('p');p.textContent=r.meaning||'';lead.appendChild(p);
          return;
        }
        var u=r.unit?String(r.unit):'';
        var c=document.createElement('article');c.className='po-fcard';c.id='fms-'+String(r.item).replace(/[^가-힣A-Za-z0-9]+/g,'-');
        var hd=document.createElement('div');hd.className='hd';
        var h=document.createElement('h4');h.textContent=r.item;hd.appendChild(h);
        var v=document.createElement('span');v.className='val';v.textContent=fmt(r.value,u)||'—';hd.appendChild(v);
        var pv=fmt(r.prev,u);
        if(pv){var pe=document.createElement('span');pe.className='prev';pe.textContent=(r.prev_label?r.prev_label+' 설문 ':'이전 ')+pv;hd.appendChild(pe)}
        c.appendChild(hd);
        var dl=document.createElement('dl');
        Q.forEach(function(k){
          if(!r[k[0]])return;
          var w=document.createElement('div');if(k[2])w.className=k[2];
          var dt=document.createElement('dt');dt.textContent=k[1];var dd=document.createElement('dd');dd.textContent=r[k[0]];
          w.appendChild(dt);w.appendChild(dd);dl.appendChild(w);
        });
        c.appendChild(dl);host.appendChild(c);
      });
    }
    function renderCal(){
      var el=q('#po-cal'),d=dash.data('calendar');
      if(d.status!=='ok'){el.innerHTML='';return}
      el.innerHTML=(d.data||[]).map(function(r){return '<li><span class="po-when">'+esc(r.when)+'</span><span class="po-what">'+esc(r.what)+'</span>'+(r.why?'<span class="po-why">'+esc(r.why)+'</span>':'')+'</li>'}).join('');
    }

    function renderRefs(){
      var g=dash.data('glossary'),s=dash.data('sources');
      q('#po-gloss').innerHTML=g.status==='ok'?(g.data||[]).map(function(r){return '<dt>'+esc(r.term)+'</dt><dd>'+esc(r.def)+'</dd>'}).join(''):'';
      var ol=q('#po-src');ol.innerHTML='';
      if(s.status!=='ok')return;
      (s.data||[]).forEach(function(r){
        var li=document.createElement('li');
        if(r.url&&/^https:\/\//.test(r.url)){var a=document.createElement('a');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=r.label;li.appendChild(a)}
        else li.appendChild(document.createTextNode(r.label));
        if(r.date)li.appendChild(document.createTextNode(' ('+r.date+')'));
        ol.appendChild(li);
      });
    }

    function renderParts(){
      var host=q('#po-parts'),bal=q('#po-balance'),d=dash.data('participants');
      if(d.status!=='ok'){host.innerHTML=d.status==='loading'?'':'<div class="po-fail">참여자 자료가 없습니다</div>';bal.innerHTML='';return}
      var rows=(d.data||[]).slice();
      var ord={};STC.forEach(function(k,i){ord[k[0]]=i});
      rows.sort(function(a,b){return (ord[a.stance]==null?9:ord[a.stance])-(ord[b.stance]==null?9:ord[b.stance])});
      bal.innerHTML='';bal.className='po-groups';
      STC.forEach(function(k){
        var who=rows.filter(function(r){return r.stance===k[0]}).map(function(r){return r.who});
        if(!who.length)return;
        var g=document.createElement('span');g.className='po-gi';
        var st=document.createElement('span');st.className='po-st '+k[1];st.textContent=k[0]+' '+who.length;g.appendChild(st);
        var t=document.createElement('span');t.textContent=who.join(', ');g.appendChild(t);
        bal.appendChild(g);
      });
      host.innerHTML='';
      rows.forEach(function(r){
        var k=stClass(r.stance);
        var c=document.createElement('div');c.className='po-part '+k;
        var h=document.createElement('div');h.className='po-pwho';var w=document.createElement('span');w.textContent=r.who;h.appendChild(w);
        var st=document.createElement('span');st.className='po-st '+k;st.style.marginRight='0';st.textContent=r.stance;h.appendChild(st);c.appendChild(h);
        var m=document.createElement('div');m.className='po-pmet';m.textContent=r.metric;c.appendChild(m);
        var n=document.createElement('div');n.className='po-pnow';n.textContent=r.now;c.appendChild(n);
        if(r.change){var g=document.createElement('div');g.className='po-pchg';g.textContent=r.change;c.appendChild(g)}
        var rd=document.createElement('div');rd.className='po-pread';rd.textContent=r.read;c.appendChild(rd);
        host.appendChild(c);
      });
    }


    var daysBetween=function(a,b){return Math.round((parseD(b)-parseD(a))/864e5)};
    var mdK=function(s){var p=String(s).slice(5,10).split('-');return Number(p[0])+'월 '+Number(p[1])+'일'};

    function renderChanges(){
      var el=q('#po-changes'),d=dash.data('changes');
      el.parentNode.hidden=!(d.status==='ok'&&(d.data||[]).length);
      if(d.status!=='ok')return;
      el.innerHTML=(d.data||[]).map(function(r){return '<li>'+esc(r.text)+'</li>'}).join('');
    }

    function renderNextUp(){
      var el=q('#po-nextup'),age=q('#po-age'),box=q('#po-cadence'),m=dash.meta||{};
      if(m.next_update){var n=parseD(m.next_update);el.textContent='다음 갱신 '+(n.getMonth()+1)+'월 '+n.getDate()+'일(수) 오후 1시쯤'}
      if(m.basis_date){
        var t=new Date(Date.now()+9*3600e3).toISOString().slice(0,10),d=daysBetween(m.basis_date,t);
        age.textContent=d<=0?'오늘 갱신':d+'일 전 숫자';
        var late=m.next_update&&t>m.next_update;
        box.classList.toggle('po-late',!!late);
        if(late)age.textContent=d+'일 전 숫자 · 이번 주 갱신이 아직 들어오지 않았습니다';
      }
    }

    function renderSched(){
      var tb=q('#po-sched tbody'),wk=weeklyRows()||[],dm=dash.data('fms_monthly');
      var last=function(k){var r=wk.slice().reverse().find(function(x){return x[k]!=null});return r};
      var cta=last('cta_mid'),cf=last('cftc_date'),aa=last('aaii_bear');
      var mo=dm.status==='ok'?(dm.data||[]).filter(function(r){return r.cash!=null||r.crowded_pct!=null}).map(function(r){return r.month}).sort():[];
      var rows=[
        ['CTA 트리거와 예상 매매','은행이 고객에게만 보내고, 일부가 정해진 날 없이 기사로 공개됩니다','기사가 나온 주의 수요일',cta?mdK(cta.cta_src_date||cta.date)+' 추정':'없음'],
        ['CFTC 선물 포지션','매주 금요일 오후(미국), 한국 시간 토요일 새벽. 그 주 화요일 기준 숫자입니다','다음 수요일',cf?mdK(cf.cftc_date)+' 기준':'없음'],
        ['AAII 개인 설문','매주 목요일(미국)','다음 수요일',aa?mdK(aa.date)+' 보고에 반영':'없음'],
        ['BofA 펀드매니저 설문','매달 중순 한 번','발표 뒤 첫 수요일',mo.length?mo[mo.length-1].slice(0,4)+'년 '+Number(mo[mo.length-1].slice(5))+'월 설문':'없음'],
        ['헤지펀드 순 레버리지','골드만삭스 자료가 기사로 공개될 때만','공개된 주의 수요일','보고서 본문 참고']];
      tb.innerHTML=rows.map(function(r){return '<tr>'+r.map(function(c){return '<td>'+esc(c)+'</td>'}).join('')+'</tr>'}).join('');
    }

    function c3y(sel,key,label){
      var host=q(sel),d=dash.data('cftc_history');
      if(!ready(host,d))return;
      var rows=(d.data||[]).filter(function(r){return r[key]!=null}).sort(function(a,b){return String(a.date).localeCompare(String(b.date))});
      if(!rows.length){host.innerHTML='<div class="po-fail">자료가 없습니다</div>';return}
      var vals=rows.map(function(r){return r[key]/10000}),sorted=vals.slice().sort(function(a,b){return a-b});
      var med=sorted[Math.floor(sorted.length/2)],now=vals[vals.length-1];
      var pct=Math.round(vals.filter(function(v){return v<=now}).length/vals.length*100);
      var W=Math.max(260,host.clientWidth||320),H=200,ml=44,mr=96;
      host.innerHTML='';
      var svg=d3.select(host).append('svg').attr('width','100%').attr('viewBox','0 0 '+W+' '+H);
      var x=d3.scaleLinear([0,rows.length-1],[ml,W-mr]),ext=d3.extent(vals.concat([0])),y=d3.scaleLinear(ext,[H-24,10]).nice(4);
      y.ticks(4).forEach(function(t){svg.append('line').attr('x1',ml).attr('x2',W-mr).attr('y1',y(t)).attr('y2',y(t)).style('stroke',t===0?'var(--cds-chart-axis)':'var(--cds-chart-grid)');
        svg.append('text').attr('x',ml-6).attr('y',y(t)+4).attr('text-anchor','end').attr('font-size',11).style('fill','var(--color-fg-muted)').text(nf0.format(t)+'만')});
      var seen={};rows.forEach(function(r,i){var yy=String(r.date).slice(0,4);if(!seen[yy]&&i>4){seen[yy]=1;svg.append('text').attr('x',x(i)).attr('y',H-6).attr('text-anchor','middle').attr('font-size',11).style('fill','var(--color-fg-muted)').text(yy+'년')}else seen[yy]=1});
      svg.append('line').attr('x1',ml).attr('x2',W-mr).attr('y1',y(med)).attr('y2',y(med)).attr('stroke-dasharray','4 4').style('stroke','var(--cds-chart-reference)');
      var my=Math.abs(y(med)-y(now))<16?y(med)+(y(med)>y(now)?16:-10):y(med)+4;halo(svg.append('text').attr('x',W-mr+8).attr('y',my).attr('font-size',10.5).style('fill','var(--color-fg-muted)')).text('중간값 '+sgn(med,nf1.format)+'만');
      svg.append('path').attr('d',d3.line().x(function(v,i){return x(i)}).y(function(v){return y(v)})(vals)).attr('fill','none').style('stroke',dash.colors[0]).attr('stroke-width',1.8);
      svg.append('circle').attr('cx',x(vals.length-1)).attr('cy',y(now)).attr('r',4).style('fill',dash.colors[0]);
      halo(svg.append('text').attr('x',x(vals.length-1)+8).attr('y',y(now)+4).attr('font-size',11.5).attr('font-weight',700).style('fill',dash.colors[0])).text(sgn(now,nf1.format)+'만, '+pct+'%');
      var tip=tipFor(host.closest('.po-card')),guide=svg.append('line').attr('y1',10).attr('y2',H-24).style('stroke','var(--cds-chart-reference)').style('display','none');
      svg.append('rect').attr('x',ml).attr('y',0).attr('width',W-mr-ml).attr('height',H).style('fill','transparent')
        .on('mousemove',function(evt){var i=Math.max(0,Math.min(rows.length-1,Math.round(x.invert(d3.pointer(evt)[0]))));guide.attr('x1',x(i)).attr('x2',x(i)).style('display',null);
          tip.show(evt,'<span>'+esc(rows[i].date)+'</span><br>'+esc(label)+' '+sgn(vals[i],nf2.format)+'만 계약')}).on('mouseleave',function(){guide.style('display','none');tip.hide()});
      var p=document.createElement('p');p.className='po-note';p.textContent=mdK(rows[rows.length-1].date)+' 기준 '+sgn(now,nf1.format)+'만 계약, 지난 3년 중 '+pct+'% 위치입니다.';host.appendChild(p);
    }

    dash.onData(function(){
      renderHead();renderNotes();renderParts();renderArticle();
      renderTerms();renderTrail();renderFmsTrail();renderVNotes();renderVHist();
  
      renderNextUp();renderSched();
      c3y('#po-c3-nq','nq_hf','헤지펀드 나스닥100');c3y('#po-c3-spx','spx_hf','헤지펀드 S&P500');c3y('#po-c3-am','spx_am','자산운용사 S&P500');
      renderCtaLadder();renderCtaScen();renderCtaHist();renderCftc();renderFms();renderCal();renderRefs();
    });
  }

  function draw() {
    (st.calcDefs || []).forEach(([name, o]) => {
      try { st.calcs[name] = o.fn(...o.inputs.map((i) => (st.data.datasets || {})[i] || [])); } catch (e) { st.calcs[name] = []; }
    });
    st.cbs.forEach((cb) => { try { cb(); } catch (e) { console.error("positioning", e); } });
    st.w = host().clientWidth;
  }

  async function show() {
    const el = host();
    if (!st.built) {
      if (!st.loading) st.loading = Promise.all([
        fetch("data/positioning.json?v=" + Date.now(), { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
        script(D3),
      ]);
      try { [st.data] = await st.loading; }
      catch (e) { st.loading = null; el.innerHTML = '<div id="po"><p class="po-meta-fail">포지셔닝 자료를 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p></div>'; return; }
      dash.meta = st.data;
      el.innerHTML = HTML;
      page(dash);
      st.built = true;
    }
    requestAnimationFrame(draw);
  }

  let t = null;
  addEventListener("resize", () => {
    if (!st.built || host().hidden) return;
    clearTimeout(t);
    t = setTimeout(() => { if (Math.abs(host().clientWidth - st.w) > 20) draw(); }, 200);
  });
  window.__positioning = { show };
})();
