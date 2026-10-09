'use strict';
// ---------- 정보: 묶음 → 노트 (살림노트 노트 목록과 같은 구성) ----------
// doc 노트 = 글 한 덩어리, table 노트 = 칸·줄 (secret 칸은 기본으로 가려 보임, 열 너비는 칸마다 기억)
let selNote = null, showSecret = false;

function noteMeta(n) {
  if (n.type === 'table') return String(n.rows.length);
  const boxes = n.text.match(/^\s*- \[[ x]\]/gm) || [];
  return boxes.length ? `${boxes.filter(b => b.includes('[x]')).length}/${boxes.length}` : '';
}

function renderInfo() {
  const { cats, notes } = db.info;
  if (!notes.some(n => n.id === selNote)) selNote = notes[0]?.id ?? null;
  const list = [];
  for (const c of cats) {
    const ns = notes.filter(n => n.cat === c.id);
    const add = h('button', 'cat-add', '+');
    add.title = '이 묶음에 노트 추가';
    add.onclick = e => { e.stopPropagation(); addNote(c); };
    const head = h('div', 'cat-head', h('span', 'caret', c.open ? '▾' : '▸'), h('span', 'cat-name', c.name), h('span', 'cat-count', String(ns.length)), add);
    head.style.setProperty('--c', c.color);
    head.title = '누르면 접기·펴기 · 끌어서 순서 바꾸기 · 길게 누르거나 ✎ 로 이름·색 바꾸기';
    head.onclick = () => { c.open = !c.open; save(); };
    head.ondblclick = e => { e.stopPropagation(); editCat(c); };
    groupEditable(head, () => editCat(c));
    dragReorder(head, c.id, cats.map(x => x.id), ids => { db.info.cats = byIds(cats, ids); save(); });
    list.push(head);
    if (c.open) for (const n of ns) {
      const row = h('button', cls('note-row', n.id === selNote && 'on'), h('span', 'note-emoji', n.emoji || '·'), h('span', 'note-title', n.title), h('span', 'note-meta', noteMeta(n)));
      row.onclick = () => { selNote = n.id; editKey = null; showSecret = false; render(); };
      list.push(row);
    }
  }
  const addCat = h('button', 'cat-new', '+ 묶음');
  addCat.onclick = () => ask('묶음 추가', [{ key: 'name', label: '이름', required: true }], v => {
    cats.push({ id: uid(), name: v.name.trim(), color: newColor(cats.map(x => x.color)), open: true });
    save();
  });
  $('noteList').replaceChildren(h('h2', 'note-list-title', '정보'), ...list, addCat);
  const n = notes.find(x => x.id === selNote);
  $('noteView').replaceChildren(...(n ? noteView(n) : [h('p', 'hint', '묶음의 + 로 노트를 만들어요.')]));
}

