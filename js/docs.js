'use strict';
// ---------- 서류: 양식(forms.js·forms-trip.js)에 내용을 채워 A4로 보고 PDF로 저장 ----------
// 문서 = { id, tpl, year, title, trip, fields: { 칸 이름: 값 }, updatedAt }. 양식은 여러 장(pages)일 수 있음
// 칸에 쓰는 대로 바로 저장만 하고 다시 그리지 않음 (커서 유지)
// 빈 칸에 보이는 값: 문서에 쓴 값 → 출장 정보(data-trip) → 내 정보(data-profile) → 자동 계산(data-auto) → 양식 기본값
let selForm = null, selDoc = null, selTrip = null;
const TRIPS = '__trips';
const form = id => window.FORMS.list.find(f => f.id === id);
const pagesOf = f => f.pages || (f.html ? [f.html] : []);
const tripOf = d => (d?.trip && db.trips.find(t => t.id === d.trip)) || null;
const byRecent = (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '');
const fmtTime = iso => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const countChars = s => window.Intl?.Segmenter ? [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(s)].length : [...s].length;

function renderDocs() {
  const F = window.FORMS;
  if (selForm !== TRIPS && !form(selForm)) selForm = (form(db.docs[0]?.tpl) || F.list[0]).id;
  const list = [];
  // 묶음 순서는 막대를 끌어서 바꿈 (db.docGroupOrder). 색은 원래 순서대로 (고르면 그 색)
  const all = docGroups(), order = db.docGroupOrder || [], rank = gid => (order.includes(gid) ? order.indexOf(gid) : 999 + all.findIndex(g => g.gid === gid));
  const groups = all.filter(g => g.custom || g.gid === 'trip' || F.list.some(f => formGroup(f) === g.gid)).sort((a, b) => rank(a.gid) - rank(b.gid));
  const folded = new Set(layout.docFold || []); // 접은 묶음 (이 브라우저에만)
  groups.forEach(g => {
    const { gid, gname, color } = g, fs = F.list.filter(f => formGroup(f) === gid), shut = folded.has(gid);
    const head = h('div', 'cat-head static drag', h('span', 'caret', shut ? '▸' : '▾'), h('span', 'cat-name', gname), h('span', 'cat-count', String(fs.length)));
    head.style.setProperty('--c', color);
    head.title = '누르면 접기·펴기 · 끌어서 순서 바꾸기 · 길게 누르거나 ✎ 로 이름·색 바꾸기';
    groupEditable(head, () => editDocGroup(g));
    head.onclick = () => { if (shut) folded.delete(gid); else folded.add(gid); layout.docFold = [...folded]; saveLayout(); render(); };
    dragReorder(head, gid, groups.map(x => x.gid), ids => { db.docGroupOrder = ids; save(); });
    list.push(head);
    if (shut) return;
    if (gid === 'trip') {
      const row = h('button', cls('note-row trips-row', selForm === TRIPS && 'on'), h('span', 'note-emoji', '🧳'), h('span', 'note-title', '출장 관리'), h('span', 'note-meta', String(db.trips.length)));
      row.onclick = () => { selForm = TRIPS; render(); };
      list.push(row);
    }
    for (const f of fs) {
      const n = db.docs.filter(d => d.tpl === f.id).length, ready = pagesOf(f).length > 0;
      const row = h('button', cls('note-row', f.id === selForm && 'on', !ready && 'todo'),
        h('span', 'note-emoji', f.emoji), h('span', 'note-title', f.title), h('span', 'note-meta', ready ? (n ? String(n) : '') : f.note ? '안내' : '준비 중'));
      row.onclick = () => { selForm = f.id; selDoc = null; render(); };
      list.push(row);
    }
  });
  const addGroup = h('button', 'cat-new', '+ 묶음');
  addGroup.onclick = () => editDocGroup(null);
  const me = h('button', 'cat-new', '👤 내 정보 (소속·성명·도장·서명)');
  me.onclick = editProfile;
  $('formList').replaceChildren(h('h2', 'note-list-title', '서류'), ...list, addGroup, me);
  const f = form(selForm);
  $('docMain').replaceChildren(...(selForm === TRIPS ? tripPage() : pagesOf(f).length ? docPage(f) : formTodo(f)));
  fitAll(); // 붙인 바로 뒤에 잼 (탭이 안 보이면 건너뜀)
}

