// 구매 양식 — 원본: 산학협력단 중앙구매 물품구매서식.hwp(.docx) 의 【서식 1-1】·【서식 1-2】 표 구조를 그대로 옮김
// 칸 표시는 forms.js와 같고, 추가로
//   repeat: '품목'       : 품목마다 한 쪽씩 늘어남 (칸 이름은 `품목2:품명 한글`처럼 번호가 붙어 저장)
//   data-all             : repeat 양식에서 모든 품목 쪽에 같이 들어가는 칸 (연구소·교수명·전화)
//   <tr data-rows="이름" data-min="4"> : 표 줄을 늘리고 뺄 수 있음 (칸 이름은 `세부규격3:품명`), data-n 칸엔 줄 번호
//   class="choice" data-paren : '가능(○), 불가능( )'처럼 괄호 안에 ○
(() => {
  const SRC = '산학협력단 '; // 원본 파일 이름만 적어 둠 (src)
  const fill = (key, attrs = '', cls = 'fill center') => `<div class="${cls}" data-f="${key}" ${attrs}></div>`;
  const cols = ws => `<colgroup>${ws.map(w => `<col style="width:${w}%">`).join('')}</colgroup>`;
  const pct = ws => { const t = ws.reduce((a, b) => a + b, 0); return ws.map(w => +(w / t * 100).toFixed(2)); };
  const able = `<span class="choice" data-f="납품 가능" data-options="가능|불가능" data-paren></span>`;
  // 사용 연구소·교수명(도장)·전화·비고 — 두 규격서 공통 아래 두 줄 (td 묶음은 서식마다 다름)
  const userRows = ([a, b, c, d, e, f, g]) => `
  <tr style="height:8.1mm"><td class="label small" colspan="${a}" rowspan="2">사 용<br>연구소</td><td colspan="${b}" rowspan="2">${fill('사용 연구소', 'data-all data-profile="room" data-ph="○○대학 ○○호관 ○○○호"')}</td>
    <td class="label small" colspan="${c}" rowspan="2">사 용<br>교수명</td><td class="label" colspan="${d}">성 명</td>
    <td colspan="${e}" class="center"><span class="inline-fill" data-f="사용 교수명" data-all data-profile="name"></span><span data-stamp></span></td>
    <td class="label" colspan="${f}" rowspan="2">비 고</td><td colspan="${g}" rowspan="2">${fill('비고')}</td></tr>
  <tr style="height:8.1mm"><td class="label" colspan="${d}">전 화</td><td colspan="${e}">${fill('전화', 'data-all data-profile="office"')}</td></tr>`;
  const secs = list => list.map(([title, key, ph]) => `<div class="sec">${title}</div>${fill(key, `data-ph="${ph}"`, 'fill')}`).join('');

  // ---------- 【서식 1-1】 비품 규격서 — 품목 하나 = 한 쪽 ----------
  // 원본 표 칸 경계(mm)를 13칸으로: 11.9 4.9 4 14.8 17.8 13.8 4 15 3 39.1 22 15.3 13.5
  const spec = `
<div class="form-no">【서식 1-1】</div>
<h1 class="spaced">비 품 규 격 서</h1>
<table class="f-tbl tight">${cols(pct([11.9, 4.9, 4, 14.8, 17.8, 13.8, 4, 15, 3, 39.1, 22, 15.3, 13.5]))}
  <tr style="height:9.1mm"><td class="label small" colspan="2">정부물품<br>분류번호</td><td colspan="2">${fill('분류번호')}</td>
    <td class="label small">정부물품<br>식별번호</td><td colspan="2">${fill('식별번호')}</td>
    <td class="label" colspan="3">카타로그상 모델명</td><td class="label" colspan="2">생산국/제조회사</td><td class="label small">수량/<br>단위</td></tr>
  <tr style="height:9.1mm"><td class="label" rowspan="4">품 명</td><td class="label" colspan="2" rowspan="2">한글</td><td colspan="4" rowspan="2">${fill('품명 한글')}</td>
    <td class="label small" colspan="2">구매희망<br>모 델</td><td>${fill('구매희망 모델')}</td>
    <td colspan="2" rowspan="3">${fill('생산국/제조회사', 'data-ph="대한민국/○○"')}</td><td rowspan="4">${fill('수량/단위', 'data-ph="1/EA"')}</td></tr>
  <tr><td class="label small" colspan="2" rowspan="2">대비모델</td><td rowspan="2">${fill('대비모델')}</td></tr>
  <tr><td class="label" colspan="2" rowspan="2">영문</td><td colspan="4" rowspan="2">${fill('품명 영문')}</td></tr>
  <tr style="height:9.1mm"><td class="small" colspan="3">구매(희망)모델과 동등 이상이면<br>납품 가능여부 (해당란에 “○”)</td><td class="center" colspan="2">${able}</td></tr>
  ${userRows([2, 3, 1, 2, 2, 1, 2])}
</table>
${secs([
    ['1. Feature(일반적인 사항, 특징, 특색 등 기술)', 'Feature', '1) 연구실 ○○ 환경 구축을 위한 ○○'],
    ['2. Specification(세부규격)', 'Specification', '1) 색상 : \n2) 규격(W×D×H, mm) : \n3) 수량 : '],
    ['3. Standard Accessories(표준부속품)', 'Standard Accessories', '1) '],
    ['4. Optional Acc or Recommended S/P(선택부속 또는 추천부속품)', 'Optional Acc', '1) '],
    ['5. Remarks', 'Remarks', '1) (예) 설치 후 보증기간 1년'],
  ])}`;

  // ---------- 【서식 1-2】 소모품 규격서 — 세부규격 표는 줄을 늘려 씀 ----------
  const supply = `
<div class="form-no">【서식 1-2】</div>
<h1 class="spaced">소 모 품 규 격 서</h1>
<table class="f-tbl tight">${cols(pct([11.9, 8.9, 24.4, 16.5, 5.3, 11, 7, 39.1, 20, 17.3, 15.5]))}
  <tr style="height:9.1mm"><td class="label" rowspan="4">품 명</td><td class="label small" rowspan="2">한글</td><td colspan="3" rowspan="2">${fill('품명 한글', 'data-ph="○○ 외 ○종"')}</td>
    <td class="label" colspan="3">카타로그상 모델명</td><td class="label" colspan="2">생산국/제조회사</td><td class="label small">수량/<br>단위</td></tr>
  <tr style="height:9.1mm"><td class="label small" colspan="2">구매희망<br>모 델</td><td>${fill('구매희망 모델')}</td><td colspan="2">${fill('구매희망 생산국')}</td>
    <td rowspan="3">${fill('수량/단위', '', 'fill center small')}</td></tr>
  <tr style="height:9.1mm"><td class="label small" rowspan="2">영문</td><td colspan="3" rowspan="2">${fill('품명 영문', 'data-ph="○○ and ○ items"')}</td>
    <td class="label small" colspan="2">대비모델</td><td>${fill('대비모델')}</td><td colspan="2">${fill('대비 생산국')}</td></tr>
  <tr style="height:9.1mm"><td class="small" colspan="3">구매(희망)모델과 동등 이상이면<br>납품 가능여부 (해당란에 “○”)</td><td class="center" colspan="2">${able}</td></tr>
  ${userRows([1, 2, 1, 2, 2, 1, 2])}
</table>
${secs([['1. Feature(사용 용도, 일반적인 사항, 특징, 특색 등 기술)', 'Feature', '1) 연구과제에서의 사용 용도를 작성\n2) 부품들의 성능 등을 작성']])}
<div class="sec">2. Specification(세부규격)</div>
<table class="f-tbl tight">${cols(pct([10.5, 46.2, 65.1, 15.4, 37.4]))}
  <tr style="height:10mm"><td class="label small">품목<br>번호</td><td class="label">품명</td><td class="label">규격(모델명)</td><td class="label small">수량<br>/단위</td><td class="label">비고</td></tr>
  <tr style="height:9mm" data-rows="세부규격" data-min="4"><td class="center" data-n></td><td>${fill('품명')}</td><td>${fill('규격')}</td><td>${fill('수량')}</td><td>${fill('비고', '', 'fill center small')}</td></tr>
</table>
${secs([['3. Remarks', 'Remarks', '1) (예) 납품 후 검수과정에 하자가 있을 시 1주일 이내 무상 교환\n2) (예) 정품을 납품하여야 함']])}`;

  const hint = '노란 칸을 눌러 써요 · 연구소·교수명·전화는 내 정보에서 채워져요';
  window.FORMS.list.push(
    { id: 'buy-spec', group: 'buy', emoji: '🪑', title: '비품 규격서', src: SRC + '물품구매서식.hwp', repeat: '품목',
      file: '{사용 교수명}_비품규격서_{품명 한글}', defaults: { '납품 가능': '가능', '비고': '-' }, pages: [spec],
      // 재고 탭 주문에서 만들 때 채울 칸 (o = 주문 + 품목의 제조사·Cat. No.)
      fromOrder: o => ({ '#품목': 1, '품목1:품명 한글': o.name, '품목1:구매희망 모델': o.catNo, '품목1:생산국/제조회사': o.maker, '품목1:수량/단위': o.qty }),
      hint: hint + ' (모든 품목 쪽에 같이)' },
    { id: 'buy-supply', group: 'buy', emoji: '📦', title: '소모품 규격서', src: SRC + '물품구매서식.hwp',
      file: '{사용 교수명}_소모품규격서_{품명 한글}', pages: [supply], hint,
      fromOrder: o => ({ '품명 한글': o.name, '세부규격1:품명': o.name, '세부규격1:규격': [o.maker, o.catNo].filter(Boolean).join(' '), '세부규격1:수량': o.qty }),
      defaults: { '구매희망 모델': '세부규격 참조', '구매희망 생산국': '세부규격 참조', '수량/단위': '세부규격 참조', '대비모델': '-', '대비 생산국': '-', '납품 가능': '가능', '비고': '-' } },
    { id: 'buy-etc', group: 'buy', emoji: '🗂️', title: '그 밖의 구매 서식', src: SRC + '물품구매서식.hwp',
      note: '물품구매서식 모음의 나머지 서식은 자주 쓰지 않아서 원본 파일을 열어 써요: 1-3 구매규격서, 2 제조시방서, 3 원가계산서, 4 과업지시서, 5 긴급구매사유서, 6·8 기부채납 의뢰서, 9 외자 구매규격서, 10 규격적합조사표, 11 구매요청금액 산출 내역.' },
  );

  // 예시 문서: 연구실 가구 8품목 비품 규격서
  const items = [
    ['책상 (L형)', 'L-type Desk', 'PD116L/R (R형 2개)', 2, 'NL', '1600×1200×720'],
    ['이동형 파일서랍', 'Mobile File Cabinet', 'DP130', 4, 'NL', '403×580×605'],
    ['작업용 의자', 'Task Chair', 'ND5-410R', 4, 'MESH-351', '610×580×1160'],
    ['파티션', 'Partition', 'MF2B-116012', 4, 'GREEN', '1200×45×1160'],
    ['파티션', 'Partition', 'MF2B-11608', 4, 'GREEN', '800×45×1160'],
    ['파티션 커넥터', 'Partition Connector', 'MF2P-1160', 2, 'GREEN', '45×45×1160'],
    ['파티션 마감바', 'Partition End Bar', 'MF2EC-1160', 5, 'GREEN', '45×10×1160'],
    ['작업용 의자', 'Task Chair', 'NCVW-401', 1, 'FABRIC-1110', '551×531×796'],
  ];
  const fields = { '#품목': items.length };
  items.forEach(([ko, en, model, n, color, size], i) => Object.assign(fields, {
    [`품목${i + 1}:품명 한글`]: ko, [`품목${i + 1}:품명 영문`]: en, [`품목${i + 1}:구매희망 모델`]: model, [`품목${i + 1}:수량/단위`]: `${n}/EA`,
    [`품목${i + 1}:Feature`]: '1) 연구실 학생연구원 연구환경 구축을 위한 사무용 가구',
    [`품목${i + 1}:Specification`]: `1) 색상 : ${color}\n2) 규격(W×D×H, mm) : ${size}\n3) 수량 : ${n} EA`,
  }));
  window.FORMS.buyDocs = [{ id: 'd-spec-2606', tpl: 'buy-spec', year: 2026, title: '연구실 가구 8품목 (예시)', updatedAt: '2026-06-25T07:19:00.000Z', fields }];
})();
