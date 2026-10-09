'use strict';
// ---------- 프로토콜·기기 탭이 같이 쓰는 틀 (연구 모드 — 랩 멤버와 같이 씀) ----------
// 왼쪽: 묶음 → 페이지 (묶음을 누르면 접기, 끌어서 순서 바꾸기·다른 묶음으로) / 오른쪽: 제목·묶음·한 줄 메모 + 본문 노트 + 탭마다 다른 칸
// 페이지는 sync.js가 한 건씩 따로 저장 (여럿이 동시에 고쳐도 안 겹치게). B = 탭 설정 (protocol.js · equip.js)
//   key·noun·emoji · groups·items(db.stock 칸 이름) · list·main(화면 id) · fold(접은 묶음, layout) · editKey(본문 편집 중 표시 앞머리)
//   template·bodyPh·bodyEmpty · groupPh·namePh·memoPh · emptyStart · printHint
//   rowMeta(p) → [목록 오른쪽 글, 마우스 올리면 보일 설명] · head(p, touched) → 제목 줄에 더할 칸 · below(p) → 본문 아래 패널
//   printMeta(p) → 인쇄 머리 줄에 더할 글 · printBody(p) → 인쇄 본문 아래 · removeNote · onRemove(p)
const eul = w => ((w.charCodeAt(w.length - 1) - 0xAC00) % 28 ? '을' : '를'); // 받침 있으면 '을' (프로토콜을 · 기기를)
// 종이용으로 따로 그린 sheet만 인쇄 (화면은 그대로) — 프로토콜·기기·팁. title = PDF 파일 이름
function printSheet(sheet, title) {
  let area = $('protoPrint');
  if (!area) { area = h('div'); area.id = 'protoPrint'; document.body.append(area); }
  area.replaceChildren(sheet);
  const old = document.title;
  document.title = title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
  document.body.classList.add('printing-proto');
  const done = () => { document.body.classList.remove('printing-proto'); area.replaceChildren(); document.title = old; removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  const imgs = [...sheet.querySelectorAll('img')].filter(i => !i.complete); // 사진이 있으면 다 불러온 뒤 인쇄 (늦어도 5초)
  if (!imgs.length) window.print();
  else Promise.race([Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; }))), new Promise(r => setTimeout(r, 5000))]).then(() => window.print());
}
function pageBook(B) {
  let sel = null;
  const groups = () => db.stock[B.groups], items = () => db.stock[B.items];
  const of = id => items().find(p => p.id === id);
  // 묶음 안 순서 = p.order (끌어서 바꾸면 매김), 없으면 들어온 순서. 한 건씩 따로 저장돼서 배열 순서는 기기마다 다를 수 있음
  const order = p => p.order ?? items().indexOf(p);
  const inGroup = gid => items().filter(p => p.group === gid).sort((a, b) => order(a) - order(b));
  const drag = `text/x-${B.key}`;
  // 페이지를 gid 묶음의 target 앞·뒤로 (target 없으면 맨 끝) 옮기고 그 묶음 순서를 다시 매김
  function move(m, gid, target = null, where = 'after') {
    if (m === target) return;
    const list = inGroup(gid).filter(x => x !== m);
    list.splice(target ? list.indexOf(target) + (where === 'after' ? 1 : 0) : list.length, 0, m);
    m.group = gid;
    list.forEach((x, i) => { x.order = i; });
    save();
  }
  function render() {
    const folded = new Set(layout[B.fold] || []); // 접은 묶음 (이 브라우저에만)
    if (!of(sel)) sel = items()[0]?.id ?? null;
    const row = p => {
      const [meta, tip] = B.rowMeta(p);
      const b = h('button', cls('note-row', p.id === sel && 'on'), h('span', 'note-emoji', B.emoji), h('span', 'note-title', p.name), h('span', 'note-meta', meta));
      b.title = `${tip ? `${tip} · ` : ''}끌어서 순서 바꾸기·다른 묶음으로 옮기기`;
      b.onclick = () => { sel = p.id; editKey = null; render(); };
      // 다른 페이지 위쪽·아래쪽 절반에 놓으면 그 앞·뒤로 (묶음이 다르면 그 묶음으로)
      b.draggable = true;
      b.append(touchHandle());
      b.ondragstart = e => { e.dataTransfer.setData(drag, p.id); e.dataTransfer.effectAllowed = 'move'; };
      const side = e => (e.clientY - b.getBoundingClientRect().top > b.offsetHeight / 2 ? 'after' : 'before');
      const clear = () => b.classList.remove('drop-before', 'drop-after');
      b.ondragover = e => {
        if (!e.dataTransfer.types.includes(drag) || !groups().some(g => g.id === p.group)) return;
        e.preventDefault();
        b.classList.toggle('drop-before', side(e) === 'before');
        b.classList.toggle('drop-after', side(e) === 'after');
      };
      b.ondragleave = clear;
      b.ondrop = e => {
        e.preventDefault();
        clear();
        const m = of(e.dataTransfer.getData(drag));
        if (m) move(m, p.group, p, side(e));
      };
      return b;
    };
    const list = groups().flatMap((g, gi) => {
      const ps = inGroup(g.id), shut = folded.has(g.id);
      const add = h('button', 'cat-add', '+');
      add.title = `이 묶음에 새 ${B.noun}`;
      add.onclick = e => { e.stopPropagation(); newPage(g.id); };
      const head = h('div', 'cat-head', h('span', 'caret', shut ? '▸' : '▾'), h('span', 'cat-name', g.name), h('span', 'cat-count', String(ps.length)), add);
      head.style.setProperty('--c', g.color || PALETTE[(gi + 3) % PALETTE.length]);
      head.title = '누르면 접기·펴기 · 끌어서 순서 바꾸기 · 길게 누르거나 ✎ 로 이름·색 바꾸기';
      groupEditable(head, () => editGroup(g));
      dragReorder(head, g.id, groups().map(x => x.id), ids => {
        groups().forEach((x, i) => { x.color ||= PALETTE[(i + 3) % PALETTE.length]; }); // 순서대로 붙던 색은 그대로 두고
        db.stock[B.groups] = byIds(groups(), ids);
        save();
      });
      head.onclick = () => { if (shut) folded.delete(g.id); else folded.add(g.id); layout[B.fold] = [...folded]; saveLayout(); render(); };
      // 페이지를 묶음 막대에 놓으면 그 묶음 맨 끝으로 (묶음 순서 끌기와 따로)
      head.addEventListener('dragover', e => { if (e.dataTransfer.types.includes(drag)) { e.preventDefault(); head.classList.add('drop-into'); } });
      head.addEventListener('dragleave', () => head.classList.remove('drop-into'));
      head.addEventListener('drop', e => {
        head.classList.remove('drop-into');
        const m = of(e.dataTransfer.getData(drag));
        if (m) { e.preventDefault(); move(m, g.id); }
      });
      return shut ? [head] : [head, ...ps.map(row)];
    });
    const orphans = items().filter(p => !groups().some(g => g.id === p.group)); // 묶음이 없어진 페이지
    if (orphans.length) list.push(h('div', 'cat-head static', h('span', 'cat-name', '묶음 없음'), h('span', 'cat-count', String(orphans.length))), ...orphans.map(row));
    const addGroup = h('button', 'cat-new', '+ 묶음');
    addGroup.onclick = () => editGroup(null);
    $(B.list).replaceChildren(h('h2', 'note-list-title', B.noun), ...list, addGroup);
    const p = of(sel);
    $(B.main).replaceChildren(...(p ? page(p) : [h('div', 'panel', h('p', 'hint', groups().length
      ? `왼쪽 묶음의 + 로 ${B.noun}${eul(B.noun)} 만들어요.` : B.emptyStart))]));
  }
  // 오른쪽: 제목 줄 + 본문(글 노트) + 탭마다 다른 패널
  function page(p) {
    const g = groups().find(x => x.id === p.group);
    const key = `${B.editKey}:${p.id}`, editing = editKey === key;
    const write = h('button', cls('btn small', editing && 'primary'), editing ? '다 썼어요' : '본문 편집');
    write.onclick = () => { editKey = editing ? null : key; render(); };
    const del = h('button', 'btn danger small proto-del', '지우기');
    del.onclick = () => { if (remove(p)) save(); };
    const print = h('button', 'btn small', '🖨 인쇄 / PDF');
    print.title = `${B.printHint} (인쇄 창에서 PDF로 저장도 돼요)`;
    print.onclick = () => printPage(p);
    // 제목·한 줄 메모는 눌러서 바로 고침, 묶음은 고르는 칸으로도 옮김 (목록에서 끌어도 됨)
    const touched = () => { p.updatedAt = isoToday(); save(); };
    const enterBlur = e => { if (e.key === 'Enter' && !e.isComposing) e.target.blur(); };
    const title = h('input', 'note-title-input proto-name');
    title.value = p.name;
    title.title = '눌러서 이름 고치기';
    title.onkeydown = enterBlur;
    title.onchange = () => { p.name = title.value.trim() || p.name; touched(); };
    const grp = h('select', 'note-cat', [g ? null : Object.assign(h('option', null, '묶음 없음'), { value: '', selected: true }),
      ...groups().map(x => Object.assign(h('option', null, x.name), { value: x.id, selected: x.id === p.group }))]);
    grp.title = '묶음 옮기기';
    grp.onchange = () => { if (grp.value) move(p, grp.value); };
    const memo = h('input', 'proto-memo');
    memo.value = p.memo || '';
    memo.placeholder = '한 줄 메모';
    memo.title = `눌러서 메모 고치기 (${B.memoPh})`;
    memo.onkeydown = enterBlur;
    memo.onchange = () => { p.memo = memo.value.trim() || undefined; touched(); };
    const head = h('div', 'panel-head proto-title', title, grp, memo, B.head?.(p, touched, enterBlur),
      p.updatedAt ? h('span', 'hint', `고친 날 ${p.updatedAt.slice(2).replaceAll('-', '.')}`) : null, h('span', 'spacer'), print, write, del);
    let body;
    if (editing) {
      body = h('textarea', 'ov-edit');
      body.value = p.note || '';
      body.placeholder = B.bodyPh;
      body.spellcheck = false;
      const grow = () => { body.style.height = 'auto'; body.style.height = `${body.scrollHeight + 2}px`; };
      body.oninput = () => { p.note = body.value; p.updatedAt = isoToday(); persist(); grow(); };
      requestAnimationFrame(grow);
    } else body = p.note?.trim() ? docView(p.note, v => { p.note = v; }) : h('p', 'hint ov-empty', B.bodyEmpty);
    return [h('div', 'panel proto-doc', head, body, editing ? h('p', 'hint', DOC_HINT) : null), ...(B.below?.(p) || [])];
  }
  // 인쇄 / PDF: 버튼·입력칸 없이 종이용으로 따로 그려서 인쇄 (화면은 그대로). 다크 모드여도 흰 종이에 검은 글씨
  function printPage(p) {
    const g = groups().find(x => x.id === p.group), d = s => s.slice(2).replaceAll('-', '.');
    const meta = [g?.name, p.memo, ...(B.printMeta?.(p) || []), p.updatedAt ? `고친 날 ${d(p.updatedAt)}` : null, `인쇄 ${d(isoToday())}`].filter(Boolean).join(' · ');
    printSheet(h('div', 'pp-sheet', h('h1', null, p.name), h('div', 'pp-meta', meta),
      p.note?.trim() ? docView(p.note, () => {}) : null, B.printBody?.(p)), `${B.noun}_${p.name}`);
  }
  function editGroup(g) {
    const n = g ? items().filter(p => p.group === g.id).length : 0;
    const del = g ? h('button', 'btn danger small', '이 묶음 지우기') : null;
    if (del) {
      del.type = 'button';
      del.disabled = n > 0;
      del.title = n ? `안의 ${B.noun}${eul(B.noun)} 지우거나 다른 묶음으로 옮긴 뒤 지울 수 있어요` : '';
      del.onclick = () => { db.stock[B.groups] = groups().filter(x => x !== g); dlg.close(); save(); };
    }
    ask(g ? `${B.noun} 묶음 고치기` : `새 ${B.noun} 묶음`, [{ key: 'name', label: '이름', value: g?.name ?? '', required: true, placeholder: B.groupPh },
      { key: 'color', label: '색', type: 'color', value: g?.color || newColor(groups().map(x => x.color)) }], v => {
      const t = g || { id: uid() };
      t.name = v.name.trim();
      if (v.color) t.color = v.color;
      if (!g) groups().push(t);
      save();
    }, del ? [h('p', null, del)] : []);
  }
  // 지우기 (물어보고)
  function remove(p) {
    if (!confirm(`'${p.name}'을(를) 지울까요?${B.removeNote ? ` ${B.removeNote}` : ''}`)) return false;
    B.onRemove?.(p);
    db.stock[B.items] = items().filter(x => x !== p);
    sel = null;
    return true;
  }
  // 새 페이지: 본문은 틀을 채워 바로 쓰기 (이름·메모·묶음은 나중에 화면 위에서 바로 고침)
  function newPage(group) {
    ask(`새 ${B.noun}`, [
      { key: 'name', label: '이름', required: true, placeholder: B.namePh },
      { key: 'group', label: '묶음', type: 'select', options: groups().map(g => [g.id, g.name]), value: group },
      { key: 'memo', label: '한 줄 메모', placeholder: B.memoPh },
    ], v => {
      const last = inGroup(v.group).at(-1);
      const t = { id: uid(), updatedAt: isoToday(), name: v.name.trim(), group: v.group, memo: v.memo.trim() || undefined, note: B.template, order: last ? order(last) + 1 : 0 };
      items().push(t);
      sel = t.id;
      editKey = `${B.editKey}:${t.id}`;
      save();
    });
  }
  return { render, of };
}