// 서류 묶음 = 양식 파일(forms.js)의 묶음 + 직접 만든 묶음. 고친 이름·색, 만든 묶음, 지운 묶음은 db.docGroups = { 묶음 id: { name, color, custom, hidden } }
// 서류를 다른 묶음으로 옮기면 db.docFormGroup = { 양식 id: 묶음 id } (없거나 지운 묶음이면 원래 묶음, 그것도 지웠으면 남은 첫 묶음)
function docGroups() {
  const own = db.docGroups || {};
  return [...window.FORMS.groups.map(([gid, gname]) => ({ gid, gname })), ...Object.keys(own).filter(gid => own[gid].custom).map(gid => ({ gid, gname: '', custom: true }))]
    .map((g, gi) => ({ ...g, gname: own[g.gid]?.name || g.gname, color: own[g.gid]?.color || PALETTE[gi % PALETTE.length] }))
    .filter(g => !own[g.gid]?.hidden);
}
const formGroup = f => {
  const gs = docGroups(), ok = gid => gs.some(x => x.gid === gid), g = db.docFormGroup?.[f.id];
  return ok(g) ? g : ok(f.group) ? f.group : gs[0]?.gid;
};
const moveForm = (f, gid) => { db.docFormGroup = { ...db.docFormGroup, [f.id]: gid }; if (gid === f.group) delete db.docFormGroup[f.id]; };
function editDocGroup(g) {
  let extra = [h('p', 'hint', '서류를 다른 묶음으로 옮기려면 서류 화면 위의 묶음 칸에서 골라요.')];
  if (g) { // 지우기: 양식은 못 지우니 안의 서류는 고른 묶음으로 옮김. 출장 묶음은 출장 관리가 있어서 못 지움
    const fs = window.FORMS.list.filter(f => formGroup(f) === g.gid), others = docGroups().filter(x => x.gid !== g.gid);
    const to = h('select', 'note-cat', others.map(x => { const o = h('option', null, x.gname); o.value = x.gid; o.selected = x.gid === 'etc'; return o; }));
    const del = h('button', 'btn danger small', '이 묶음 지우기');
    del.type = 'button';
    del.disabled = g.gid === 'trip' || (fs.length > 0 && !others.length);
    del.title = g.gid === 'trip' ? '출장 관리가 들어 있어서 지울 수 없어요' : '';
    del.onclick = () => {
      const target = to.selectedOptions[0]?.text;
      if (!confirm(`'${g.gname}' 묶음을 지울까요?${fs.length ? `\n안의 서류 ${fs.length}개는 '${target}' 묶음으로 옮겨요.` : ''}`)) return;
      for (const f of fs) moveForm(f, to.value);
      if (g.custom) delete db.docGroups[g.gid];
      else db.docGroups = { ...db.docGroups, [g.gid]: { ...db.docGroups?.[g.gid], hidden: true } };
      dlg.close();
      save();
    };
    extra.push(h('p', null, del, fs.length && others.length ? [` 안의 서류 ${fs.length}개는 `, to, ' 묶음으로'] : null));
  } else extra = [h('p', 'hint', '만든 뒤 서류 화면 위의 묶음 칸에서 이 묶음을 고르면 서류가 옮겨져요.')];
  const color = g?.color || newColor(docGroups().map(x => x.color));
  ask(g ? '서류 묶음' : '새 서류 묶음', [{ key: 'name', label: '이름', value: g?.gname ?? '', required: true },
    { key: 'color', label: '색', type: 'color', value: color }], v => {
    const gid = g?.gid || uid();
    db.docGroups = { ...db.docGroups, [gid]: { ...db.docGroups?.[gid], name: v.name.trim(), color: v.color || color, ...(g ? null : { custom: true }) } };
    save();
  }, extra);
}
function formGroupSelect(f) {
  const sel = h('select', 'note-cat', docGroups().map(g => { const o = h('option', null, g.gname); o.value = g.gid; o.selected = g.gid === formGroup(f); return o; }));
  sel.title = '묶음 옮기기';
  sel.onchange = () => { moveForm(f, sel.value); save(); };
  return sel;
}

function formTodo(f) {
  return [h('div', 'panel todo-card',
    h('div', 'note-head', h('span', 'todo-emoji', f.emoji), h('h2', null, f.title), h('span', 'tag', f.note ? '안내' : '준비 중'), formGroupSelect(f)),
    h('p', null, f.note || '아직 양식을 옮기지 않았어요. 원본을 보고 HTML 양식으로 옮기면, 여기서 내용을 채우고 A4 그대로 PDF로 저장할 수 있어요.'),
    h('div', 'hint', '원본 파일'), h('code', 'src-path', f.src))];
}