function noteView(n) {
  const key = `note:${n.id}`, editing = editKey === key;
  const emoji = h('input', 'note-emoji-input');
  emoji.value = n.emoji || '';
  emoji.title = '아이콘';
  emoji.onchange = () => { n.emoji = emoji.value.trim(); save(); };
  const title = h('input', 'note-title-input');
  title.value = n.title;
  title.onchange = () => { n.title = title.value.trim() || '제목 없음'; save(); };
  const catSel = h('select', 'note-cat', db.info.cats.map(c => { const o = h('option', null, c.name); o.value = c.id; o.selected = c.id === n.cat; return o; }));
  catSel.title = '묶음 옮기기';
  catSel.onchange = () => { n.cat = catSel.value; db.info.cats.find(c => c.id === n.cat).open = true; save(); };
  const toggle = h('button', cls('btn small', editing && 'primary'), editing ? '다 썼어요' : n.type === 'table' ? '메모 편집' : '편집');
  toggle.onclick = () => { editKey = editing ? null : key; render(); };
  const tools = h('div', 'note-tools', catSel, toggle);
  if (n.type === 'doc' && !editing && /- \[x\]/.test(n.text)) {
    const clr = h('button', 'btn small', '체크 모두 지우기');
    clr.onclick = () => { n.text = n.text.replace(/- \[x\]/g, '- [ ]'); save(); };
    tools.append(clr);
  }
  if (n.type === 'table' && n.columns.some(c => c.secret)) {
    const s = h('button', 'btn small', showSecret ? '🔒 다시 가리기' : '🔓 가린 칸 보기');
    s.onclick = () => { showSecret = !showSecret; render(); };
    tools.append(s);
  }
  const del = h('button', 'btn danger small', '노트 지우기');
  del.onclick = () => { if (confirm(`'${n.title}' 노트를 지울까요?`)) { db.info.notes = db.info.notes.filter(x => x !== n); save(); } };
  tools.append(del);
  const setText = v => { n.text = v; };
  const body = editing ? h('div', cls('panel', n.type === 'table' && 'memo-edit'), docEditor(n.text, setText, n.type === 'table' ? '표 위에 보일 메모' : '여기에 써요'))
    : n.text ? h('div', cls('panel', n.type === 'table' && 'memo'), docView(n.text, setText)) : null;
  return [h('div', 'note-head', emoji, title, tools), body, n.type === 'table' ? tableBody(n) : null].filter(Boolean);
}

// 표: 열 너비는 머리칸 오른쪽 끝을 끌어서 칸마다 (c.width 에 저장)
const COL_W = 140, DEL_W = 34;
function tableBody(n) {
  const cols = n.columns.map(c => { const col = h('col'); col.style.width = `${c.width || COL_W}px`; return col; });
  const delCol = h('col');
  delCol.style.width = `${DEL_W}px`;
  const table = h('table', 'tbl itable');
  const fit = () => { table.style.width = `${n.columns.reduce((a, c) => a + (c.width || COL_W), 0) + DEL_W}px`; };
  const head = h('tr', null, n.columns.map((c, i) => {
    const name = h('input', 'th-input');
    name.value = c.name;
    name.onchange = () => { c.name = name.value.trim() || '칸'; persist(); };
    const lock = h('button', cls('icon-mini', c.secret && 'on'), '🔒');
    lock.title = c.secret ? '가리기 끄기' : '민감정보로 가리기';
    lock.onclick = () => { c.secret = !c.secret; save(); };
    const x = h('button', 'icon-mini', '×');
    x.title = '이 칸 지우기';
    x.onclick = () => { if (confirm(`'${c.name}' 칸을 지울까요?`)) { n.columns = n.columns.filter(y => y !== c); n.rows.forEach(r => delete r.cells[c.id]); save(); } };
    const grip = colGrip(w => { c.width = w; cols[i].style.width = `${w}px`; fit(); }, persist, 60);
    // ↔ 를 끌어 다른 머리칸 왼쪽·오른쪽 절반에 놓으면 그 앞·뒤로 (칸 이름 입력은 그대로 쓰게 손잡이만 끌림)
    const move = touchHandle(h('span', 'icon-mini col-move', '↔'));
    move.draggable = true;
    move.title = '끌어서 열 순서 바꾸기';
    move.ondragstart = e => { e.dataTransfer.setData('text/x-col', c.id); e.dataTransfer.effectAllowed = 'move'; };
    const th = h('th', c.secret ? 'secret' : null, name, h('div', 'th-tools', move, lock, x), grip); // 아이콘은 오른쪽 끝에 떠 있음 → 머리칸 글자가 아래 칸과 같은 선에서 시작
    const side = e => (e.clientX - th.getBoundingClientRect().left > th.offsetWidth / 2 ? 'after' : 'before');
    const clear = () => th.classList.remove('drop-before', 'drop-after');
    th.ondragover = e => {
      if (!e.dataTransfer.types.includes('text/x-col')) return;
      e.preventDefault();
      th.classList.toggle('drop-before', side(e) === 'before');
      th.classList.toggle('drop-after', side(e) === 'after');
    };
    th.ondragleave = clear;
    th.ondrop = e => {
      e.preventDefault();
      clear();
      const from = n.columns.find(y => y.id === e.dataTransfer.getData('text/x-col'));
      if (!from || from === c) return;
      const rest = n.columns.filter(y => y !== from);
      rest.splice(rest.indexOf(c) + (side(e) === 'after' ? 1 : 0), 0, from);
      n.columns = rest;
      save();
    };
    return th;
  }), h('th'));
  const rows = n.rows.map(r => {
    const del = h('button', 'link-btn', '×');
    del.title = '이 줄 지우기';
    del.onclick = () => { n.rows = n.rows.filter(y => y !== r); save(); };
    return h('tr', null, n.columns.map(c => {
      const i = h('input', cls('cell-input', c.secret && !showSecret && 'masked'));
      i.value = r.cells[c.id] ?? '';
      i.autocomplete = 'off';
      i.onchange = () => { r.cells[c.id] = i.value; persist(); };
      return h('td', null, i);
    }), h('td', null, del));
  });
  table.append(h('colgroup', null, cols, delCol), h('thead', null, head), h('tbody', null, rows));
  fit();
  const addRow = h('button', 'btn small', '+ 줄');
  addRow.onclick = () => { n.rows.push({ id: uid(), cells: {} }); save(); };
  const addCol = h('button', 'btn small', '+ 칸');
  addCol.onclick = () => ask('칸 추가', [
    { key: 'name', label: '칸 이름', required: true },
    { key: 'secret', label: '가려서 보이기', type: 'select', options: [['', '아니요'], ['1', '예 (주민번호·계좌 등)']], value: '' },
  ], v => { n.columns.push({ id: uid(), name: v.name.trim(), secret: !!v.secret }); save(); });
  return h('div', 'panel',
    h('div', 'tbl-wrap', table),
    h('div', 'itable-tools', addRow, addCol, h('span', 'hint', '머리칸 오른쪽 끝을 끌면 열 너비 · ↔ 를 끌면 열 순서가 바뀌어요'),
      n.columns.some(c => c.secret) ? h('span', 'hint', '🔒 칸은 가려져 보여요 (위 ‘🔓 가린 칸 보기’로 잠깐 보여요). 로그인하면 내 계정에만 저장돼요.') : null));
}

