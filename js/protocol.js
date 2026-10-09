'use strict';
// ---------- 프로토콜 탭 (연구실 — 랩 멤버와 같이 씀): 묶음 → 프로토콜. 프로토콜 = 본문 노트 + 재료(재고 품목, it.protocols = [id]) ----------
// 여럿이 동시에 고칠 수 있어서 sync.js가 프로토콜을 한 건씩 따로 저장함 (labs/{PI}/protocols/{id})
let selProto = null;
const protoItems = p => db.stock.items.filter(it => it.protocols?.includes(p.id));
const protoOf = id => db.stock.protocols.find(p => p.id === id);
// 묶음 안 순서 = p.order (끌어서 바꾸면 매김), 없으면 들어온 순서. 프로토콜은 한 건씩 따로 저장돼서 배열 순서는 기기마다 다를 수 있음
const protoKey = p => p.order ?? db.stock.protocols.indexOf(p);
const protosIn = gid => db.stock.protocols.filter(p => p.group === gid).sort((a, b) => protoKey(a) - protoKey(b));
// 프로토콜을 gid 묶음의 target 앞·뒤로 (target 없으면 맨 끝) 옮기고 그 묶음 순서를 다시 매김
function moveProto(m, gid, target = null, where = 'after') {
  if (m === target) return;
  const list = protosIn(gid).filter(x => x !== m);
  list.splice(target ? list.indexOf(target) + (where === 'after' ? 1 : 0) : list.length, 0, m);
  m.group = gid;
  list.forEach((x, i) => { x.order = i; });
  save();
}
function renderProtocol() {
  const S = db.stock, folded = new Set(layout.protoFold || []); // 접은 묶음 (이 브라우저에만)
  if (!protoOf(selProto)) selProto = S.protocols[0]?.id ?? null;
  const row = p => {
    const items = protoItems(p), need = items.filter(it => it.need).length;
    const b = h('button', cls('note-row', p.id === selProto && 'on'), h('span', 'note-emoji', '🧪'), h('span', 'note-title', p.name), h('span', 'note-meta', need ? `살 것 ${need}` : String(items.length)));
    b.title = `재료 ${items.length}개${need ? ` · 살 것 ${need}` : ''} · 끌어서 순서 바꾸기·다른 묶음으로 옮기기`;
    b.onclick = () => { selProto = p.id; editKey = null; render(); };
    // 다른 프로토콜 위쪽·아래쪽 절반에 놓으면 그 앞·뒤로 (묶음이 다르면 그 묶음으로)
    b.draggable = true;
    b.append(touchHandle());
    b.ondragstart = e => { e.dataTransfer.setData('text/x-proto', p.id); e.dataTransfer.effectAllowed = 'move'; };
    const side = e => (e.clientY - b.getBoundingClientRect().top > b.offsetHeight / 2 ? 'after' : 'before');
    const clear = () => b.classList.remove('drop-before', 'drop-after');
    b.ondragover = e => {
      if (!e.dataTransfer.types.includes('text/x-proto') || !S.protoGroups.some(g => g.id === p.group)) return;
      e.preventDefault();
      b.classList.toggle('drop-before', side(e) === 'before');
      b.classList.toggle('drop-after', side(e) === 'after');
    };
    b.ondragleave = clear;
    b.ondrop = e => {
      e.preventDefault();
      clear();
      const m = protoOf(e.dataTransfer.getData('text/x-proto'));
      if (m) moveProto(m, p.group, p, side(e));
    };
    return b;
  };
  const list = S.protoGroups.flatMap((g, gi) => {
    const ps = protosIn(g.id), shut = folded.has(g.id);
    const add = h('button', 'cat-add', '+');
    add.title = '이 묶음에 새 프로토콜';
    add.onclick = e => { e.stopPropagation(); newProtocol(g.id); };
    const head = h('div', 'cat-head', h('span', 'caret', shut ? '▸' : '▾'), h('span', 'cat-name', g.name), h('span', 'cat-count', String(ps.length)), add);
    head.style.setProperty('--c', g.color || PALETTE[(gi + 3) % PALETTE.length]);
    head.title = '누르면 접기·펴기 · 끌어서 순서 바꾸기 · 길게 누르거나 ✎ 로 이름·색 바꾸기';
    groupEditable(head, () => editProtoGroup(g));
    dragReorder(head, g.id, S.protoGroups.map(x => x.id), ids => {
      S.protoGroups.forEach((x, i) => { x.color ||= PALETTE[(i + 3) % PALETTE.length]; }); // 순서대로 붙던 색은 그대로 두고
      S.protoGroups = byIds(S.protoGroups, ids);
      save();
    });
    head.onclick = () => { if (shut) folded.delete(g.id); else folded.add(g.id); layout.protoFold = [...folded]; saveLayout(); render(); };
    // 프로토콜을 묶음 막대에 놓으면 그 묶음 맨 끝으로 (묶음 순서 끌기와 따로)
    head.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-proto')) { e.preventDefault(); head.classList.add('drop-into'); } });
    head.addEventListener('dragleave', () => head.classList.remove('drop-into'));
    head.addEventListener('drop', e => {
      head.classList.remove('drop-into');
      const m = protoOf(e.dataTransfer.getData('text/x-proto'));
      if (m) { e.preventDefault(); moveProto(m, g.id); }
    });
    return shut ? [head] : [head, ...ps.map(row)];
  });
  const orphans = S.protocols.filter(p => !S.protoGroups.some(g => g.id === p.group)); // 묶음이 없어진 프로토콜
  if (orphans.length) list.push(h('div', 'cat-head static', h('span', 'cat-name', '묶음 없음'), h('span', 'cat-count', String(orphans.length))), ...orphans.map(row));
  const addGroup = h('button', 'cat-new', '+ 묶음');
  addGroup.onclick = () => editProtoGroup(null);
  $('protoList').replaceChildren(h('h2', 'note-list-title', '프로토콜'), ...list, addGroup);
  const p = protoOf(selProto);
  $('protoMain').replaceChildren(...(p ? protocolPage(p) : [h('div', 'panel', h('p', 'hint', S.protoGroups.length
    ? '왼쪽 묶음의 + 로 프로토콜을 만들어요.' : '‘+ 묶음’으로 시작해요 (예: NGS, 세포 배양). 묶음 안에 프로토콜을 만들고, 본문과 재료를 적어요.'))]));
}
// 오른쪽: 본문(글 노트 — 준비·순서·조건·주의할 점) + 재료(재고와 같은 품목: 위치·살 것·주문함이 같이 보임)
function protocolPage(p) {
  const S = db.stock, items = protoItems(p), need = items.filter(it => it.need).length, g = S.protoGroups.find(x => x.id === p.group);
  const key = `pn:${p.id}`, editing = editKey === key;
  const write = h('button', cls('btn small', editing && 'primary'), editing ? '다 썼어요' : '본문 편집');
  write.onclick = () => { editKey = editing ? null : key; render(); };
  const del = h('button', 'btn danger small proto-del', '지우기');
  del.onclick = () => { if (removeProtocol(p)) save(); };
  const print = h('button', 'btn small', '🖨 인쇄 / PDF');
  print.title = '실험대에 두고 볼 수 있게 A4로 인쇄해요 (인쇄 창에서 PDF로 저장도 돼요)';
  print.onclick = () => printProtocol(p);
  // 제목·한 줄 메모는 눌러서 바로 고침, 묶음은 고르는 칸으로도 옮김 (목록에서 끌어도 됨)
  const touched = () => { p.updatedAt = isoToday(); save(); };
  const enterBlur = e => { if (e.key === 'Enter' && !e.isComposing) e.target.blur(); };
  const title = h('input', 'note-title-input proto-name');
  title.value = p.name;
  title.title = '눌러서 이름 고치기';
  title.onkeydown = enterBlur;
  title.onchange = () => { p.name = title.value.trim() || p.name; touched(); };
  const grp = h('select', 'note-cat', [g ? null : Object.assign(h('option', null, '묶음 없음'), { value: '', selected: true }),
    ...S.protoGroups.map(x => Object.assign(h('option', null, x.name), { value: x.id, selected: x.id === p.group }))]);
  grp.title = '묶음 옮기기';
  grp.onchange = () => { if (grp.value) moveProto(p, grp.value); };
  const memo = h('input', 'proto-memo');
  memo.value = p.memo || '';
  memo.placeholder = '한 줄 메모';
  memo.title = '눌러서 메모 고치기 (예: 키트 버전, 샘플 8개 기준)';
  memo.onkeydown = enterBlur;
  memo.onchange = () => { p.memo = memo.value.trim() || undefined; touched(); };
  const head = h('div', 'panel-head proto-title', title, grp, memo,
    p.updatedAt ? h('span', 'hint', `고친 날 ${p.updatedAt.slice(2).replaceAll('-', '.')}`) : null, h('span', 'spacer'), print, write, del);
  let body;
  if (editing) {
    body = h('textarea', 'ov-edit');
    body.value = p.note || '';
    body.placeholder = '## 준비\n- [ ] 시료 정량\n## 순서\n1. …\n> 주의: …';
    body.spellcheck = false;
    const grow = () => { body.style.height = 'auto'; body.style.height = `${body.scrollHeight + 2}px`; };
    body.oninput = () => { p.note = body.value; p.updatedAt = isoToday(); persist(); grow(); };
    requestAnimationFrame(grow);
  } else body = p.note?.trim() ? docView(p.note, v => { p.note = v; }) : h('p', 'hint ov-empty', '아직 비어 있어요. ‘본문 편집’을 눌러 준비·순서·조건·주의할 점을 적어요.');
  const doc = h('div', 'panel proto-doc', head, body, editing ? h('p', 'hint', DOC_HINT) : null);

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
  const mats = h('div', 'panel stock-sec proto-mats', h('div', 'panel-head', h('h2', null, '재료'),
    h('span', 'hint', `${items.length}개${need ? ` · 살 것 ${need}` : ''} · 줄을 누르면 살 것으로 (● = 살 것)`), h('span', 'spacer'), allNeed, need ? toStock : null),
    ...adder, rows.length ? rows : h('p', 'hint stock-empty', '필요한 재료를 위에 적어 넣어요. 재고 탭의 품목과 같은 것으로 이어져요.'));
  return [doc, mats];
}
// 인쇄 / PDF: 버튼·입력칸 없이 종이용으로 따로 그려서 인쇄 (화면은 그대로). 다크 모드여도 흰 종이에 검은 글씨
function printProtocol(p) {
  const g = db.stock.protoGroups.find(x => x.id === p.group), items = protoItems(p), d = s => s.slice(2).replaceAll('-', '.');
  const meta = [g?.name, p.memo, p.updatedAt ? `고친 날 ${d(p.updatedAt)}` : null, `인쇄 ${d(isoToday())}`].filter(Boolean).join(' · ');
  const mats = items.length ? h('table', 'pp-mats',
    h('thead', null, h('tr', null, ['', '재료', '제조사 · Cat. No.', '보관 위치', '메모'].map(t => h('th', null, t)))),
    h('tbody', null, items.map(it => h('tr', null, h('td', 'pp-box', '☐'), h('td', null, it.name), h('td', null, [it.maker, it.catNo].filter(Boolean).join(' · ')),
      h('td', null, placeOf(it.place)?.name || ''), h('td', null, it.memo || ''))))) : null;
  const sheet = h('div', 'pp-sheet', h('h1', null, p.name), h('div', 'pp-meta', meta),
    p.note?.trim() ? docView(p.note, () => {}) : null,
    mats ? h('h2', null, `재료 ${items.length}`) : null, mats);
  let area = $('protoPrint');
  if (!area) { area = h('div'); area.id = 'protoPrint'; document.body.append(area); }
  area.replaceChildren(sheet);
  const old = document.title;
  document.title = `프로토콜_${p.name}`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_'); // PDF 파일 이름
  document.body.classList.add('printing-proto');
  const done = () => { document.body.classList.remove('printing-proto'); area.replaceChildren(); document.title = old; removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  window.print();
}
function editProtoGroup(g) {
  const n = g ? db.stock.protocols.filter(p => p.group === g.id).length : 0;
  const del = g ? h('button', 'btn danger small', '이 묶음 지우기') : null;
  if (del) {
    del.type = 'button';
    del.disabled = n > 0;
    del.title = n ? '안의 프로토콜을 지우거나 다른 묶음으로 옮긴 뒤 지울 수 있어요' : '';
    del.onclick = () => { db.stock.protoGroups = db.stock.protoGroups.filter(x => x !== g); dlg.close(); save(); };
  }
  ask(g ? '프로토콜 묶음 고치기' : '새 프로토콜 묶음', [{ key: 'name', label: '이름', value: g?.name ?? '', required: true, placeholder: '예: NGS, 세포 배양' },
    { key: 'color', label: '색', type: 'color', value: g?.color || newColor(db.stock.protoGroups.map(x => x.color)) }], v => {
    const t = g || { id: uid() };
    t.name = v.name.trim();
    if (v.color) t.color = v.color;
    if (!g) db.stock.protoGroups.push(t);
    save();
  }, del ? [h('p', null, del)] : []);
}
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
// 프로토콜 지우기 (물어보고). 재료로 이어 둔 품목은 재고에 그대로 남고 연결만 끊김
function removeProtocol(p) {
  if (!confirm(`'${p.name}'을(를) 지울까요? 재료(품목)는 재고에 그대로 남아요.`)) return false;
  for (const it of db.stock.items) if (it.protocols) it.protocols = it.protocols.filter(x => x !== p.id);
  db.stock.protocols = db.stock.protocols.filter(x => x !== p);
  selProto = null;
  return true;
}
// 새 프로토콜: 본문은 틀을 채워 바로 쓰기 (이름·메모·묶음은 나중에 프로토콜 화면 위에서 바로 고침)
function newProtocol(group) {
  ask('새 프로토콜', [
    { key: 'name', label: '이름', required: true, placeholder: '예: 라이브러리 제작' },
    { key: 'group', label: '묶음', type: 'select', options: db.stock.protoGroups.map(g => [g.id, g.name]), value: group },
    { key: 'memo', label: '한 줄 메모', placeholder: '예: 키트 버전, 샘플 8개 기준' },
  ], v => {
    const last = protosIn(v.group).at(-1);
    const t = { id: uid(), updatedAt: isoToday(), name: v.name.trim(), group: v.group, memo: v.memo.trim() || undefined, note: PROTO_TEMPLATE, order: last ? protoKey(last) + 1 : 0 };
    db.stock.protocols.push(t);
    selProto = t.id;
    editKey = `pn:${t.id}`;
    save();
  });
}