function docPage(f) {
  const docs = db.docs.filter(d => d.tpl === f.id).sort((a, b) => (b.year || 0) - (a.year || 0) || byRecent(a, b));
  if (!docs.some(d => d.id === selDoc)) selDoc = docs[0]?.id ?? null;
  const d = docs.find(x => x.id === selDoc);
  const add = h('button', 'btn small', '+ 새로 만들기');
  add.onclick = () => newDoc(f, docs);
  const bar = h('div', 'doc-bar', docs.map(x => {
    const b = h('button', cls('doc-chip', x === d && 'on'), tripOf(x)?.title ?? x.title);
    b.onclick = () => { selDoc = x.id; render(); };
    return b;
  }), add, h('span', 'spacer'), formGroupSelect(f));
  if (!d) return [bar, h('p', 'hint', '‘+ 새로 만들기’로 문서를 만들어요.')];
  const trip = tripOf(d);
  const back = trip ? h('button', 'btn small', `← 출장: ${trip.title}`) : null;
  if (back) back.onclick = () => { selForm = TRIPS; selTrip = trip.id; render(); };
  const print = h('button', 'btn primary', '🖨 인쇄 / PDF 저장');
  print.onclick = () => printDoc(f, d);
  const rename = h('button', 'btn small', '이름 바꾸기');
  rename.onclick = () => ask('문서 이름', [{ key: 'title', label: '이름', value: d.title, required: true }], v => { d.title = v.title.trim(); save(); });
  const del = h('button', 'btn danger small', '문서 지우기');
  del.onclick = () => { if (confirm(`'${d.title}'을(를) 지울까요?`)) { db.docs = db.docs.filter(x => x !== d); selDoc = null; save(); } };
  const fit = h('span', 'fit');
  fit.id = 'fitStatus';
  fit.hidden = true;
  const status = h('span', 'hint', d.updatedAt ? `자동 저장됨 · ${fmtTime(d.updatedAt)}` : '쓰는 대로 자동 저장돼요');
  status.id = 'docStatus';
  const n = f.repeat ? repN(d, f.repeat) : 1; // 품목마다 한 쪽씩
  const sheets = Array.from({ length: n }, (_, i) => pagesOf(f).map(html => {
    const paper = h('div', cls('paper', f.paper)); // f.paper: 종이 모양 (예: letter = 레터헤드 배경)
    paper.innerHTML = `<div class="paper-in">${html.replaceAll('{year}', d.year ?? '')}</div>`;
    if (f.repeat) for (const el of paper.querySelectorAll('[data-f]:not([data-all])')) { el.dataset.base = el.dataset.f; el.dataset.f = `${f.repeat}${i + 1}:${el.dataset.f}`; }
    expandRows(paper, d);
    return paper;
  }));
  const papers = sheets.flat();
  fillPaper(papers, d, f);
  let addItem = null, wrap = papers;
  if (f.repeat) {
    addItem = h('button', 'btn small', `+ ${f.repeat} 추가`);
    addItem.onclick = () => { d.fields['#' + f.repeat] = n + 1; d.updatedAt = new Date().toISOString(); save(); document.querySelectorAll('#docMain .paper')[n]?.scrollIntoView({ behavior: 'smooth' }); };
    wrap = sheets.flatMap((ps, i) => {
      const dup = h('button', 'btn small', '복사해서 바로 뒤에');
      dup.onclick = () => repEdit(d, f.repeat, i + 1, true);
      const drop = h('button', 'btn danger small', `이 ${f.repeat} 빼기`);
      drop.disabled = n < 2;
      drop.onclick = () => repEdit(d, f.repeat, i + 1, false);
      return [h('div', 'paper-tag', h('b', null, `${f.repeat} ${i + 1}`), h('span', 'hint', `/ ${n}`), dup, drop), ...ps];
    });
  }
  return [bar, h('div', 'doc-bar doc-tools', back, print, addItem, rename, del, fit, status, h('span', 'hint', f.hint || (trip ? '노란 칸을 눌러 써요 · 출장 정보는 다른 서류에도 같이 들어가요' : '노란 칸을 눌러 바로 써요'))),
    h('div', 'paper-wrap', wrap)];
}