function addNote(c) {
  ask(`${c.name} — 새 노트`, [
    { key: 'title', label: '제목', required: true },
    [{ key: 'emoji', label: '아이콘', value: '📝' },
      { key: 'type', label: '종류', type: 'select', options: [['doc', '글 (체크리스트·메모)'], ['table', '표 (명단·연락처)']], value: 'doc' }],
  ], v => {
    const n = { id: uid(), cat: c.id, type: v.type, emoji: v.emoji.trim(), title: v.title.trim(), text: '' };
    if (v.type === 'table') Object.assign(n, { columns: [{ id: uid(), name: '이름' }, { id: uid(), name: '메모' }], rows: [{ id: uid(), cells: {} }] });
    db.info.notes.push(n);
    c.open = true;
    selNote = n.id;
    editKey = v.type === 'doc' ? `note:${n.id}` : null;
    save();
  });
}

function editCat(c) {
  const del = h('button', 'btn danger', '묶음 지우기');
  del.type = 'button';
  del.onclick = () => {
    const ns = db.info.notes.filter(n => n.cat === c.id);
    if (!confirm(ns.length ? `노트 ${ns.length}개도 같이 지워져요. 지울까요?` : `'${c.name}'을(를) 지울까요?`)) return;
    db.info.cats = db.info.cats.filter(x => x !== c);
    db.info.notes = db.info.notes.filter(n => n.cat !== c.id);
    dlg.close();
    save();
  };
  ask('묶음', [{ key: 'name', label: '이름', value: c.name, required: true }, { key: 'color', label: '색', type: 'color', value: c.color }], v => {
    c.name = v.name.trim();
    if (v.color) c.color = v.color;
    save();
  }, [del]);
}
