// 출장 서류 양식 — 원본: 학교 공무국외출장 서식(hwpx·hwp·xlsx)의 표 구조를 그대로 옮김
// 출장 하나(db.trips)에 서류 여러 장이 붙음. 칸 표시는 forms.js와 같고, 추가로
//   data-trip  : 출장 정보에 같이 저장되는 칸 (계획서에 쓴 출장 목적이 귀국신고서에도 그대로)
//   data-auto  : 비어 있으면 출장 정보로 계산해 보여 줌 (period-ko·period-dot·period-nights·period-md·country·country-org·grant·today-ko·age·mileage-total)
//   class="choice" data-options="a|b|c" : □/☑ 고르기 (data-multi 면 여러 개)
//   data-sign  : 서명 자리 (내 정보의 서명 이미지, 없으면 '(서명)')
(() => {
  const SRC = ''; // 원본 파일 이름만 적어 둠 (src)
  const fill = (key, attrs = '', cls = 'fill') => `<div class="${cls}" data-f="${key}" ${attrs}></div>`;
  const line = (key, attrs = '') => `<span class="line" data-f="${key}" ${attrs}></span>`;
  const choice = (key, opts, multi = false) => `<span class="choice" data-f="${key}" data-options="${opts}"${multi ? ' data-multi' : ''}></span>`;
  const rep = (n, fn) => Array.from({ length: n }, (_, i) => fn(i + 1)).join('');
  const cols = ws => `<colgroup>${ws.map(w => `<col style="width:${w}%">`).join('')}</colgroup>`;
  // 원본 표의 칸 너비(한글 단위)를 비율로
  const pct = ws => { const t = ws.reduce((a, b) => a + b, 0); return ws.map(w => +(w / t * 100).toFixed(2)); };

  // ---------- 공무 국외 출장 계획서 [별지 제1-1호] + 서약서 [별지 제1-4호] ----------
  // <!--page--> 에서 쪽이 나뉨
  const plan = `
<div class="form-no">[별지 제1-1호 서식] &lt;개정 2022. 5. 12.&gt;</div>
<h1 class="spaced">공무 국외 출장 계획서</h1>
<div class="sec">1. 출장개요</div>
<table class="f-tbl">${cols(pct([96, 383]))}
  <tr><td class="label">출 장 목 적</td><td>${fill('출장 목적', 'data-trip')}</td></tr>
  <tr><td class="label">출 장 동 기<br>및 배 경</td><td>${fill('출장 동기', 'data-trip')}</td></tr>
  <tr><td class="label">건전학회 여부</td><td>${fill('건전학회 여부', 'data-trip data-ph="O / X (※본교 홈페이지 – 연구/산학 – 학술대회에서 조회 가능)"')}</td></tr>
  <tr><td class="label">출 장 기 간</td><td>${fill('출장 기간', 'data-auto="period-ko" data-ph="20  년  월  일 - 20  년  월  일 (  일간)"')}</td></tr>
  <tr><td class="label">출 장 국</td><td>${fill('출장국 표기', 'data-auto="country-org" data-ph="국가(도시) [방문(파견)기관 : ]"')}</td></tr>
</table>
<table class="f-tbl join">${cols(pct([96, 51, 108, 225]))}
  <tr><td class="label" rowspan="2">가족 동반 여부</td><td rowspan="2">${fill('가족 동반', 'data-ph="O / X"', 'fill center')}</td>
    <td class="label">가족 동반 사유</td><td>${choice('가족 동반 사유', '공무수행|여가 활용|기타')} (사유: ${line('가족 동반 기타 사유')})</td></tr>
  <tr><td class="label small">가족 동반시 가족 경비 지출 방식</td><td>${choice('가족 경비 지출', '자비|출장여비|초청자 지원')}</td></tr>
</table>
<table class="f-tbl join">${cols(pct([96, 77, 39, 41, 58, 36, 57, 72]))}
  <tr><td class="label" rowspan="6">출 장 자</td><td class="label" rowspan="2">소 속</td><td class="label" rowspan="2">직 급</td><td class="label" rowspan="2">성 명</td>
    <td class="label" rowspan="2">성별</td><td class="label" rowspan="2">연령</td><td class="label" colspan="2">출 장 경 비</td></tr>
  <tr><td class="label">금 액</td><td class="label">부 담 기 관</td></tr>
  <tr><td>${fill('출장자1 소속', 'data-profile="dept"')}</td><td>${fill('출장자1 직급', 'data-profile="rank"', 'fill center')}</td><td>${fill('출장자1 성명', 'data-profile="name"', 'fill center')}</td>
    <td>${fill('출장자1 성별', 'data-profile="gender"', 'fill center')}</td><td>${fill('출장자1 연령', 'data-auto="age"', 'fill center')}</td>
    <td>${fill('출장자1 금액', 'data-ph="천원"', 'fill right')}</td><td>${fill('출장자1 부담기관', 'data-auto="grant"', 'fill small')}</td></tr>
  ${rep(3, i => `<tr>${['소속', '직급', '성명', '성별', '연령', '금액', '부담기관'].map(c => `<td>${fill(`출장자${i + 1} ${c}`, '', c === '소속' || c === '부담기관' ? 'fill small' : 'fill center')}</td>`).join('')}</tr>`)}
</table>
<div class="note-sm mt6">첨부 1. 초청장(번역문 첨부) 또는 계약서, 내부결재 등 국외출장을 증명할 수 있는 서류 사본(미국에 6개월 이상 장기공무국외출장을 하고자 하는 경우 DS-2019 FORM을 첨부하여야 함.)<br>
&emsp;&emsp;2. 경비부담 확인서(내역 포함)&emsp;3. 연구일정 및 연구계획서(1학기 이상 강의가 면제되는 경우)<br>
※ 작성요령 1. 여백이 부족한 경우 별지사용 가능 2. 1학기 이상 강의가 면제되는 장기공무국외출장은 반드시 학과장 확인을 받아야 함.</div>
<!--page-->
<div class="sec">2. 출장일정</div>
<table class="f-tbl">${cols(pct([60, 69, 71, 71, 96, 87]))}
  <tr class="th"><td class="label">년 월 일<br>(요 일)</td><td class="label">출 발 지</td><td class="label">도 착 지</td><td class="label">방 문 기 관</td><td class="label">업무수행 내용</td><td class="label">접촉예정인물</td></tr>
  ${rep(4, i => `<tr>${['날짜', '출발지', '도착지', '방문기관', '업무', '접촉인물'].map(c => `<td>${fill(`일정${i} ${c}`, '', 'fill small')}</td>`).join('')}</tr>`)}
</table>
<div class="note-sm">* 출장일정, 방문예정지 및 방문기관 등을 구체적으로 명시하되 2인 이상이 동행하는 경우는 개인별업무수행 내용을 구체적으로 명시</div>
<div class="sec">3. 출장경비 <span class="note-sm">* 등급별로 표시바람</span></div>
<table class="f-tbl">${cols(pct([46, 46, 46, 46, 46, 52, 46, 46, 76]))}
  <tr><td class="label" rowspan="2">성 명</td><td class="label" rowspan="2">계</td><td class="label" rowspan="2">항공운임</td><td class="label" colspan="3">체 재 비</td>
    <td class="label" rowspan="2">준비금</td><td class="label" rowspan="2">교육비</td><td class="label" rowspan="2">기 타</td></tr>
  <tr><td class="label">일 비</td><td class="label">숙박비</td><td class="label">식 비</td></tr>
  ${rep(2, i => `<tr>${['성명', '계', '항공운임', '일비', '숙박비', '식비', '준비금', '교육비', '기타'].map(c => `<td>${fill(`경비${i} ${c}`, i === 1 && c === '성명' ? 'data-profile="name"' : (c === '일비' || c === '숙박비' || c === '식비') ? 'data-ph="원 x 일"' : '', 'fill small center')}</td>`).join('')}</tr>`)}
</table>
<div class="sec">4. 출장효과</div>
${fill('출장 효과', 'data-trip data-ph="출장으로 기대하는 효과"', 'fill boxed')}
<div class="sec">5. 외교통상부 협조</div>
${fill('외교부 협조', 'data-trip data-ph="※ 재외공관 협조여부와 그 내용을 기재"', 'fill boxed')}`;

  const oath = `
<div class="form-no">[별지 제1-4호 서식]</div>
<div class="oath">
  <h1 class="spaced big">서 약 서</h1>
  <p class="oath-lead">본인은 공무국외출장을 수행함에 있어 다음 사항을 준수할 것을 엄숙히 서약합니다.</p>
  <ol class="oath-list">
    <li>본인은 국외출장계획을 준수하고, 그 목적을 달성하기 위하여 최선을 다하겠습니다.</li>
    <li>본인은 국위를 손상하거나 대한민국 국민으로서 품위를 훼손하는 언행을 하지 않겠습니다.</li>
    <li>본인은 국외출장 귀국 후, 출장보고서를 충실히 작성하여 기한 내 제출하겠습니다.</li>
    <li>본인은 국외출장 중 발생한 특이사항에 대해서는 신속히 보고하겠습니다.</li>
  </ol>
  <div class="date-line">${line('서약 날짜', 'data-auto="today-ko" data-ph="20   년   월   일"')}</div>
  <div class="oath-sign">
    <div>서약자</div>
    <div>소 속 : ${line('서약자 소속', 'data-profile="dept"')}</div>
    <div>직급(위) : ${line('서약자 직급', 'data-profile="rank"')}</div>
    <div>성 명 : ${line('서약자 성명', 'data-profile="name"')} <span data-sign></span></div>
  </div>
</div>`;

  // ---------- 부실 학회 점검 체크리스트 [별지 제1-3호] ----------
  const checks = [
    ['이 학회에 대해 들어본 적이 있습니까?', '만약 학회 이름을 한 번도 들어본 적이 없다면, 등록 전에 추가적인 확인이 필요함'],
    ['누가 이 학술대회를 주관하고 있는지 알고 있습니까?', '본인이 알고 신뢰하는 전문적인 학술 또는 과학 기술 단체(협회)에 의해 학회가 운영되지 않는다면 조심해야 함'],
    ['웹사이트와 이메일 주소는 정상적으로 보입니까?', '이메일이 무료계정을 사용했거나, 웹사이트 url이 무료 웹사이트이고 지난 학회에 대한 기록이 없는 경우 의심스러운 학회일 수 있음'],
    ['본인 또는 동료가 이 학회에 참석한 적이 있습니까?', '본인의 동료, 은사 등이 이 학회에서 한번도 발표한 적이 없다면 참석 결정 전에 한번 더 재고해볼 것'],
    ['학술대회의 범위와 목적이 당신의 연구분야와 관심사에 적합합니까?', '서로 관련이 없는 다양한 학문 분야, 학술 주제를 하나로 결합한 경우 확인 필요'],
    ['대회의 일정, 장소와 의제(프로그램)에 대한 정보가 명확히 제공되고 있습니까?', '대회의 일정을 명시적으로 밝히지 않고 주요 일정이나 개최 장소가 자주 변경되는 경우 부실 학회의 가능성이 있음'],
    ['기조 연설자가 누구인지 밝히고 있습니까?', ''],
    ['논문 초록에 대한 짧은 심사기간과 학회 논문의 학술지 게재를 보장하고 있지는 않습니까?', '논문 초록의 빠른 심사(4주 이내)와 학회 논문의 저널 게재를 보장하는 것은 부실학회의 주요 특징 중 하나임'],
    ['학회가 관광명소나 리조트에서 열립니까?', '학회가 누구나 떠나고 싶어하는 휴가지에서 열리며, 학술대회가 아닌 휴가처럼 선전되는 경우, 관광 프로그램을 홍보하는 경우 부실 가능성이 있음'],
    ['위와 같이 확인하였음에도 참석한 학회가 부실학회라고 판단될 경우 ‘건전학술활동지원 시스템’에 신고하시겠습니까?', 'http://safe.koar.kr → 의심신고 항목에 신고 필요'],
  ];
  const checklist = `
<div class="form-no">[별지 제1-3호 서식]</div>
<h1 class="spaced">부실 학회 점검 체크리스트</h1>
<div class="sec">학술대회명 : ${line('학술회의명', 'data-trip data-auto="title" style="min-width:300px"')}</div>
<table class="f-tbl">${cols(pct([20, 207, 50, 202]))}
  <tr><td class="label"></td><td class="label">점검사항</td><td class="label">O / X / △</td><td class="label">주의사항</td></tr>
  ${checks.map(([q, n], i) => `<tr><td class="center">${i + 1}</td><td>${q}</td><td class="center">${choice(`점검${i + 1}`, 'O|X|△')}</td><td class="small">${n}</td></tr>`).join('')}
</table>
<p class="mt12">해외 학술대회 참가 및 이를 위한 국외여행 승인 신청을 위하여 위의 유의사항을 점검하였음을 확인합니다.</p>
<div class="sign-row">
  <div>소속 : ${line('확인자 소속', 'data-profile="dept"')}</div>
  <div>직위 : ${line('확인자 직위', 'data-profile="rank"')}</div>
  <div>성명 : ${line('확인자 성명', 'data-profile="name"')}<span data-stamp></span></div>
</div>`;

  // ---------- 공무국외출장 귀국신고서 [별지 제4-2호] ----------
  const ret = `
<div class="form-no">[별지 제4-2호 서식]</div>
<h1 class="spaced">공무국외출장 귀국신고서</h1>
<table class="f-tbl">${cols(pct([106, 109, 76, 144]))}
  <tr class="h33"><td class="label">소 속</td><td>${fill('소속', 'data-profile="dept"')}</td><td class="label">직 급</td><td>${fill('직급', 'data-profile="rank"')}</td></tr>
  <tr class="h33"><td class="label">성 명</td><td><span class="inline-fill" data-f="성명" data-profile="name"></span><span data-stamp></span></td><td class="label">출 장 국</td><td>${fill('출장국', 'data-trip')}</td></tr>
  <tr><td class="label" rowspan="2">출 장 목 적<br>(학술회의명)</td><td rowspan="2">${fill('출장 목적', 'data-trip')}</td><td class="label">당초 승인기간</td><td>${fill('당초 승인기간', 'data-auto="period-dot" data-ph="20 . . ∼ 20 . . ( 일간)"', 'fill small')}</td></tr>
  <tr><td class="label">실제 출장기간</td><td>${fill('실제 출장기간', 'data-auto="period-dot" data-ph="20 . . ∼ 20 . . ( 일간)"', 'fill small')}</td></tr>
</table>
<table class="f-tbl join">${cols(pct([41, 65, 163, 119, 48]))}
  <tr><td colspan="5" class="sec-cell">1. 일 정</td></tr>
  <tr><td class="label">일 자</td><td class="label">출 장 국</td><td class="label">수 행 내 역</td><td class="label">특 이 사 항</td><td class="label">비 고</td></tr>
  ${rep(4, i => `<tr>${['일자', '출장국', '수행내역', '특이사항', '비고'].map(c => `<td>${fill(`귀국일정${i} ${c}`, '', 'fill small')}</td>`).join('')}</tr>`)}
  <tr><td colspan="5"><div class="sec-cell">2. 연구(발표)내용</div>${fill('연구 발표 내용', 'data-ph="발표 제목·형식(구두/포스터)·주요 내용"', 'fill tall')}</td></tr>
  <tr><td colspan="5"><div class="sec-cell">3. 주요활동 내역<span class="small">(공식접촉기관 및 인사, 업무수행내용, 기타 활동사항을 간략히 기록)</span></div>${fill('주요활동 내역', '', 'fill tall')}</td></tr>
  <tr><td colspan="5"><div class="sec-cell">4. 기 타</div>${fill('기타', '', 'fill')}</td></tr>
</table>
<div class="note-sm mt6">첨부 : 출입국사실증명서, 항공마일리지신고서, 사진 등 학회 참석 증빙서류 첨부<br>※ 공무국외출장(30일 이하)의 경우에만 작성하되 부족한 경우 별지에 작성</div>
<div class="date-line">${line('신고 날짜', 'data-auto="today-ko" data-ph="20   년   월   일"')}</div>
<div class="sign-row">
  <div>직 명 : ${line('신고자 직명', 'data-profile="rank"')}</div>
  <div>성 명 : ${line('신고자 성명', 'data-profile="name"')}<span data-stamp></span></div>
</div>`;

  // ---------- 국제학술회의 참가 결과보고서 [별지 제4-3호] ----------
  const result = `
<div class="form-no">[별지 제4-3호 서식]</div>
<h1 class="spaced">국제학술회의 참가 결과보고서</h1>
<table class="f-tbl">${cols(pct([83, 356]))}
  <tr class="h35"><td class="label">학 술 회 의 명</td><td>${fill('학술회의명', 'data-trip data-auto="title"')}</td></tr>
  <tr class="h35"><td class="label">참 가 자</td><td>성 명 : ${line('참가자 성명', 'data-profile="name"')}&emsp;소속 : ${line('참가자 소속', 'data-profile="dept"', )}</td></tr>
  <tr><td colspan="2">${fill('참가 결과', '', 'fill result-box')}</td></tr>
</table>
<p class="mt12">우리대학교 국제학술회의 참가경비 지원을 받아 회의에 참석하고 그 결과를 보고합니다.</p>
<div class="note-sm">첨부 : 출입국사실증명서, 항공마일리지신고서, 사진 등 학회 참석 증빙서류 첨부</div>
<div class="date-line">${line('보고 날짜', 'data-auto="today-dot" data-ph="20   .   .   ."')}</div>
<div class="sign-row"><div>참가자 직·성명 : ${line('참가자 직성명', 'data-auto="rank-name"')}<span data-stamp></span></div></div>
<div class="president c">경 북 대 학 교 총 장 귀 하</div>`;

  // ---------- 항공마일리지 신고서 [별첨 제1호] ----------
  const mileage = `
<div class="form-no">〔별첨 제1호 서식〕</div>
<h1 class="spaced">항공마일리지 신고서</h1>
<table class="f-tbl">${cols(pct([86, 161, 45, 84, 38, 58]))}
  <tr class="h35"><td class="label">소 속</td><td>${fill('소속', 'data-profile="dept"')}</td><td class="label small">직 급<br>(직위)</td><td>${fill('직급', 'data-profile="rank"', 'fill center')}</td><td class="label">성 명</td><td>${fill('성명', 'data-profile="name"', 'fill center')}</td></tr>
</table>
<table class="f-tbl join">${cols(pct([86, 96, 87, 206]))}
  <tr class="h33"><td class="label" rowspan="2">공무 여행지</td><td class="label">일 시</td><td colspan="2">${fill('여행 일시', 'data-auto="period-nights" data-ph="20  년  월  일 - 20  년  월  일 (  박  일)"')}</td></tr>
  <tr class="h33"><td class="label">여 행 지</td><td colspan="2">${fill('출장국', 'data-trip')}</td></tr>
  <tr class="h33"><td class="label" rowspan="3">항 공<br>운 임</td><td class="label">적용 등급</td><td colspan="2">${choice('적용 등급', '1등석|비즈니스석|2등석')}</td></tr>
  <tr class="h33"><td class="label">정액운임</td><td colspan="2">${fill('정액운임', 'data-ph="원"')}</td></tr>
  <tr class="h33"><td class="label">청구금액</td><td colspan="2">${fill('청구금액', 'data-ph="원"')}</td></tr>
  <tr class="h33"><td class="label" rowspan="6">마일리지<br>이용정보</td><td class="label">기존 마일리지</td><td colspan="2">${fill('기존 마일리지', 'data-ph="마일 (지난 신고서의 총 마일리지)"')}</td></tr>
  <tr class="h33"><td class="label" rowspan="2">신규 누적<br>마일리지</td><td class="label">이용 항공사</td><td>${fill('이용 항공사')}</td></tr>
  <tr class="h33"><td class="label">누적 마일리지</td><td>${fill('누적 마일리지', 'data-ph="마일"')}</td></tr>
  <tr class="h33"><td class="label" rowspan="2">금번 사용<br>마일리지</td><td class="label">활용방법</td><td>${choice('활용방법', '항공권 구매|좌석 업그레이드')}</td></tr>
  <tr class="h33"><td class="label">사용 마일리지</td><td>${fill('사용 마일리지', 'data-ph="마일"')}</td></tr>
  <tr class="h33"><td class="label">총 마일리지</td><td colspan="2">${fill('총 마일리지', 'data-auto="mileage-total" data-ph="기존 + 누적 − 사용"')}</td></tr>
  <tr><td colspan="4" class="decl">
    <p>위와 같이 항공운임 및 항공마일리지 누적 및 사용내역을 신고합니다.</p>
    <div class="date-line">${line('신고 날짜', 'data-auto="today-ko" data-ph="20   년   월   일"')}</div>
    <div class="sign-row"><div>신 고 인&emsp;성 명 ${line('신고인 성명', 'data-profile="name"')}<span data-stamp></span></div></div>
  </td></tr>
</table>
<div class="note-sm mt6">※ 적용등급은 여비규정상 여비등급구분에 따라 “√” 로 표시<br>
※ 정액운임은 당해공무원의 여비등급에 해당하는 항공운임 정액의 총액을 말함<br>
※ 청구금액은 공적마일리지를 활용한 이후에 필요한 항공운금의 총액을 말함<br>
※ 금번 출장 등에 사용한 마일리지 활용방법은 출장구간 전부 또는 일부의 항공편 좌석을 마일리지로 구매 또는 업그레이드한 경우에 “√” 로 표시하고, 금번 사용 마일리지는 당해 출장 등으로 사용한 마일리지의 총 합계를 말함<br>
※ 총 마일리지는 기존 마일리지와 금번 출장 등으로 누적된 마일리지에서 사용한 마일리지를 공제한 것임</div>`;

  // ---------- 국외출장연수정보시스템 등록확인서 (xlsx) ----------
  const confirm = `
<h1 class="spaced">국외출장연수정보시스템 등록확인서</h1>
<table class="f-tbl mt12">${cols(pct([14, 14, 16, 14, 28, 14]))}
  <tr class="h35"><td class="label">보고서번호</td><td class="label">여행자 이름</td><td class="label">여행기간</td><td class="label">여행국</td><td class="label">보고서제목</td><td class="label">등록일자</td></tr>
  <tr class="h35"><td>${fill('보고서번호1', '', 'fill center')}</td><td>${fill('여행자1', 'data-profile="name"', 'fill center')}</td><td>${fill('여행기간1', 'data-auto="period-md"', 'fill center')}</td>
    <td>${fill('여행국1', 'data-auto="country"', 'fill center')}</td><td>${fill('보고서제목1', 'data-auto="title"', 'fill small')}</td><td>${fill('등록일자1', 'data-ph="월.일"', 'fill center')}</td></tr>
  ${rep(3, i => `<tr class="h35">${['보고서번호', '여행자', '여행기간', '여행국', '보고서제목', '등록일자'].map(c => `<td>${fill(`${c}${i + 1}`, '', 'fill center small')}</td>`).join('')}</tr>`)}
</table>
<p class="note-sm mt12">참고) 인사혁신처 국외출장연수정보시스템(http://btis.mpm.go.kr) 상의 등록사항에 대한 내용 기재바람</p>`;

  // ---------- 외부강의·회의등 신고서 [별지 제4호] ----------
  const lecture = `
<div class="form-no">[별지 제4호]</div>
<table class="f-tbl">${cols(pct([41, 59, 88, 65, 76, 30, 119]))}
  <tr><td colspan="7" class="title-cell">외부강의·회의등 신고서</td></tr>
  <tr class="h35"><td class="label" rowspan="2">신 고 자</td><td class="label">성 명</td><td>${fill('성명', 'data-profile="name"', 'fill center')}</td><td class="label">소 속</td><td colspan="3">${fill('소속', 'data-profile="dept"')}</td></tr>
  <tr class="h35"><td class="label small">직위<br>(직급)</td><td colspan="5">${fill('직위', 'data-profile="rank"')}</td></tr>
  <tr class="h35"><td class="label small">외부 강의·회의 유형</td><td colspan="6">${choice('강의 유형', '교육과정|세미나, 공청회, 토론회, 발표회, 심포지엄|회의|기타')} (${line('강의 유형 기타')})</td></tr>
  <tr class="h35"><td class="label small">활동 유형</td><td colspan="6">${choice('활동 유형', '강의, 강연|발표, 토론|심사, 평가, 자문, 의결|기타')}</td></tr>
  <tr class="h35"><td class="label" rowspan="2">요 청 자</td><td class="label">기관명</td><td colspan="2">${fill('요청 기관명')}</td><td class="label">대표자</td><td colspan="2">${fill('요청 대표자')}</td></tr>
  <tr class="h35"><td class="label">담당부서</td><td colspan="2">${fill('요청 담당부서')}</td><td class="label">연락처</td><td colspan="2">${fill('요청 연락처')}</td></tr>
  <tr class="h35"><td class="label" colspan="2">요청 사유</td><td colspan="5">${fill('요청 사유', 'data-ph="교육과정명, 회의명, 행사명 등"')}</td></tr>
  <tr class="h35"><td class="label" colspan="2">장 소</td><td colspan="5">${fill('장소')}</td></tr>
  <tr><td class="label" colspan="2">일 시</td><td colspan="2">${fill('일시', 'data-ph="20  .  .  . ～ 20  .  .  .   시  분 ~  시  분"', 'fill small')}</td>
    <td class="label small">일괄 신고 ${choice('일괄 신고', '해당')}</td><td colspan="2" class="small">월(연)평균 횟수 : ${line('평균 횟수')} 회<br>1회 평균 시간 : ${line('평균 시간')} 시간</td></tr>
  <tr class="h35"><td class="label" colspan="2">대 가</td><td colspan="5">총액 ${line('대가 총액')} 만원 (※ 1회 평균 대가 ${line('1회 평균 대가')} 만원)</td></tr>
  <tr><td colspan="7" class="decl">
    <div class="date-line">${line('신고 날짜', 'data-auto="today-dot" data-ph="20   .   .   ."')}</div>
    <div class="sign-row"><div>신고자 ${line('신고자 성명', 'data-profile="name"')} <span data-sign></span></div></div>
  </td></tr>
  <tr><td colspan="7" class="note-sm">비고 : 1. 요청사유에는 교육과정명, 회의명, 행사명 등을 기재함.<br>
    2. 대가는 실 수령액을 기재하되, 교통비, 원고료, 재료비 등을 구분할 수 있을 경우 (&emsp;) 속에 기재할 수 있음.<br>
    3. 동일한 교육과정에 수회 출강하는 경우에는 일괄신고할 수 있음. 이 경우 일괄신고란에 기재하고, 1회 평균 대가를 기재함.</td></tr>
</table>`;

  const P = SRC;
  window.FORMS.list.push(
    { id: 'trip-plan', group: 'trip', trip: true, emoji: '✈️', title: '국외출장계획서 & 서약서', src: P + '국외출장계획서 & 서약서 서식.hwpx',
      file: '{출장자1 성명}_국외출장계획서_{학술회의명}', pages: [...plan.split('<!--page-->'), oath] }, // 계획서 2쪽 + 서약서
    { id: 'trip-check', group: 'trip', trip: true, emoji: '🔍', title: '부실학회 점검 체크리스트', src: SRC + '공무국외출장 신청서류(서식).hwpx', file: '{확인자 성명}_부실학회_점검_체크리스트', pages: [checklist] },
    { id: 'trip-return', group: 'trip', trip: true, emoji: '🛬', title: '귀국신고서', src: P + '1. 귀국신고서.hwp', file: '{성명}_귀국신고서', pages: [ret] },
    { id: 'trip-confirm', group: 'trip', trip: true, emoji: '🗂️', title: '국외출장연수정보시스템 등록확인서', src: P + '3.국외출장연수정보시스템 등록확인서.xlsx', file: '{여행자1}_국외출장연수정보시스템_등록확인서', pages: [confirm] },
    { id: 'trip-mileage', group: 'trip', trip: true, emoji: '🎫', title: '항공마일리지 신고서', src: P + '4.항공마일리지 신고서.hwp', file: '{성명}_항공마일리지_신고서',
      carry: { '기존 마일리지': '총 마일리지' }, pages: [mileage] }, // 새로 만들 때 지난 신고서의 총 마일리지를 기존 마일리지로
    { id: 'trip-result', group: 'trip', trip: true, emoji: '📑', title: '국제학술회의 참가 결과보고서', src: SRC + '공무국외출장 신청서류(서식).hwpx', file: '{참가자 성명}_국제학술회의_참가_결과보고서',
      defaults: { '참가 결과': '1. 동 회의에 참가 수행한 사람\n\n2. 동 회의 분야의 학술적 의의 및 연구동향\n\n3. 기타 참고사항\n' }, pages: [result] },
    { id: 'lecture', group: 'trip', trip: 'optional', emoji: '🎤', title: '외부강의·회의 신고서', src: SRC + '외부강의신고서양식.hwp', file: '{성명}_외부강의_신고서_{요청 기관명}', pages: [lecture] },
    { id: 'trip-cost', group: 'trip', emoji: '🧾', title: '여비산출명세서', src: SRC + '여비산출명세서.hwp',
      note: '여비산출명세서는 IAMS에서 자동으로 출력돼요. (학교에서 받은 여비산출명세서.hwp 파일 안에는 외부강의 신고서가 들어 있어요.)' },
  );

  // 출장 체크리스트 — 정보 탭 '출장 여비'·'국외출장' 노트 기준. form 이 있으면 서류를 바로 만들거나 엶
  window.FORMS.tripSteps = [
    { title: '출장 가기 전', abroad: true, items: [
      { text: '국외출장계획서 & 서약서', form: 'trip-plan' },
      { text: '부실학회 점검 체크리스트', sub: '국가R&D 지원으로 해외학회 갈 때', form: 'trip-check' },
      { text: '경비확인지원서 → 산단 제출' },
      { text: '학회 등록 영수증, 관련 메일(초청메일)' },
      { text: '항공권 이티켓' },
      { text: '학과 회의록', sub: '국가R&D 지원으로 해외학회 갈 때' },
    ] },
    { title: '다녀와서', abroad: true, items: [
      { text: '국외출장연수정보시스템에 보고서 등록' },
      { text: '귀국신고서', form: 'trip-return' },
      { text: '국외출장연수정보시스템 등록확인서', sub: '보고서 번호 캡처', form: 'trip-confirm' },
      { text: '출입국사실증명서' },
      { text: '항공마일리지 신고서', form: 'trip-mileage' },
      { text: '국제학술회의 참가 결과보고서', sub: '학교 참가경비 지원을 받았을 때', form: 'trip-result' },
    ] },
    { title: '여비 정산', items: [
      { text: '영수증 (운임·숙박)' },
      { text: '출장 공문', sub: '여비지급: 예 / 회계구분·지급기관: 산단회계 또는 연구비' },
      { text: '지급요구서' },
      { text: '여비산출명세서', sub: 'IAMS에서 자동 출력' },
      { text: '출장명령서' },
      { text: '출장 증빙', sub: '운임·숙박 증빙, 학회참가증' },
      { text: '외부강의·회의 신고서', sub: '연사료 받을 때', form: 'lecture' },
    ] },
  ];

  // 예시 출장 1건과 그 서류 (가짜 내용)
  window.FORMS.trips = [
    { id: 't-ex', title: '예시 국제학회 (베를린)', kind: '국외', from: '2026-06-01', to: '2026-06-05', fund: 'g1', checks: {}, fields: {
      '출장국': '독일(베를린)', '방문기관': '○○ 국제학술대회 조직위', '학술회의명': '○○ 국제학술대회 2026 (예시)',
      '출장 목적': '○○ 국제학술대회 참석 및 연구 결과 포스터 발표',
      '출장 동기': '연구 분야의 최신 동향을 파악하고 연구 결과를 발표하기 위함',
      '건전학회 여부': 'O',
      '출장 효과': '최신 연구 동향을 파악하고, 발표·토의로 연구 결과를 알리며 공동연구 가능성을 찾음.',
      '외교부 협조': '해당사항 없음',
    } },
  ];
  window.FORMS.tripDocs = [
    { id: 'd-plan-ex', tpl: 'trip-plan', trip: 't-ex', year: 2026, title: '예시 국제학회 (베를린) — 국외출장계획서 & 서약서', fields: {
      '출장국 표기': '독일(베를린)', '가족 동반': '무',
      '일정1 날짜': '2026.6.1(월)', '일정1 출발지': '대구→인천공항', '일정1 도착지': '독일 베를린', '일정1 방문기관': '-', '일정1 업무': '이동, 학회 등록', '일정1 접촉인물': '-',
      '일정2 날짜': '2026.6.2(화)–6.4(목)', '일정2 출발지': '베를린', '일정2 도착지': '베를린', '일정2 방문기관': '학회장', '일정2 업무': '학회 참석·포스터 발표', '일정2 접촉인물': '학회 참가 연구자',
      '일정3 날짜': '2026.6.5(금)', '일정3 출발지': '베를린', '일정3 도착지': '대구', '일정3 방문기관': '-', '일정3 업무': '귀국', '일정3 접촉인물': '-',
    } },
  ];
})();