// 되풀이 (품목 쪽·표 줄): i번째 칸 이름 = `${tag}${i}:${이름}`, 개수 = fields['#' + tag]
const repN = (d, tag, min = 1) => Math.max(min, +d.fields['#' + tag] || 0);
function repEdit(d, tag, k, dup) { // dup = k번째를 복사해 바로 뒤에 끼움, 아니면 k번째를 빼고 뒤를 당김
  const mine = key => key.startsWith(tag) && key.slice(tag.length).match(/^(\d+):(.*)$/s);
  if (!dup && Object.entries(d.fields).some(([key, v]) => +mine(key)?.[1] === k && String(v).trim()) && !confirm(`${tag} ${k}의 내용을 뺄까요?`)) return;
  const out = {};
  for (const [key, v] of Object.entries(d.fields)) {
    const m = mine(key);
    if (!m) { out[key] = v; continue; }
    const i = +m[1], at = j => `${tag}${j}:${m[2]}`;
    if (dup) { out[at(i > k ? i + 1 : i)] = v; if (i === k) out[at(k + 1)] = v; }
    else if (i !== k) out[at(i > k ? i - 1 : i)] = v;
  }
  out['#' + tag] = repN(d, tag) + (dup ? 1 : -1);
  d.fields = out;
  d.updatedAt = new Date().toISOString();
  save();
}
// <tr data-rows="세부규격" data-min="4"> → 줄 수만큼 복제. 줄 끝 × 로 빼고, 표 아래 버튼으로 늘림 (둘 다 인쇄엔 안 나옴)
function expandRows(paper, d) {
  for (const tr of paper.querySelectorAll('tr[data-rows]')) {
    const tag = tr.dataset.rows, rows = repN(d, tag, +tr.dataset.min || 1), table = tr.closest('table');
    const more = h('button', 'f-ctl', `+ ${tag} 줄 추가`);
    more.onclick = () => { d.fields['#' + tag] = rows + 1; d.updatedAt = new Date().toISOString(); save(); };
    table.after(more);
    for (const el of paper.querySelectorAll(`[data-span="${tag}"]`)) el.rowSpan = rows + (+el.dataset.spanPlus || 0); // 옆 칸(예: '참석자')도 줄 수만큼
    tr.replaceWith(...Array.from({ length: rows }, (_, r) => {
      const row = tr.cloneNode(true);
      row.removeAttribute('data-rows');
      for (const el of row.querySelectorAll('[data-f]')) el.dataset.f = `${tag}${r + 1}:${el.dataset.f}`;
      for (const el of row.querySelectorAll('[data-n]')) el.textContent = r + 1;
      const x = h('button', 'row-x', '×');
      x.title = `${r + 1}번 줄 빼기`;
      x.onclick = () => repEdit(d, tag, r + 1, false);
      row.lastElementChild.append(x);
      return row;
    }));
  }
}

function fillPaper(papers, d, f) {
  const prof = db.profile, trip = tripOf(d);
  const shared = el => el.hasAttribute('data-trip') && trip;
  const stored = el => d.fields[el.dataset.f] ?? (shared(el) ? trip.fields[el.dataset.f] : undefined);
  const valueOf = el => {
    const s = stored(el);
    if (s != null && s !== '') return s;
    if (el.dataset.profile && prof[el.dataset.profile]) return prof[el.dataset.profile];
    const a = el.dataset.auto ? autoValue(el.dataset.auto, d, trip) : '';
    return a || f.defaults?.[el.dataset.base ?? el.dataset.f];
  };
  const show = (el, v) => {
    if (el.classList.contains('choice')) return renderChoice(el);
    if (v == null) return; // 양식에 적힌 기본 글(예: 연도)을 그대로
    if (el.tagName === 'INPUT') el.value = v; else el.innerText = v;
  };
  // 자동 계산 칸은 직접 고치기 전까지 다른 칸·출장 정보에 따라 다시 계산
  const refreshAutos = () => {
    for (const el of all) if (el.dataset.auto && el !== document.activeElement && (stored(el) == null || stored(el) === '')) show(el, valueOf(el) ?? '');
  };
  const write = (el, v) => {
    const k = el.dataset.f;
    if (shared(el)) { trip.fields[k] = v; delete d.fields[k]; } else d.fields[k] = v;
    for (const o of all) if (o !== el && o.dataset.f === k) show(o, v); // 모든 품목 쪽에 같이 들어가는 칸
    d.updatedAt = new Date().toISOString();
    persist();
    $('docStatus').textContent = `자동 저장됨 · ${fmtTime(d.updatedAt)}`;
    refreshAutos();
    fitAll();
  };
  const renderChoice = el => {
    const opts = el.dataset.options.split('|'), multi = el.hasAttribute('data-multi'), paren = el.hasAttribute('data-paren');
    const cur = String(valueOf(el) || '').split('|').filter(Boolean);
    el.replaceChildren(...opts.flatMap((o, i) => {
      const on = cur.includes(o), b = h('span', cls('opt', on && 'on'), paren ? `${o}(${on ? '○' : '  '})` : `${on ? '☑' : '□'} ${o}`);
      b.onclick = () => { write(el, (multi ? (on ? cur.filter(x => x !== o) : [...cur, o]) : on ? [] : [o]).join('|')); renderChoice(el); };
      return paren && i ? [', ', b] : [b];
    }));
  };
  const all = papers.flatMap(p => [...p.querySelectorAll('[data-f]')]);
  for (const el of all) {
    show(el, valueOf(el));
    if (el.classList.contains('choice')) continue;
    if (el.tagName === 'INPUT') el.autocomplete = 'off';
    else try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
    el.addEventListener('input', () => write(el, el.tagName === 'INPUT' ? el.value : el.innerText.replace(/\n$/, '')));
  }
  for (const p of papers) {
    for (const el of p.querySelectorAll('[data-count]')) { // 글자 수 세기 (예: 300자 이상)
      const need = +el.dataset.count, out = h('span', 'f-count');
      const update = () => {
        const n = countChars(el.innerText.replace(/\n$/, ''));
        out.textContent = `현재 ${n} / ${need}자 · ${n < need ? '부족' : '적정'}`;
        out.className = cls('f-count', n < need ? 'warn' : 'ok');
      };
      el.addEventListener('input', update);
      el.after(h('div', 'f-counter', h('span', null, `작성 기준: ${need}자 미만 부족 / ${need}자 이상 적정`), out));
      update();
    }
    const img = (src, alt) => Object.assign(h('img', 'stamp'), { src, alt });
    for (const el of p.querySelectorAll('[data-stamp]')) el.replaceChildren(prof.stamp ? img(prof.stamp, '(인)') : h('span', 'stamp-txt', '(인)'));
    for (const el of p.querySelectorAll('[data-sign]')) el.replaceChildren(prof.sign ? img(prof.sign, '(서명)') : h('span', 'stamp-txt', '(서명)'));
  }
}

