'use strict';
// ---------- 프로토콜 탭 (연구 모드 — 랩 멤버와 같이 씀): 묶음 → 프로토콜. 프로토콜 = 본문 노트 + 재료(재고 품목, it.protocols = [id]) ----------
// 여럿이 동시에 고칠 수 있어서 sync.js가 프로토콜을 한 건씩 따로 저장함 (labs/{PI}/protocols/{id})
const protoItems = p => db.stock.items.filter(it => it.protocols?.includes(p.id));
// 새 프로토콜 본문에 미리 채우는 틀: 쓰는 법(## 소제목 · - [ ] 체크 · 1. 순서 · > 주의)을 예시로 보여 주고, (예: …)를 바꿔 쓰면 됨
const PROTO_TEMPLATE = [
  '## 목적',
  '- 이 프로토콜로 무엇을 하는지 한 줄 (예: Illumina 라이브러리 제작, 샘플 8개 기준)',
  '## 준비',
  '- [ ] 미리 꺼내 둘 시약 (예: AMPure XP 상온에 30분)',
  '- [ ] 샘플 조건 (예: DNA 50 ng 이상, Qubit으로 정량)',
  '- [ ] 켜 둘 장비 (예: 히트블록 37°C)',
  '## 순서',
  '1. 첫 단계 (예: Fragmentation — 37°C 15분)',
  '2. 다음 단계 (예: Adapter ligation — 20°C 15분)',
  '3. 정제 (예: AMPure 0.8× 두 번)',
  '4. 마지막 단계 (예: PCR 8 cycles → 최종 정제)',
  '## 조건',
  '- PCR: 98°C 30초 → (98°C 10초 · 60°C 30초 · 72°C 30초) × 8 → 72°C 5분',
  '- 원심분리: 13,000 rpm 1분',
  '> 주의: 실수하기 쉬운 점이나 안전 사항 (예: 에탄올은 그날 새로 만든 80%)',
  '## 참고',
  '- 키트 매뉴얼·논문 링크는 그대로 붙여 넣어요',
  '- **굵게** 쓰려면 별표 두 개로 감싸요',
].join('\n');
// 왼쪽 목록·제목 줄·본문·인쇄·지우기는 pages.js 틀. 여기는 프로토콜만의 칸: 재료(재고와 같은 품목: 위치·살 것·주문함이 같이 보임)
const PROTO = pageBook({
  key: 'proto', noun: '프로토콜', emoji: '🧪', groups: 'protoGroups', items: 'protocols', list: 'protoList', main: 'protoMain', fold: 'protoFold', editKey: 'pn',
  template: PROTO_TEMPLATE,
  groupPh: '예: NGS, 세포 배양', namePh: '예: 라이브러리 제작', memoPh: '예: 키트 버전, 샘플 8개 기준',
  emptyStart: '‘+ 묶음’으로 시작해요 (예: NGS, 세포 배양). 묶음 안에 프로토콜을 만들고, 본문과 재료를 적어요.',
  bodyPh: '## 준비\n- [ ] 시료 정량\n## 순서\n1. …\n> 주의: …', bodyEmpty: '아직 비어 있어요. ‘본문 편집’을 눌러 준비·순서·조건·주의할 점을 적어요.',
  printHint: '실험대에 두고 볼 수 있게 A4로 인쇄해요',
  removeNote: '재료(품목)는 재고에 그대로 남아요.', // 재료로 이어 둔 품목은 재고에 그대로 남고 연결만 끊김
  onRemove: p => { for (const it of db.stock.items) if (it.protocols) it.protocols = it.protocols.filter(x => x !== p.id); },
  rowMeta: p => {
    const items = protoItems(p), need = items.filter(it => it.need).length;
    return [need ? `살 것 ${need}` : String(items.length), `재료 ${items.length}개${need ? ` · 살 것 ${need}` : ''}`];
  },
  below: p => [protoMaterials(p)],
  printBody: p => {
    const items = protoItems(p);
    return items.length ? [h('h2', null, `재료 ${items.length}`), h('table', 'pp-mats',
      h('thead', null, h('tr', null, ['', '재료', '제조사 · Cat. No.', '보관 위치', '메모'].map(t => h('th', null, t)))),
      h('tbody', null, items.map(it => h('tr', null, h('td', 'pp-box', '☐'), h('td', null, it.name), h('td', null, [it.maker, it.catNo].filter(Boolean).join(' · ')),
        h('td', null, placeOf(it.place)?.name || ''), h('td', null, it.memo || '')))))] : null;
  },
});
const protoOf = id => PROTO.of(id);
function renderProtocol() { PROTO.render(); }
function protoMaterials(p) {
  const S = db.stock, items = protoItems(p), need = items.filter(it => it.need).length;
  const rows = items.map(it => {
    const drop = h('button', 'link-btn', '빼기');
    drop.title = '이 프로토콜에서 빼요 (품목은 재고에 그대로)';
    drop.onclick = e => { e.stopPropagation(); it.protocols = it.protocols.filter(x => x !== p.id); save(); };
    const r = stockRow(it, h('span', cls('mark', it.need && 'on')), [h('span', 'cat-chip', stockCat(it.cat)?.name ?? ''), openOrder(it) ? h('span', 'tag', '주문함') : null, drop], p.id);
    r.classList.add('tap');
    r.title = it.need ? '눌러서 살 것에서 빼기' : '눌러서 살 것으로 표시';
    r.onclick = () => { it.need = !it.need; save(); };
    return r;
  });
  const allNeed = h('button', 'btn small', '재료 모두 살 것으로');
  allNeed.disabled = !items.length || need === items.length;
  allNeed.onclick = () => { for (const it of items) it.need = true; save(); };
  const toStock = h('button', 'btn small', '재고 살 것 보기');
  toStock.onclick = () => { stockView = 'need'; setTab('stock'); };
  const adder = stockAdder(`pr-${p.id}`, '+ 재료 추가 (재고에서 찾기 · 없으면 새 품목)', name => {
    const it = S.items.find(x => sameName(x.name, name)) || newStockItem(name);
    it.protocols = [...new Set([...(it.protocols || []), p.id])];
    save();
  }, S.items.filter(it => !it.protocols?.includes(p.id)));
  return h('div', 'panel stock-sec proto-mats', h('div', 'panel-head', h('h2', null, '재료'),
    h('span', 'hint', `${items.length}개${need ? ` · 살 것 ${need}` : ''} · 줄을 누르면 살 것으로 (● = 살 것)`), h('span', 'spacer'), allNeed, need ? toStock : null),
    ...adder, rows.length ? rows : h('p', 'hint stock-empty', '필요한 재료를 위에 적어 넣어요. 재고 탭의 품목과 같은 것으로 이어져요.'));
}
