// 처음 쓰는 분을 위한 예시 데이터 — 과제·학생·금액은 모두 가짜예요. 그대로 고쳐 쓰거나 지우고 시작해요.
// 금액 단위: 천원 (인건비 화면만 만원으로 보임). 연차는 과제 시작월부터 12개월씩 (app.js periods)
// 내 데이터는 설정 → 가져오기(JSON)로 바꿔 넣을 수 있어요.
window.SEED = {
  rates: { 학사: 1300, 석사: 2200, 박사: 3000 }, // 기준 인건비 (월, 천원) — 참여율 = 월 인건비 ÷ 그 학기 과정의 기준

  // kind: 과제 / BK21 / 기타, role: 책임 / 참여 (과제만)
  // periods: { 연차 번호: { budget: 직접비 배정, pay: 학생인건비 계상액, goal, content } } — 아는 것만
  grants: [
    { id: 'g1', name: '예시 신진연구', emoji: '🧠', color: '#5B9BEA', kind: '과제', role: '책임',
      full: '우수신진연구 (예시)', no: 'RS-2026-00000000',
      title: '단일세포 멀티오믹스로 보는 ○○ 질환의 유전자 조절 기전 (예시 과제)',
      start: '2026-03', end: '2029-02', annual: 100000,
      finalGoal: '○○ 질환 환자 조직의 단일세포 멀티오믹스 지도를 만들고, 질환 특이 조절 네트워크와 치료 표적 후보를 찾는다.',
      periods: {
        1: { budget: 100000, pay: 36000, goal: '시료 확보·데이터 생산 파이프라인 구축', content: '- 환자·대조군 시료 확보\n- 단일세포 RNA/ATAC 데이터 생산' },
        2: { budget: 100000, goal: '통합 분석', content: '- 세포 유형별 조절 네트워크 추정' },
        3: { budget: 100000, goal: '검증·논문', content: '- 후보 유전자 기능 검증' },
      } },
    { id: 'g2', name: '예시 참여과제', emoji: '🌿', color: '#2BB39A', kind: '과제', role: '참여',
      full: '중점연구소 지원사업 (예시)', no: 'RS-2026-00000001', title: '○○연구소 공동연구 (예시)',
      start: '2026-09', end: '2029-08', annual: 30000,
      periods: { 1: { budget: 30000, pay: 10800 } } },
    { id: 'bk', name: 'BK21', emoji: '🧑‍🎓', color: '#9D7BE0', kind: 'BK21',
      full: 'BK21 four', start: '2026-03', end: '2027-08', firstNo: 4,
      periods: { 4: { pay: 15600 }, 5: { pay: 15600 } } },
  ],

  // 과정은 학기마다 ('2026-2' = 26년 2학기, 9–2월). 적지 않은 학기는 앞 학기 값을 이어받음
  people: [
    { id: 'p1', name: '김석사', degrees: { '2026-1': '석사' } },
    { id: 'p2', name: '이학사', degrees: { '2026-1': '학사', '2027-1': '석사' } },
    { id: 'p3', name: '박박사', degrees: { '2026-1': '박사' } },
  ],

  // [사람, 재원, 시작월, 끝월, 월액(천원)] → app.js가 달마다 한 칸씩으로 펼침
  payRanges: [
    ['p1', 'g1', '2026-03', '2028-02', 1100],
    ['p1', 'bk', '2026-03', '2027-02', 700],
    ['p2', 'g1', '2026-09', '2027-02', 650],
    ['p2', 'g1', '2027-03', '2028-02', 1100],
    ['p2', 'bk', '2027-03', '2027-08', 700],
    ['p3', 'g1', '2026-03', '2028-02', 1500],
    ['p3', 'g2', '2026-09', '2028-02', 900],
  ],

  // 연차별 세목 예산 (천원). spent = 직접 적은 집행 (재고 탭 주문은 자동으로 더해짐)
  lines: [
    { grant: 'g1', n: 1, name: '시약', cat: '연구재료비', subs: ['시약·소모품'], plan: 8000, spent: 1200 },
    { grant: 'g1', n: 1, name: '해외학회', cat: '연구활동비', subs: ['학회등록비', '국외여비'], plan: 6000, memo: '예: ASHG (PI, 박박사)' },
    { grant: 'g1', n: 1, name: '국내학회', cat: '연구활동비', subs: ['학회등록비', '국내여비'], plan: 1500 },
    { grant: 'g1', n: 1, name: '논문 게재료', cat: '연구활동비', subs: ['논문게재료'], plan: 3000 },
    { grant: 'g1', n: 1, name: '회의비', cat: '연구활동비', subs: ['회의비'], plan: 1000 },
    { grant: 'g1', n: 2, name: '시약', cat: '연구재료비', subs: ['시약·소모품'], plan: 10000 },
    { grant: 'g1', n: 2, name: '분석 서버', cat: '연구시설·장비비', subs: ['컴퓨터·서버'], plan: 15000 },
    { grant: 'g1', n: 2, name: '해외학회', cat: '연구활동비', subs: ['학회등록비', '국외여비'], plan: 6000 },
    { grant: 'g2', n: 1, name: '시약', cat: '연구재료비', subs: ['시약·소모품'], plan: 3000 },
    { grant: 'g2', n: 1, name: '국내학회', cat: '연구활동비', subs: ['학회등록비', '국내여비'], plan: 1000 },
    { grant: 'bk', n: 4, name: '해외학회', cat: '연구활동비', subs: ['학회등록비', '국외여비'], plan: 2000 },
    { grant: 'bk', n: 4, name: '국내학회', cat: '연구활동비', subs: ['학회등록비', '국내여비'], plan: 500 },
  ],

  // 정보 탭: 묶음 → 노트. 경북대 산학협력단 행정 절차를 절차별로 정리한 것 (담당자 이름은 뺐어요)
  // doc = 글(## 소제목, - [ ] 체크, - 목록, 1. 순서, > 메모), table = 칸·줄 (secret 칸은 가려서 보임)
  info: {
    cats: [
      { id: 'spend', name: '연구비 집행', color: '#5B9BEA', open: true },
      { id: 'staff', name: '인력', color: '#9D7BE0', open: true },
      { id: 'contact', name: '연락처·링크', color: '#2BB39A', open: true },
      { id: 'etc', name: '기타', color: '#8B93A1', open: true },
    ],
    notes: [
      { id: 'trip', cat: 'spend', type: 'doc', emoji: '🚄', title: '출장 여비', text: [
        '**준비 서류** (누락 시 반려)',
        '- [ ] 영수증 (운임·숙박)',
        '- [ ] 출장 공문 — 여비지급: 예 / 회계구분·지급기관: **산단회계 또는 연구비** 중 선택',
        '- [ ] 지급요구서',
        '- [ ] 여비산출명세서 (IAMS에서 자동 출력)',
        '- [ ] 출장명령서',
        '- [ ] 출장 증빙서류 — 운임·숙박 증빙, **학회참가증**',
        '- [ ] (연사료 받는 경우) 외부강의·회의등 신고서 → 「외부강의·회의 신고」 노트',
        '',
        '> 참고: 연구비집행매뉴얼 · 담당: 산학협력단 연구비 집행 담당자',
      ].join('\n') },
      { id: 'abroad', cat: 'spend', type: 'doc', emoji: '✈️', title: '국외출장', text: [
        '## 1. 출장 신청 → 학과 행정실',
        '- [ ] 계획서 및 서약서',
        '- [ ] 경비확인지원서 → 산단에 제출',
        '- [ ] 학회 등록 영수증, 관련 메일 (초청메일)',
        '- [ ] 항공권 이티켓',
        '- [ ] 부실학회 체크리스트',
        '',
        '## 2. 출장 후',
        '- 국외출장연수시스템에 보고서 등록',
        '- 학과 행정실에',
        '  - [ ] 귀국신고서',
        '  - [ ] 국외출장연수정보시스템 캡처 (보고서 번호)',
        '  - [ ] 출입국사실증명서',
        '  - [ ] 항공마일리지신고서',
        '',
        '> 서류 탭 → 🧳 출장 관리에서 출장 하나에 이 서류들을 한 번에 만들 수 있어요.',
      ].join('\n') },
      { id: 'lecture', cat: 'spend', type: 'doc', emoji: '🎤', title: '외부강의·회의 신고', text: [
        '연사료 받을 때. 양식에 채울 항목:',
        '- 성명 / 소속 / 직위(직급)',
        '- 외부강의·회의 유형 / 활동 유형',
        '- 요청 기관명',
        '- 활동 내용 (주제 구체 기재)',
        '- 일시 (시작~종료)',
        '- 월(연) 평균 횟수 / 회 평균 시간',
        '- 총액 / 회 평균 대가',
        '- 신고자 서명',
      ].join('\n') },
      { id: 'central', cat: 'spend', type: 'doc', emoji: '🛒', title: '중앙구매', text: [
        '## 대상 기준',
        '- 장비/비품 (영구 라이센스 포함): **100만원 초과**',
        '- 소모품·시약·비영구 라이센스(예: 1년 단위 계약): **500만원 초과** (~2,200만원 이하)',
        '',
        '## 준비 서류',
        '- [ ] 규격서 (소모품·재료 / 장비·비품) + 날인 → 서류 탭 비품·소모품 규격서',
        '- [ ] 구매요구서 + 날인',
        '- [ ] 견적서 (업체 담당자 연락처·이메일 기재)',
        '- 조달 물품(주로 가구)은 규격서 필요 없음',
        '',
        '> 업체 연락처는 재고 탭 🏢 업체 · 담당: 구매관리팀(중앙구매)',
      ].join('\n') },
      { id: 'meeting', cat: 'spend', type: 'doc', emoji: '☕', title: '회의비', text: [
        '- [ ] **외부 인원 필수** (외부 참석자 없으면 처리 불가)',
        '- [ ] 간접비로 회의비는 내부도 가능. 과제 참여자만 아니면 됨',
      ].join('\n') },
      { id: 'poster', cat: 'spend', type: 'doc', emoji: '🖨️', title: '포스터 출력', text: '연구활동비 - 물품 - 그밖의 비용' },
      { id: 'allowance', cat: 'spend', type: 'doc', emoji: '💵', title: '연구수당', text: [
        '- 증빙서류는 필요 없음. 확인서류만 도장 넣어서.',
        '- 연구소 연구원은 근로소득 — 계산값 삭제.',
      ].join('\n') },

      // 가짜 PI·학생 — 🔒 칸(계좌·주민번호)은 가려져 보이고, 누르면 보여요
      { id: 'people', cat: 'staff', type: 'table', emoji: '🪪', title: '행정 정보', text: '',
        columns: [
          { id: 'c1', name: '이름' }, { id: 'c2', name: '학번' }, { id: 'c3', name: '생년월일' },
          { id: 'c4', name: '이메일' }, { id: 'c5', name: '전화' }, { id: 'c6', name: '은행' },
          { id: 'c7', name: '계좌번호', secret: true }, { id: 'c8', name: '주민번호', secret: true }, { id: 'c9', name: '주소' },
        ],
        rows: [
          ['홍길동 (PI)', '', '1985-01-01', 'pi@example.ac.kr', '010-0000-0000', '', '', '', ''],
          ['김석사', '2026000001', '2000-03-01', 'kim@example.ac.kr', '010-0000-0001', '○○은행', '000-000-000001', '000301-0000000', '대구 북구 ○○로 1'],
          ['이학사', '2023000002', '2003-05-01', 'lee@example.ac.kr', '010-0000-0002', '○○은행', '000-000-000002', '030501-0000000', '대구 중구 ○○로 2'],
          ['박박사', '2022000003', '1997-07-01', 'park@example.ac.kr', '010-0000-0003', '○○은행', '000-000-000003', '970701-0000000', '대구 수성구 ○○로 3'],
        ].map((v, i) => ({ id: `r${i}`, cells: Object.fromEntries(v.map((x, j) => [`c${j + 1}`, x]).filter(([, x]) => x)) })) },
      { id: 'participant', cat: 'staff', type: 'doc', emoji: '🧑‍💼', title: '참여연구원 추가', text: [
        '학생 아님 / 근로소득자. 처리 순서:',
        '1. 연구소 계약',
        '2. 참여연구원 변경 (계약서 첨부 — 근로소득자 — 사업장)',
        '3. 참여 동의',
        '4. IRIS 등록',
        '5. 산단 확인 요청',
        '',
        '> IAMS 경로: 참여연구원관리 > 참여연구원변경 — 신규는 "신규추가" 선택, 처리상태 대기→신청→승인',
      ].join('\n') },
      { id: 'student', cat: 'staff', type: 'doc', emoji: '🧑‍🎓', title: '학생연구원 (통합관리제)', text: [
        '> IAMS 경로: 학생인건비통합관리제 > 학생연구원등록 (재학생·후학기 등록 수료생만 검색 가능)',
        '',
        '## 매년 준비하면 좋은 것 — 학생인건비 예산 계획',
        '- 석사 ○명 / 박사 ○명 / BK 지원 ○명',
        '- 1인당 지급액',
        '- 인센티브 분배 방식',
        '- 학교 지원 장학금·혜택 정리 (별도 확인 필요)',
      ].join('\n') },

      { id: 'links', cat: 'contact', type: 'doc', emoji: '🔗', title: '시스템·링크', text: [
        '- 포탈 https://iacportal.knu.ac.kr',
        '- 통합연구행정(IAMS) https://iams.knu.ac.kr',
        '- 과제별 담당자: IAMS > 과제정보조회 > 과제상세 > 과제담당자 탭',
        '',
        '> ⚠️ 금액 기준·규정은 바뀔 수 있으니, 애매하면 담당자 확인 먼저.',
      ].join('\n') },
      { id: 'ext', cat: 'contact', type: 'table', emoji: '☎️', title: '산학협력단 내선번호', text: '053-950-XXXX · 담당자 이름은 직접 적어요',
        columns: [{ id: 'a', name: '업무' }, { id: 'b', name: '담당' }, { id: 'c', name: '내선' }],
        rows: [
          ['연구비 집행', '', '2305'], ['학생연구비', '', '2294'], ['중앙구매/장비풀', '', '2332, 2335'],
          ['조달청 구매', '', '2334'], ['BK21팀', '', '2284, 2285, 2286'], ['간접비', '재정경영팀', '2253, 2254, 2255'],
        ].map(([a, b, c], i) => ({ id: `e${i}`, cells: { a, b, c } })) },
    ],
  },

  // 재고 — 랩 멤버(학생)와 같이 씀. need = 살 것 (장보기처럼 수량은 안 셈). equip 묶음은 중앙구매 기준이 장비·비품(100만원)
  // places = 보관 위치 (kind 로 그림·색·온도가 정해짐, app.js PLACE_KINDS) · vendors = 업체 연락처 표 (주문하기에서 고름)
  stock: {
    vendors: {
      columns: [{ id: 'a', name: '분야' }, { id: 'b', name: '업체' }, { id: 'c', name: '전화' }, { id: 'd', name: '이메일' }, { id: 'e', name: '메모' }],
      rows: [
        { id: 'v0', cells: { a: '시약', b: '예시바이오', c: '053-000-0000', d: 'order@example.com', e: '예시' } },
        { id: 'v1', cells: { a: '가구', b: '예시가구', c: '053-000-0001', e: '조달 물품' } },
      ],
    },
    cats: [{ id: 'reagent', name: '시약' }, { id: 'kit', name: '키트' }, { id: 'consum', name: '소모품' }, { id: 'equip', name: '장비', equip: true }, { id: 'etc', name: '기타' }],
    places: [
      { id: 'fridge', name: '냉장고', kind: 'fridge' }, { id: 'freezer', name: '냉동고', kind: 'freezer' }, { id: 'deep', name: '초저온 냉동고', kind: 'deep' },
      { id: 'cabinet', name: '시약장', kind: 'cabinet' }, { id: 'drawer', name: '실험대 서랍', kind: 'drawer' },
    ],
    protoGroups: [{ id: 'ngs', name: 'NGS' }, { id: 'data', name: '데이터·분석' }],
    protocols: [
      { id: 'pr1', group: 'ngs', name: '라이브러리 제작', memo: '예시 — 샘플 8개 기준', note: [
        '## 준비',
        '- [ ] DNA 정량 (Qubit) — 샘플당 50 ng 이상',
        '- [ ] AMPure XP 상온에 30분 꺼내 두기',
        '## 순서',
        '1. Fragmentation → End repair',
        '2. Adapter ligation',
        '3. AMPure 정제 (0.8×) 두 번',
        '4. PCR 증폭 → 최종 정제',
        '> 주의: 에탄올은 그날 새로 만든 80% 사용 (예시)',
      ].join('\n') }, { id: 'pr2', group: 'ngs', name: 'DNA 정량·QC' },
      { id: 'pr3', group: 'data', name: '시퀀싱 데이터 백업' },
    ],
    items: [
      { id: 'st1', cat: 'kit', name: 'Qubit dsDNA HS Assay Kit', maker: 'Thermo Fisher', catNo: 'Q32851', place: 'fridge', memo: '예시 — 지워도 돼요', need: true, protocols: ['pr2'] },
      { id: 'st2', cat: 'kit', name: 'AMPure XP', maker: 'Beckman Coulter', catNo: 'A63881', place: 'fridge', memo: '예시 — 지워도 돼요', protocols: ['pr1'] },
      { id: 'st3', cat: 'reagent', name: 'Nuclease-free water', maker: 'Invitrogen', catNo: 'AM9937', place: 'cabinet', memo: '예시 — 지워도 돼요', protocols: ['pr1', 'pr2'] },
      { id: 'st4', cat: 'consum', name: '필터 팁 200 µL', place: 'drawer', memo: '예시 — 지워도 돼요', protocols: ['pr1', 'pr2'] },
      { id: 'st5', cat: 'consum', name: '1.5 mL LoBind 튜브', maker: 'Eppendorf', catNo: '0030108051', place: 'drawer', memo: '예시 — 지워도 돼요', protocols: ['pr1', 'pr2'] },
      { id: 'st6', cat: 'equip', name: '외장 SSD 4TB', memo: '예시 — 지워도 돼요', protocols: ['pr3'] },
    ],
  },
};