// 자동 계산 값 (출장 날짜·출장국·내 정보 등). 계산할 게 없으면 '' → 빈 칸 안내 글이 보임
function autoValue(kind, d, trip) {
  const p = db.profile, tf = trip?.fields || {}, now = new Date();
  const ymd = s => (s ? s.split('-').map(Number) : null);
  const A = ymd(trip?.from), B = ymd(trip?.to);
  const days = A && B ? Math.round((Date.UTC(B[0], B[1] - 1, B[2]) - Date.UTC(A[0], A[1] - 1, A[2])) / 864e5) + 1 : 0;
  const num = k => +String(d.fields[k] ?? '').replace(/[^\d.-]/g, '') || 0;
  if (kind.startsWith('count:')) { // count:참석자:성명 = 성명이 적힌 참석자 줄 수
    const [, tag, name] = kind.split(':'), re = new RegExp(`^${tag}\\d+:${name}$`);
    const n = Object.entries(d.fields).filter(([k, v]) => re.test(k) && String(v).trim()).length;
    return n ? String(n) : '';
  }
  switch (kind) {
    case 'period-ko': return days ? `${A[0]}년 ${A[1]}월 ${A[2]}일 – ${B[0]}년 ${B[1]}월 ${B[2]}일 (${days}일간)` : '';
    case 'period-dot': return days ? `${A[0]}. ${A[1]}. ${A[2]}. ∼ ${B[0]}. ${B[1]}. ${B[2]}. (${days}일간)` : '';
    case 'period-nights': return days ? `${A[0]}년 ${A[1]}월 ${A[2]}일 - ${B[0]}년 ${B[1]}월 ${B[2]}일 (${days - 1}박 ${days}일)` : '';
    case 'period-md': return days ? `${A[1]}.${A[2]}~${B[1]}.${B[2]}` : '';
    case 'country': return (tf['출장국'] || '').replace(/\s*\(.*\)\s*$/, '');
    case 'country-org': return tf['출장국'] ? tf['출장국'] + (tf['방문기관'] ? ` [방문(파견)기관 : ${tf['방문기관']}]` : '') : '';
    case 'title': return tf['학술회의명'] || trip?.title || '';
    case 'grant': { const g = trip?.fund && grant(trip.fund); return g ? g.full || g.name : ''; }
    case 'today-ko': return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
    case 'today-dot': return `${now.getFullYear()}. ${now.getMonth() + 1}. ${now.getDate()}.`;
    case 'today-us': return `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`; // 영문 레터 MM/DD/YYYY
    case 'rank-name': return [p.rank, p.name].filter(Boolean).join(' ');
    case 'age': { // 출발일 기준 만 나이
      const b = ymd(p.birth), r = A || [now.getFullYear(), now.getMonth() + 1, now.getDate()];
      if (!b) return '';
      return String(r[0] - b[0] - (r[1] < b[1] || (r[1] === b[1] && r[2] < b[2]) ? 1 : 0));
    }
    case 'mileage-total':
      if (!['기존 마일리지', '누적 마일리지', '사용 마일리지'].some(k => d.fields[k])) return '';
      return `${(num('기존 마일리지') + num('누적 마일리지') - num('사용 마일리지')).toLocaleString('ko-KR')}마일`;
  }
  return '';
}

