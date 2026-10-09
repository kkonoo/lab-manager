'use strict';
// ---------- 기기 탭 (연구 모드 — 랩 멤버와 같이 씀): 공동기기 handbook. 묶음 → 기기 = 본문 노트(사용법·주의사항) + 담당자·위치 + 사진 ----------
// 틀은 프로토콜과 같음 (pages.js). sync.js가 기기를 한 건씩 따로 저장함 (labs/{PI}/equips/{id})
// db.stock.equips { id, group, name, memo, note, owner(담당자 글), place(보관 위치 id), photos: [{ id(Drive 파일) }], order, updatedAt }
// 새 기기 본문에 미리 채우는 틀 (예: …)를 바꿔 쓰면 됨
const EQUIP_TEMPLATE = [
  '## 사용법',
  '1. 켜기 (예: 본체 → 컴퓨터 → 프로그램 순서, 램프는 20분 예열)',
  '2. 시료 넣기·설정 (예: 로터 균형 맞추기, 온도 4°C)',
  '3. 측정·실행',
  '4. 끄기·정리 (예: 프로그램 → 컴퓨터 → 본체, 로터 꺼내 말리기)',
  '## 주의사항',
  '> 주의: 꼭 지킬 것 (예: 로터 최대 속도 넘기지 않기)',
  '- 하면 안 되는 것 (예: 뚜껑 안 닫힌 튜브 넣지 않기)',
  '- [ ] 쓰고 나서 확인할 것 (예: 사용 기록 적기, 전원 끄기)',
  '## 예약·기록',
  '- 예약 (예: 공용 캘린더에 이름·시간)',
  '- 사용 기록 (예: 옆 노트에 날짜·이름·사용 시간)',
  '## 고장·문의',
  '- 고장 나면 (예: 담당자에게 바로 연락, 업체 A/S 02-000-0000)',
  '## 참고',
  '- 매뉴얼·교육 영상 링크는 그대로 붙여 넣어요',
].join('\n');
const EQUIP = pageBook({
  key: 'equip', noun: '기기', emoji: '🔧', groups: 'equipGroups', items: 'equips', list: 'equipList', main: 'equipMain', fold: 'equipFold', editKey: 'en',
  template: EQUIP_TEMPLATE,
  groupPh: '예: 공동기기, 이미징, 분석 장비', namePh: '예: 원심분리기 (Eppendorf 5424R)', memoPh: '예: 예약 필수, 교육 받은 사람만',
  emptyStart: '‘+ 묶음’으로 시작해요 (예: 공동기기, 이미징). 묶음 안에 기기를 만들고, 사용법·주의사항·담당자·사진을 넣어요.',
  bodyPh: '## 사용법\n1. …\n## 주의사항\n> 주의: …', bodyEmpty: '아직 비어 있어요. ‘본문 편집’을 눌러 사용법·주의사항을 적어요.',
  printHint: '기기 옆에 붙여 둘 수 있게 A4로 인쇄해요',
  rowMeta: e => [(e.owner || '').split(/\s/)[0], e.owner ? `담당 ${e.owner}` : ''], // 목록엔 담당자 이름만
  // 제목 줄: 담당자(이름·연락처 글) · 위치(재고의 보관 위치에서 고름)
  head: (e, touched, enterBlur) => {
    const owner = h('input', 'proto-memo equip-owner');
    owner.value = e.owner || '';
    owner.placeholder = '담당자';
    owner.title = '눌러서 담당자 고치기 (예: 홍길동 010-0000-0000)';
    owner.onkeydown = enterBlur;
    owner.onchange = () => { e.owner = owner.value.trim() || undefined; touched(); };
    const place = h('select', 'note-cat', [Object.assign(h('option', null, '위치 없음'), { value: '' }),
      ...db.stock.places.map(x => Object.assign(h('option', null, x.name), { value: x.id, selected: x.id === e.place }))]);
    place.title = '위치 (재고 탭의 보관 위치에서 고르고, 새 위치는 거기서 만들어요)';
    place.onchange = () => { e.place = place.value || undefined; touched(); };
    return [h('label', 'equip-field', '담당', owner), place];
  },
  printMeta: e => [e.owner ? `담당 ${e.owner}` : null, placeOf(e.place)?.name],
});
function renderEquip() { EQUIP.render(); }
