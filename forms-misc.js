// 회의록·영문 레터 — 원본: 연구소 회의록 양식(hwp, 20행×5열 표), 경북대 레터헤드 레터(docx)
// 칸 표시는 forms.js·forms-buy.js와 같고, 추가로
//   data-span="참석자" data-span-plus="1" : 늘어나는 줄(data-rows="참석자")을 따라 rowspan을 맞춤
//   data-auto="count:참석자:성명"         : 성명이 적힌 참석자 줄 수
//   paper: 'letter'                       : 종이에 레터헤드 배경 (letterhead-knu.jpg), 여백은 원본 docx대로
// 레터의 이름·직함·주소는 내 정보의 영문 칸(enName·enSig·enTitle·enAddr)에서 채움
(() => {
  const fill = (key, attrs = '', cls = 'fill') => `<div class="${cls}" data-f="${key}" ${attrs}></div>`;
  const span = (key, attrs = '') => `<span class="inline-fill" data-f="${key}" ${attrs}></span>`;
  const cols = ws => `<colgroup>${ws.map(w => `<col style="width:${w}%">`).join('')}</colgroup>`;
  const pct = ws => { const t = ws.reduce((a, b) => a + b, 0); return ws.map(w => +(w / t * 100).toFixed(2)); };

  // ---------- 회의록 (연구소) — 원본 표 20행×5열 ----------
  const minutes = `
<table class="f-tbl">${cols(pct([61, 83, 86, 116, 159]))}
  <tr><td colspan="5" class="title-cell">회 의 록</td></tr>
  <tr style="height:7.5mm"><td class="label">회의일시</td><td colspan="4">${span('회의 날짜', 'data-ph="2026.05.15. (금)"')}&ensp;${span('회의 시간', 'data-ph="10:00-12:00"')}</td></tr>
  <tr style="height:7.5mm"><td class="label">회의목적</td><td colspan="4">${fill('회의목적')}</td></tr>
  <tr style="height:7.5mm"><td class="label">회의장소</td><td colspan="4">${fill('회의장소', 'data-ph="연구실·실험실 호실 등 실제 연구활동 장소"')}</td></tr>
  <tr style="height:7.5mm"><td class="label">회의비</td><td colspan="4">${span('회의비', 'data-ph="0"')} 원</td></tr>
  <tr class="h33"><td class="label" rowspan="11" data-span="참석자" data-span-plus="1">참석자<br>( ${span('참석 인원', 'data-auto="count:참석자:성명"')} 명)</td>
    <td class="label">소속</td><td class="label">직급</td><td class="label">성명</td><td class="label small">연구참여역할<br>(연구책임자, 연구보조원 등)</td></tr>
  <tr style="height:8.1mm" data-rows="참석자" data-min="10">${['소속', '직급', '성명', '역할'].map(k => `<td>${fill(k, '', 'fill center')}</td>`).join('')}</tr>
  <tr><td class="label">회의내용</td><td colspan="4" style="height:81mm">${fill('회의내용', 'data-ph="1. ○○\n- 구체적으로 5줄 이상 상세히"')}</td></tr>
  <tr><td colspan="5" class="note-sm">• 회의비 : 회의 후 식대<br>• 회의장소는 연구실 및 실험실 호실 등 실제 연구활동 장소를 기재<br>• 회의내용은 구체적으로 5줄 이상 상세히 작성<br>
    • 반드시 법인카드 사용. 개인카드 사용 불가<br>• 심야시간(23:00 이후), 유흥음식점, 간이영수증 사용 불가<br>• 주말(토·일요일), 공휴일은 주말연구활동계획서를 작성 후 사용 가능</td></tr>
  <tr class="h35"><td colspan="5" class="right-cell">기관장 : ${span('기관장', 'data-ph="○○연구소장 ○○○"')} (인)</td></tr>
</table>`;

  // ---------- 영문 레터 (경북대 레터헤드) — 원본 docx의 칸 높이(mm)대로 ----------
  const letter = `
<div class="lt-body">
  ${fill('제목', 'data-ph="Letter title (e.g. Letter of Support)"', 'fill center')}
  ${fill('받는 사람', '', 'fill lt-gap')}
  ${fill('본문', 'data-ph="Paragraphs — leave a blank line between them"', 'fill lt-gap')}
  ${fill('맺음말', '', 'fill lt-gap')}
  ${fill('보내는 사람', 'data-profile="enName" data-ph="Your name (내 정보 → 영문 이름)"')}
  <div class="lt-gap">email: ${span('email', 'data-profile="email"')}</div>
  <div class="lt-signrow">signature: <span class="lt-sign" data-sign></span></div>
  <div>______________</div>
  <div>date: ${span('date', 'data-auto="today-us"')}</div>
</div>
<div class="lt-sig">${fill('이름 줄', 'data-profile="enSig" data-ph="Name, Ph.D."', 'fill lt-name')}${fill('직함', 'data-profile="enTitle" data-ph="Title / Department / School"')}</div>
<div class="lt-foot">${fill('주소', 'data-profile="enAddr" data-ph="Address (내 정보 → 영문 주소)"')}<b>TEL. ${span('TEL', 'data-ph="82-10-0000-0000"')} E-mail. ${span('E-mail', 'data-profile="email"')}</b></div>`;

  window.FORMS.list.push(
    { id: 'minutes', group: 'meeting', emoji: '🗒️', title: '회의록', src: '연구소 회의록 양식 (hwp)',
      file: '회의록_{회의 날짜}', pages: [minutes],
      hint: '노란 칸을 눌러 써요 · 참석자 수는 성명 칸을 세어 채워져요 · 지난 회의록 내용을 가져오려면 ‘+ 새로 만들기’에서 골라요' },
    { id: 'letter', group: 'etc', emoji: '✉️', title: '영문 레터', src: '경북대 레터헤드 레터 (docx)', paper: 'letter',
      file: 'letter_{제목}', carry: { 'TEL': 'TEL' }, pages: [letter],
      hint: '노란 칸을 눌러 써요 · 이름·직함·주소는 내 정보의 영문 칸 · 서명은 내 정보의 서명 이미지 · TEL은 한 번 쓰면 다음 레터에 이어져요',
      defaults: { '받는 사람': 'To Whom It May Concern,', '맺음말': 'Sincerely,' } },
  );

  // 예시 문서 (가짜 내용)
  const people = [['경북대', '조교수', '홍길동', '연구책임자'], ['경북대', '대학원생', '박박사', '연구보조원'], ['경북대', '대학원생', '김석사', '연구보조원'], ['경북대', '학부생', '이학사', '연구보조원']];
  const minutesFields = {
    '회의 날짜': '2026.05.15. (금)', '회의 시간': '10:00-12:00', '회의목적': '연구 진행 상황 점검과 다음 달 실험 계획 논의 (예시)',
    '회의장소': '의과대학 ○호관 ○○○호 세미나실', '회의비': '120,000',
    '회의내용': [
      '1. 연구 진행 상황',
      '- 단일세포 RNA 데이터 1차 분석 결과 공유: 세포 유형 12개 구분, 질환군에서 특이적으로 늘어난 세포군 확인',
      '- 공개 데이터와 통합 분석 시 배치 효과 보정 방법 비교 (예시)',
      '- 라이브러리 제작 수율이 낮았던 샘플 2개는 재추출 예정',
      '2. 다음 달 계획 및 공지',
      '- 추가 시료 8개 라이브러리 제작 및 시퀀싱 의뢰',
      '- 학회 초록 마감 일정 확인, 발표 자료 초안 작성',
    ].join('\n'),
    '기관장': '○○연구소장 ○○○',
  };
  people.forEach((p, i) => ['소속', '직급', '성명', '역할'].forEach((k, j) => { minutesFields[`참석자${i + 1}:${k}`] = p[j]; }));
  window.FORMS.miscDocs = [
    { id: 'd-minutes-ex', tpl: 'minutes', year: 2026, title: '회의록 2026.05.15 (예시)', updatedAt: '2026-05-15T03:00:00.000Z', fields: minutesFields },
    { id: 'd-letter-ex', tpl: 'letter', year: 2026, title: 'Letter of Support (예시)', updatedAt: '2026-03-10T04:00:00.000Z', fields: {
      '제목': 'Letter of Support',
      '본문': [
        'I am pleased to support the research proposal entitled “Single-cell multi-omic profiling of ○○ disease” submitted by Dr. Smith.',
        'Our laboratory will provide expertise in bioinformatics and computational analysis, and will contribute to project discussions and data interpretation.',
        'Please feel free to contact me if additional information is required.',
      ].join('\n\n'),
      'date': '03/10/2026',
    } },
  ];
})();