// A4 한 장 맞추기: 화면과 인쇄 여백이 같으니 화면에서 잰 내용 높이로 판단.
// 넘치면 인쇄할 때만 그 비율로 줄임 (--print-zoom). 글자 수 표시줄은 인쇄에 안 나오니 빼고 잼
const MM = 96 / 25.4;
function fitPaper(paper) {
  const inner = paper.querySelector('.paper-in');
  if (!inner || !inner.offsetHeight) return null; // 탭이 안 보이면 못 잼
  const cs = getComputedStyle(paper), pageH = 297 * MM - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom); // 종이마다 여백이 다를 수 있음 (레터)
  const skip = [...inner.querySelectorAll('.f-counter, .f-ctl')].reduce((a, el) => a + el.offsetHeight + 6, 0);
  const need = inner.offsetHeight - skip, zoom = need > pageH ? Math.floor(pageH / need * 1000) / 1000 : 1;
  paper.style.setProperty('--print-zoom', zoom);
  paper.classList.toggle('over', zoom < 1);
  return zoom;
}
// 넘치는 장이 있을 때만 위에 알림 (다 들어가면 아무것도 안 보임)
function fitAll() {
  const papers = [...document.querySelectorAll('#docMain .paper')], st = $('fitStatus');
  const over = papers.map((p, i) => [fitPaper(p), i]).filter(([z]) => z != null && z < 1);
  if (!st) return;
  st.hidden = !over.length;
  if (!over.length) return;
  const min = Math.min(...over.map(([z]) => z));
  st.textContent = `${papers.length > 1 ? `${over.map(([, i]) => i + 1).join('·')}쪽이` : '한 장이'} 넘쳐서 인쇄 때 ${Math.round(min * 100)}%로 줄여 맞춰요`;
  st.className = cls('fit', min < 0.85 ? 'bad' : 'warn');
  st.title = min < 0.85 ? '많이 줄어들어 글씨가 작아져요. 내용을 조금 줄이는 게 좋아요.' : '';
}

// 새 문서. 출장 서류면 어느 출장인지 고르고, carry 규칙(예: 지난 총 마일리지 → 기존 마일리지)을 적용
function makeDoc(f, { year = null, trip = null, title = '', src = null } = {}) {
  const t = trip ? db.trips.find(x => x.id === trip) : null;
  const fields = src ? structuredClone(src.fields) : {};
  if (src?.year && year) for (const k in fields) if (fields[k] === String(src.year)) fields[k] = String(year); // 예전 연도만 적힌 칸은 새 연도로
  if (f.carry) {
    const prev = db.docs.filter(x => x.tpl === f.id).sort(byRecent)[0];
    if (prev) for (const [to, from] of Object.entries(f.carry)) if (prev.fields[from] && !fields[to]) fields[to] = prev.fields[from];
  }
  const y = year ?? (t?.from ? +t.from.slice(0, 4) : TODAY.getFullYear());
  const d = { id: uid(), tpl: f.id, year: y, trip: t?.id || null, fields, updatedAt: new Date().toISOString(),
    title: title || (t ? `${t.title} — ${f.title}` : f.yearly ? `${y}학년도 ${f.title}` : `${f.title} ${mDot(NOW)}`) };
  db.docs.push(d);
  return d;
}
function newDoc(f, docs) {
  const y = TODAY.getFullYear();
  const trips = [...db.trips].sort((a, b) => (b.from || '').localeCompare(a.from || ''));
  const tripOpts = trips.map(t => [t.id, `${t.title}${t.from ? ` (${t.from.slice(0, 7).replace('-', '.')})` : ''}`]);
  ask(`${f.title} — 새 문서`, [
    f.yearly ? { key: 'year', label: '연도', type: 'number', value: docs.length ? Math.max(...docs.map(x => x.year || 0)) + 1 : y, required: true } : null,
    f.trip ? { key: 'trip', label: '어느 출장', type: 'select', options: f.trip === 'optional' ? [['', '출장 없이'], ...tripOpts] : [...tripOpts, ['', '출장 없이']], value: f.trip === 'optional' ? '' : trips[0]?.id ?? '' } : null,
    { key: 'title', label: '이름 (비우면 자동)', placeholder: f.yearly ? `예: ${y}학년도 ${f.title}` : f.trip ? '출장 이름 — 서류 이름' : `${f.title} ${mDot(NOW)}` },
    docs.length ? { key: 'copy', label: '내용 가져오기', type: 'select', options: [['', '빈 양식'], ...docs.map(x => [x.id, `${tripOf(x)?.title ?? x.title} 내용 복사`])], value: f.yearly ? docs[0].id : '' } : null,
  ].filter(Boolean), v => {
    const d = makeDoc(f, { year: f.yearly ? +v.year : null, trip: v.trip || null, title: v.title.trim(), src: docs.find(x => x.id === v.copy) });
    selDoc = d.id;
    save();
  });
}

// PDF 저장: 브라우저 인쇄 창에서 'PDF로 저장'. 파일 이름은 양식의 file 규칙대로 제안
function printDoc(f, d) {
  const read = k => { const el = document.querySelector(`.paper [data-f="${CSS.escape(k)}"], .paper [data-base="${CSS.escape(k)}"]`); return el ? (el.tagName === 'INPUT' ? el.value : el.innerText) : ''; };
  const n = f.repeat ? repN(d, f.repeat) : 1; // 품목이 여럿이면 첫 품목 이름 뒤에 '외 N종'
  const name = ((f.file || d.title).replaceAll('{year}', d.year ?? '').replace(/\{([^}]+)\}/g, (_, k) => read(k).trim()) + (n > 1 ? ` 외 ${n - 1}종` : ''))
    .replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const old = document.title;
  document.title = name || d.title;
  fitAll();
  window.print();
  setTimeout(() => { document.title = old; }, 1000);
}

// ---------- 출장 관리: 출장 하나 = 기본 정보 + 체크리스트(서류는 바로 만들기·열기) ----------
function tripPage() {
  const trips = [...db.trips].sort((a, b) => (b.from || '').localeCompare(a.from || ''));
  if (!trips.some(t => t.id === selTrip)) selTrip = trips[0]?.id ?? null;
  const add = h('button', 'btn small', '+ 새 출장');
  add.onclick = newTrip;
  const bar = h('div', 'doc-bar', trips.map(t => {
    const b = h('button', cls('doc-chip', t.id === selTrip && 'on'), t.title, t.from ? h('small', null, ` ${t.from.slice(2, 7).replace('-', '.')}`) : null);
    b.onclick = () => { selTrip = t.id; render(); };
    return b;
  }), add);
  const t = trips.find(x => x.id === selTrip);
  if (!t) return [bar, h('p', 'hint', '‘+ 새 출장’으로 시작해요. 기본 정보를 한 번 적으면 계획서·귀국신고서 등에 자동으로 들어가요.')];
  return [bar, tripInfo(t), ...tripSteps(t)];
}

function tripInfo(t) {
  const tf = t.fields;
  const input = (label, value, set, type = 'text', wide = false) => {
    const i = h('input');
    i.type = type;
    i.value = value ?? '';
    i.onchange = () => { set(i.value.trim()); save(); };
    return h('label', cls('field', wide && 'wide'), label, i);
  };
  const select = (label, opts, value, set) => {
    const s = h('select', null, opts.map(([v, l]) => { const o = h('option', null, l); o.value = v; o.selected = v === value; return o; }));
    s.onchange = () => { set(s.value); save(); };
    return h('label', 'field', label, s);
  };
  const days = t.from && t.to ? Math.round((new Date(t.to) - new Date(t.from)) / 864e5) + 1 : 0;
  const del = h('button', 'btn danger small', '출장 지우기');
  del.onclick = () => {
    const n = db.docs.filter(d => d.trip === t.id).length;
    if (!confirm(`'${t.title}'을(를) 지울까요?${n ? ` 이 출장의 서류 ${n}개도 같이 지워져요.` : ''}`)) return;
    db.trips = db.trips.filter(x => x !== t);
    db.docs = db.docs.filter(d => d.trip !== t.id);
    selTrip = null;
    save();
  };
  return h('div', 'panel trip-info',
    h('div', 'panel-head', h('h2', null, '출장 정보'), h('span', 'hint', `${days ? `${days - 1}박 ${days}일 · ` : ''}여기 적은 내용은 아래 서류에 자동으로 들어가요`), h('span', 'spacer'), del),
    h('div', 'trip-grid',
      input('출장 이름', t.title, v => { t.title = v || '출장'; }),
      select('구분', [['국외', '국외'], ['국내', '국내']], t.kind, v => { t.kind = v; }),
      input('출발일', t.from, v => { t.from = v; }, 'date'),
      input('돌아오는 날', t.to, v => { t.to = v; }, 'date'),
      input('출장국 (도시)', tf['출장국'], v => { tf['출장국'] = v; }),
      input('방문기관', tf['방문기관'], v => { tf['방문기관'] = v; }),
      input('학술회의명', tf['학술회의명'], v => { tf['학술회의명'] = v; }),
      select('경비 부담 (재원)', [['', '정하지 않음'], ...sortedGrants().map(g => [g.id, `${g.emoji} ${g.name}`])], t.fund || '', v => { t.fund = v || null; }),
      input('출장 목적', tf['출장 목적'], v => { tf['출장 목적'] = v; }, 'text', true)));
}

function tripSteps(t) {
  t.checks ||= {};
  return window.FORMS.tripSteps.map((s, si) => [s, si]).filter(([s]) => !s.abroad || t.kind !== '국내').map(([s, si]) => {
    const key = ii => `${si}-${ii}`;
    const items = s.items.map((it, ii) => {
      const cb = h('input');
      cb.type = 'checkbox';
      cb.checked = !!t.checks[key(ii)];
      cb.onchange = () => { t.checks[key(ii)] = cb.checked; save(); };
      let action = null;
      if (it.form) {
        const ds = db.docs.filter(d => d.trip === t.id && d.tpl === it.form).sort(byRecent);
        action = h('button', cls('btn small', !ds.length && 'make'), ds.length ? '열기' : '+ 만들기');
        action.title = ds.length ? `수정 ${fmtTime(ds[0].updatedAt)}` : '출장 정보를 채워서 새로 만들어요';
        action.onclick = () => {
          const d = ds[0] || makeDoc(form(it.form), { trip: t.id });
          selForm = it.form;
          selDoc = d.id;
          ds.length ? render() : save();
        };
      }
      return h('div', cls('step-item', cb.checked && 'done'), h('label', 'step-check', cb, h('span', null, it.text, it.sub ? h('small', null, it.sub) : null)), action);
    });
    const done = s.items.filter((_, ii) => t.checks[key(ii)]).length;
    return h('div', 'panel step-panel', h('div', 'panel-head', h('h2', null, s.title), h('span', 'hint', `${done} / ${s.items.length}`)), items);
  });
}

function newTrip() {
  ask('새 출장', [
    { key: 'title', label: '출장 이름 (학회·행사명)', required: true },
    [{ key: 'kind', label: '구분', type: 'select', options: [['국외', '국외'], ['국내', '국내']], value: '국외' },
      { key: 'from', label: '출발일', type: 'date', required: true },
      { key: 'to', label: '돌아오는 날', type: 'date', required: true }],
    { key: 'country', label: '출장국 (도시)', placeholder: '예: 독일(베를린)' },
  ], v => {
    if (v.to < v.from) return alert('돌아오는 날이 출발일보다 빨라요.');
    const t = { id: uid(), title: v.title.trim(), kind: v.kind, from: v.from, to: v.to, fund: null, checks: {},
      fields: { '출장국': v.country.trim(), '학술회의명': v.title.trim() } };
    db.trips.push(t);
    selTrip = t.id;
    selForm = TRIPS;
    save();
  });
}

// ---------- 내 정보 (서류에 미리 채울 값 + 도장·서명 이미지) ----------
function imagePicker(label, current) {
  let value; // undefined = 안 바꿈, '' = 뺌, dataURL = 새 이미지
  const prev = h('div', 'stamp-prev');
  const showPrev = src => prev.replaceChildren(src ? Object.assign(h('img'), { src, alt: label }) : h('span', 'hint', `${label} 없음`));
  showPrev(current);
  const file = h('input');
  file.type = 'file';
  file.accept = 'image/*';
  file.onchange = () => { // 동기화할 때 무겁지 않게 긴 변 400px PNG로 줄임 (투명 배경 유지)
    const f = file.files[0];
    if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
      const k = Math.min(1, 400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      value = c.toDataURL('image/png');
      showPrev(value);
    };
    img.src = url;
  };
  const clear = h('button', 'btn small', '빼기');
  clear.type = 'button';
  clear.onclick = () => { value = ''; file.value = ''; showPrev(null); };
  return { el: h('div', 'field', `${label} 이미지 (투명 PNG 권장)`, file, h('div', 'img-row', prev, clear)), get value() { return value; } };
}
function editProfile() {
  const p = db.profile;
  const stamp = imagePicker('도장', p.stamp), sign = imagePicker('서명', p.sign);
  ask('내 정보', [
    [{ key: 'dept', label: '소속', value: p.dept }, { key: 'rank', label: '직급', value: p.rank }],
    [{ key: 'name', label: '성명', value: p.name }, { key: 'email', label: '이메일', value: p.email }],
    [{ key: 'office', label: '연구실 전화', value: p.office }, { key: 'mobile', label: '핸드폰', value: p.mobile }],
    { key: 'room', label: '연구실 위치 (구매 규격서의 사용 연구소)', value: p.room || '', placeholder: '예: 의과대학 ○호관 ○○○호' },
    [{ key: 'gender', label: '성별 (출장계획서)', type: 'select', options: [['', '—'], ['여', '여'], ['남', '남']], value: p.gender || '' },
      { key: 'birth', label: '생년월일 (만 나이 계산)', type: 'date', value: p.birth || '' }],
    [{ key: 'enName', label: '영문 이름 (레터 보내는 사람)', value: p.enName || '', placeholder: 'Gildong Hong' }, { key: 'enSig', label: '영문 서명 줄 (굵게)', value: p.enSig || '', placeholder: 'Gildong Hong, Ph.D.' }],
    { key: 'enTitle', label: '영문 직함 (여러 줄)', type: 'textarea', value: p.enTitle || '', placeholder: 'Assistant Professor\nDepartment of …\nSchool of Medicine, Kyungpook National University' },
    { key: 'enAddr', label: '영문 주소 (레터 아래)', value: p.enAddr || '' },
  ], v => {
    for (const k of ['dept', 'rank', 'name', 'email', 'office', 'mobile', 'room', 'gender', 'birth', 'enName', 'enSig', 'enTitle', 'enAddr']) p[k] = (v[k] || '').trim();
    if (stamp.value !== undefined) p.stamp = stamp.value || null;
    if (sign.value !== undefined) p.sign = sign.value || null;
    save();
  }, [stamp.el, sign.el, h('p', 'hint', '서류마다 비어 있는 소속·성명·연락처 칸에 미리 채워져요. 도장은 (인), 서명은 (서명) 자리에 들어가요. 로그인하면 내 계정에만 저장돼요.')]);
}
