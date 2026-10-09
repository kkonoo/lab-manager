'use strict';
// ---------- 재원별 예산 (천원) ----------
const CAT_COLOR = { 인건비: '#F08A4B', 연구활동비: '#5B9BEA', 연구재료비: '#2BB39A', '연구시설·장비비': '#9D7BE0', 연구수당: '#E8B10C', 위탁연구개발비: '#F0727A', 국제공동연구개발비: '#D46FB0', 기타: '#8B93A1', 간접비: '#B39B7A', 미지정: '#C9C5BB' };
const catColorOf = k => CAT_COLOR[k] || PALETTE[Math.max(0, db.lineCats.indexOf(k)) % PALETTE.length]; // 새로 만든 세목은 순서대로
const KINDS = ['과제', 'BK21', '기타'];

let usageAll = false; // 재원별 예산 쓰임 패널: 고른 연차 ↔ 전체 연차 합계
function renderBudget() {
  const listBtn = g => {
    const b = h('button', g.id === selGrant ? 'on' : null, h('span', null, g.emoji), h('span', 'gname', g.name), g.annual != null ? h('span', 'kind', fmt(g.annual)) : null);
    b.style.setProperty('--c', g.color);
    b.title = g.annual != null ? annualText(g) : '연 예산 미입력';
    b.onclick = () => { selGrant = g.id; selN = null; render(); };
    return b;
  };
  const items = [];
  const gs = sortedGrants();
  for (const [name] of GROUPS) {
    const grp = gs.filter(g => GROUPS[groupOf(g)][0] === name);
    if (grp.length) items.push(h('div', 'glist-head', name), ...grp.map(listBtn));
  }
  const addBtn = h('button', 'add-grant', '+ 재원 추가');
  addBtn.onclick = () => editGrant(null);
  $('grantList').replaceChildren(...items, h('hr'), addBtn);

  const g = grant(selGrant) || gs[0];
  if (!g) { $('grantDetail').replaceChildren(h('p', 'hint', '재원이 없어요. 왼쪽 ‘+ 재원 추가’로 만들어요.')); return; }
  selGrant = g.id;
  const ps = periods(g);
  if (!ps.some(p => p.n === selN)) selN = (periodAt(g, NOW) || ps.find(p => p.from > NOW) || ps.at(-1))?.n ?? null;
  const edit = h('button', 'btn small', '과제 정보 수정');
  edit.onclick = () => editGrant(g);
  const head = h('div', 'gd-head',
    h('div', 'gd-title', h('span', null, g.emoji), h('span', null, g.full || g.name), edit),
    h('div', 'gd-meta',
      chip(g, roleLabel(g)),
      g.no ? h('span', 'chip', g.no) : null,
      g.start ? h('span', 'chip', `${mDot(g.start)} – ${mDot(g.end)}`) : null,
      g.annual != null ? h('span', 'chip', annualText(g)) : null),
    g.title && g.title !== g.full ? h('div', 'gd-desc', g.title) : null);
  head.style.setProperty('--c', g.color);

  const overview = overviewPanel(g, ps);
  if (!ps.length) { $('grantDetail').replaceChildren(head, overview, etcDetail(g)); return; }
  const pd = ps.find(p => p.n === selN);

  // 쓰임 막대: 인건비 + 세목별. 오른쪽 위 버튼으로 고른 연차 ↔ 전체 연차 합계
  const scope = usageAll ? ps : [pd], sts = scope.map(x => periodStats(g, x));
  const st = Object.fromEntries(['pay', 'postdoc', 'lines', 'indirect', 'spent', 'used'].map(k => [k, sum(sts, x => x[k])]));
  const budgets = scope.map(x => x.budget).filter(b => b != null), budget = budgets.length ? sum(budgets, b => b) : null;
  const parts = [['인건비', st.pay + st.postdoc]];
  const byCat = {};
  for (const x of scope) for (const l of linesOf(g.id, x.n)) byCat[l.cat || '미지정'] = (byCat[l.cat || '미지정'] || 0) + (+l.plan || 0);
  for (const c of [...db.lineCats, '미지정']) if (byCat[c] && c !== '간접비') parts.push([c, byCat[c]]); // 막대 = 직접비 배정 쓰임
  const base = Math.max(budget || 0, st.used) || 1;
  // % = 배정(직접비) 대비 (배정이 없으면 계획 합계 대비)
  const pct = v => { const r = v / (budget || st.used || 1) * 100; return r > 0 && r < 1 ? '<1%' : `${Math.round(r)}%`; };
  const stack = h('div', 'stack', parts.map(([k, v]) => {
    const i = h('i');
    i.style.setProperty('--c', catColorOf(k));
    i.style.width = `${v / base * 100}%`;
    i.title = `${k} ${fmt(v)}천원 (${pct(v)})`;
    return i;
  }));
  const stackLegend = h('div', 'stack-legend', parts.map(([k, v]) => {
    const d = h('span', 'dot');
    d.style.setProperty('--c', catColorOf(k));
    return h('span', null, d, `${k} ${fmt(v)} (${pct(v)})`);
  }), h('span', 'hint', budget ? '% = 배정(직접비) 대비' : '% = 계획 합계 대비 (배정 미입력)'));
  const budgetTxt = budget == null ? '' : ` / 배정 ${fmt(budget)}${budgets.length < scope.length ? ` (배정 넣은 ${budgets.length}개 연차만)` : ''}`;
  const summary = `계획 ${fmt(st.used)}${budgetTxt} · 집행 ${fmt(st.spent)}${st.indirect ? ` · 간접비 계획 ${fmt(st.indirect)}` : ''} (천원)`;
  const toggle = h('button', 'btn small', usageAll ? `${pd.n}차년도만 보기` : '전체 연차 보기');
  toggle.onclick = () => { usageAll = !usageAll; render(); };
  const usage = h('div', 'panel', h('div', 'panel-head', h('h2', null, usageAll ? `전체 연차 쓰임 (${ps[0].n}–${ps.at(-1).n}차년도)` : `${pd.n}차년도 쓰임`),
    h('span', 'hint', `${mDot(scope[0].from)}–${mDot(scope.at(-1).to)} · ${summary}`), h('span', 'spacer'), toggle), stack, stackLegend);

  const two = h('div', 'two', monthsPanel(g, pd));
  two.append(splitter(two, '--two-l', 220), linesPanel(g, pd));
  $('grantDetail').replaceChildren(head, overview, periodTable(g, ps), usage, two);
}

// 과제 개요 = 최종 목표 + 연차별 연구 내용(연차마다 목표·내용). 연차 줄은 과제 기간에서 자동으로 생김
// 편집을 누르면 모든 칸이 글 상자로 바뀜 (글 노트와 같은 문법)
function overviewPanel(g, ps) {
  const key = `ov:${g.id}`, editing = editKey === key, closed = !g.ovOpen && !editing; // 가끔 보니까 처음엔 접어 둠
  const btn = h('button', cls('btn small', editing && 'primary'), editing ? '다 썼어요' : '편집');
  btn.onclick = () => { editKey = editing ? null : key; render(); };
  const fold = h('button', 'fold', closed ? '▸' : '▾');
  fold.title = closed ? '펴기' : '접기';
  fold.onclick = () => { g.ovOpen = !g.ovOpen; save(); };
  const head = h('div', 'panel-head', fold, h('h2', null, '과제 개요'),
    h('span', 'hint', closed ? preview(g.finalGoal) || '최종 목표 · 연차별 연구 내용' : ''),
    h('span', 'spacer'), btn);
  if (closed) {
    for (const el of [head.querySelector('h2'), head.querySelector('.hint')]) { el.style.cursor = 'pointer'; el.onclick = fold.onclick; } // 제목 줄을 눌러도 펼침
    return h('div', 'panel text-panel closed', head);
  }

  // 보기: 글 노트처럼 그림 / 편집: 글 상자 (줄 수만큼 늘어남)
  const field = (text, set, empty) => {
    if (!editing) return text?.trim() ? docView(text, set) : h('p', 'hint ov-empty', empty);
    const ta = h('textarea', 'ov-edit');
    ta.value = text || '';
    ta.placeholder = empty;
    ta.spellcheck = false;
    const grow = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
    ta.oninput = () => { set(ta.value); persist(); grow(); };
    requestAnimationFrame(grow);
    return ta;
  };
  const periodSet = (n, k) => v => { ((g.periods ||= {})[n] ||= {})[k] = v; };
  const goal = h('div', 'ov-sec', h('div', 'ov-label', '최종 목표'),
    field(g.finalGoal, v => { g.finalGoal = v; }, '과제의 최종 목표를 적어 두세요'));
  const years = ps.length ? h('div', 'ov-sec', h('div', 'ov-label', '연차별 연구 내용'),
    h('div', 'ov-grid',
      h('div', 'ov-h', '연차'), h('div', 'ov-h', '목표'), h('div', 'ov-h', '연구 내용'),
      ps.map(pd => {
        const info = g.periods?.[pd.n] || {}, now = between(NOW, pd.from, pd.to);
        return [
          h('div', cls('ov-period', now && 'now'), `${pd.n}차년도`, now ? h('span', 'now-tag', '지금') : null, h('small', null, `${mShort(pd.from)}–${mShort(pd.to)}`)),
          h('div', cls('ov-cell', now && 'now'), field(info.goal, periodSet(pd.n, 'goal'), '목표')),
          h('div', cls('ov-cell', now && 'now'), field(info.content, periodSet(pd.n, 'content'), '연구 내용')),
        ];
      }))) : null;
  return h('div', 'panel text-panel', head, goal, years, editing ? h('p', 'hint', DOC_HINT) : null);
}

// 연차별 예산: 줄을 누르면 아래에 그 연차를 펼침. 배정·계상액은 바로 고침
function periodTable(g, ps) {
  const inp = (pd, key) => {
    const i = h('input', 'inline wide');
    i.type = 'number';
    i.value = pd[key] ?? '';
    i.placeholder = '–';
    i.onclick = e => e.stopPropagation();
    i.onchange = () => setPeriodValue(g, pd.n, key, i.value);
    return i;
  };
  const rows = ps.map(pd => {
    const st = periodStats(g, pd), left = pd.budget != null ? pd.budget - st.used : null;
    const tr = h('tr', cls('prow', pd.n === selN && 'on'),
      h('td', null, `${pd.n}차년도`, between(NOW, pd.from, pd.to) ? h('span', 'now-tag', '지금') : null),
      h('td', 'memo', periodRange(g, pd, ps)),
      h('td', 'r', inp(pd, 'budget')),
      h('td', 'r', inp(pd, 'pay')),
      h('td', cls('r', pd.pay != null && st.pay > pd.pay && 'over'), st.pay ? fmt(st.pay) : '–', st.postdoc ? h('small', null, ` +포닥 ${fmt(st.postdoc)}`) : null),
      h('td', 'r', st.lines ? fmt(st.lines) : '–', st.indirect ? h('small', null, ` +간접비 ${fmt(st.indirect)}`) : null),
      h('td', cls('r', left != null && (left < 0 ? 'over' : 'good')), left == null ? '–' : fmt(left)));
    tr.onclick = () => { selN = pd.n; render(); };
    return tr;
  });
  // + 차년도: 지금 마지막 연차 끝은 그대로 두고 1년 늘림
  const more = h('button', 'btn small', '+ 차년도');
  more.onclick = () => { const last = ps.at(-1); ((g.periods ||= {})[last.n] ||= {}).to = last.to; g.end = mAdd(last.to, 12); save(); };
  return h('div', 'panel ptable-panel', h('div', 'panel-head', h('h2', null, '연차별 예산'),
    h('span', 'hint', '단위 천원 · 줄을 누르면 그 연차를 아래에 펼쳐요 · 기간·배정·계상액은 칸에서 바로 고쳐요'), h('span', 'spacer'), more),
    h('div', 'tbl-wrap', h('table', 'tbl ptable',
      h('thead', null, h('tr', null, h('th', null, '연차'), h('th', null, '기간'), h('th', 'r', '배정 (직접비)'), h('th', 'r', '인건비 계상액'),
        h('th', 'r', '인건비 계획'), h('th', 'r', '세목 계획'), h('th', 'r', '남은 금액'))),
      h('tbody', null, rows))));
}

// 연차 기간 고치기: 시작 월 = 앞 연차의 끝(첫 연차면 과제 시작), 끝 월 = 이 연차의 끝 (뒤 연차들이 따라 움직임, 마지막 연차면 과제 끝)
function periodRange(g, pd, ps) {
  const b = h('button', 'period-btn', `${mDot(pd.from)}–${mDot(pd.to)}`);
  b.title = '눌러서 이 차년도 기간 고치기';
  b.onclick = e => {
    e.stopPropagation();
    const i = ps.indexOf(pd), prev = ps[i - 1], last = i === ps.length - 1;
    ask(`${pd.n}차년도 기간`, [[
      { key: 'from', label: '시작 월', type: 'month', value: pd.from, required: true },
      { key: 'to', label: '끝 월', type: 'month', value: pd.to, required: true }]], v => {
      if (v.to < v.from) return alert('끝 월이 시작 월보다 빠를 수 없어요.');
      if (prev && v.from <= prev.from) return alert(`${prev.n}차년도 시작(${mDot(prev.from)})보다 뒤여야 해요.`);
      g.periods ||= {};
      if (prev) (g.periods[prev.n] ||= {}).to = mAdd(v.from, -1); else g.start = v.from;
      (g.periods[pd.n] ||= {}).to = v.to;
      if (last || v.to > g.end) g.end = v.to;
      save();
    }, [h('p', 'hint', prev ? `시작 월을 바꾸면 ${prev.n}차년도 끝이 같이 바뀌어요. ` : '첫 차년도 시작 월 = 과제 시작 월. ',
      last ? '마지막 차년도라 끝 월 = 과제 끝 월이에요.' : '끝 월을 바꾸면 뒤 차년도들이 그 다음 달부터 차례로 따라와요 (과제 끝 월은 그대로).')]);
  };
  return b;
}

// 연 예산 = 직접비 + 간접비 (예전 저장본은 합계만 있을 수 있음)
const annualText = g => g.annualDirect == null && g.annualIndirect == null ? `연 ${fmt(g.annual)}천원`
  : `연 ${fmt(g.annual)}천원 (직접 ${fmt(g.annualDirect || 0)} · 간접 ${fmt(g.annualIndirect || 0)})`;
function editGrant(g) {
  const isNew = !g;
  const used = new Set(db.grants.map(x => x.color));
  const base = g || { emoji: '📁', name: '', kind: '과제', role: '참여', firstNo: 1 };
  const del = h('button', 'btn danger', '이 재원 지우기');
  del.type = 'button';
  del.onclick = () => {
    const n = db.pays.filter(x => x.grant === g.id).length + db.lines.filter(l => l.grant === g.id).length;
    if (!confirm(`'${g.name}'을(를) 지울까요?${n ? ` 연결된 인건비·예산 ${n}칸도 같이 지워져요.` : ''}`)) return;
    db.grants = db.grants.filter(x => x !== g);
    db.pays = db.pays.filter(x => x.grant !== g.id);
    db.lines = db.lines.filter(l => l.grant !== g.id);
    db.rows = db.rows.filter(r => !r.endsWith(`|${g.id}`));
    dlg.close();
    save();
  };
  ask(isNew ? '재원 추가' : '과제 정보 수정', [
    { key: 'name', label: '짧은 이름', value: base.name, required: true },
    [{ key: 'kind', label: '구분', type: 'select', options: KINDS.map(k => [k, k]), value: base.kind },
      { key: 'role', label: '책임/참여 (과제만)', type: 'select', options: [['책임', '책임'], ['참여', '참여']], value: base.role || '참여' },
      { key: 'emoji', label: '아이콘', value: base.emoji }],
    { key: 'full', label: '사업명', value: base.full, placeholder: '예: 우수연구-신진연구 B' },
    { key: 'title', label: '과제명', value: base.title },
    { key: 'no', label: '과제번호', value: base.no, placeholder: 'RS-2026-…' },
    [{ key: 'start', label: '시작 월', type: 'month', value: base.start },
      { key: 'end', label: '끝 월', type: 'month', value: base.end },
      { key: 'firstNo', label: '첫 연차 번호', type: 'number', value: base.firstNo || 1 }],
    [{ key: 'annualDirect', label: '연 직접비 (천원)', type: 'number', value: base.annualDirect },
      { key: 'annualIndirect', label: '연 간접비 (천원)', type: 'number', value: base.annualIndirect }],
    { key: 'color', label: '색', type: 'color', value: base.color || newColor([...used]) },
  ], v => {
    if (!!v.start !== !!v.end || (v.start && v.end < v.start)) return alert('시작·끝 월은 둘 다 넣고, 끝이 시작보다 늦어야 해요. 기간 없는 재원(장학·수당)이면 둘 다 비워요.');
    const t = g || { id: uid(), color: newColor([...used]), periods: {} };
    if (v.color) t.color = v.color;
    Object.assign(t, {
      name: v.name.trim(), kind: v.kind, role: v.kind === '과제' ? v.role : null, emoji: v.emoji.trim() || '📁',
      full: v.full.trim() || null, title: v.title.trim() || null, no: v.no.trim() || null,
      start: v.start || null, end: v.end || null, firstNo: Math.max(1, Math.round(+v.firstNo) || 1),
    });
    const d = v.annualDirect === '' ? null : +v.annualDirect, i = v.annualIndirect === '' ? null : +v.annualIndirect;
    const legacy = t.annualDirect == null && t.annualIndirect == null; // 합계만 있던 재원: 둘 다 비워 두면 합계는 그대로
    Object.assign(t, { annualDirect: d, annualIndirect: i, annual: d == null && i == null ? (legacy ? t.annual ?? null : null) : (d || 0) + (i || 0) });
    if (isNew) db.grants.push(t);
    selGrant = t.id;
    selN = null;
    save();
  }, isNew ? [] : [
    g.annual != null && g.annualDirect == null && g.annualIndirect == null ? h('p', 'hint', `지금은 연 예산 합계 ${fmt(g.annual)}천원만 있어요. 직접비·간접비로 나눠 넣으면 그 합이 연 예산이 돼요.`) : null,
    h('p', 'hint', '기간·첫 연차 번호를 바꾸면 연차가 다시 계산돼요. 연차별 배정액은 번호를 따라가요.'), del]);
}

function monthsPanel(g, pd) {
  const months = range(pd.from, pd.to);
  const totals = months.map(m => sum(paysOf(g.id, m, m)));
  const max = Math.max(...totals, 1);
  const chart = h('div', 'months', months.map((m, i) => {
    const bar = h('i');
    bar.style.setProperty('--c', g.color);
    bar.style.height = `${totals[i] / max * 80}%`;
    const col = h('div', 'm ' + (m < NOW ? 'past' : m === NOW ? 'now' : 'future'), totals[i] ? fmt(Math.round(totals[i])) : '', bar,
      h('span', null, m.endsWith('-01') || i === 0 ? mShort(m) : `${+m.slice(5)}`));
    col.title = `${mDot(m)} ${fmt(totals[i])}천원`;
    return col;
  }));
  const byPerson = {};
  for (const x of paysOf(g.id, pd.from, pd.to)) (byPerson[x.person] ||= []).push(x);
  const rows = Object.entries(byPerson).map(([pid, xs]) => ({ p: person(pid), xs })).sort((a, b) => sum(b.xs) - sum(a.xs));
  const table = h('table', 'tbl',
    h('thead', null, h('tr', null, h('th', null, '학생'), h('th', null, '기간'), h('th', 'r', '개월'), h('th', 'r', '합계'))),
    h('tbody', null, rows.map(({ p, xs }) => {
      const ms = xs.map(x => x.month).sort();
      return h('tr', null, h('td', null, p.name), h('td', 'memo', `${mShort(ms[0])}–${mShort(ms.at(-1))}`),
        h('td', 'r', new Set(ms).size), h('td', 'r', fmt(sum(xs))));
    })),
    h('tfoot', null, h('tr', null, h('td', null, '합계'), h('td'), h('td'), h('td', 'r', fmt(sum(totals, x => x))))));
  const goPay = h('button', 'btn small', '인건비 표에서 고치기');
  goPay.onclick = () => openPay(pd.from);
  return h('div', 'panel', h('div', 'panel-head', h('h2', null, '월별 학생인건비'), h('span', 'hint', '천원 · 흐린 막대 = 계획')), chart,
    rows.length ? table : h('p', 'hint', '이 연차에 잡힌 인건비가 없어요.'), h('div', null, goPay));
}

// 세목 예산 표: 머리칸 오른쪽 끝을 끌면 열 너비 (처음 끌 때 지금 너비를 다 적어 두고 고정 너비로, layout.lineColW — 이 브라우저에만)
function linesTable(...parts) {
  const heads = [['항목'], ['세목'], ['계획', 'r'], ['집행', 'r'], ['메모'], ['']];
  if (layout.lineColW?.length !== heads.length) delete layout.lineColW; // 열이 바뀐 뒤의 예전 너비는 버림
  const table = h('table', cls('tbl lines', layout.lineColW && 'fixed'));
  const cols = heads.map((_, i) => { const c = h('col'); if (layout.lineColW) c.style.width = `${layout.lineColW[i]}px`; return c; });
  const fit = () => { table.style.width = `${sum(layout.lineColW, w => w)}px`; };
  const ths = heads.map(([t, k], i) => {
    const th = h('th', k || null, t);
    if (i < heads.length - 1) th.append(colGrip(w => {
      if (!layout.lineColW) {
        layout.lineColW = ths.map(x => Math.round(x.getBoundingClientRect().width));
        cols.forEach((c, j) => { c.style.width = `${layout.lineColW[j]}px`; });
        table.classList.add('fixed');
      }
      layout.lineColW[i] = w;
      cols[i].style.width = `${w}px`;
      fit();
    }, saveLayout, 40));
    return th;
  });
  table.append(h('colgroup', null, cols), h('thead', null, h('tr', null, ths)), ...parts);
  if (layout.lineColW) fit();
  return table;
}
function linesPanel(g, pd) {
  const lines = linesOf(g.id, pd.n);
  const sel = (opts, value, onchange, c) => {
    const s = h('select', c, opts.map(([v, l]) => { const o = h('option', null, l); o.value = v; o.selected = v === (value ?? ''); return o; }));
    s.onchange = () => onchange(s.value);
    return s;
  };
  const num = (value, onchange) => {
    const i = h('input', 'inline');
    i.type = 'number';
    i.value = value ?? '';
    i.placeholder = '–';
    i.onchange = () => onchange(i.value === '' ? null : +i.value);
    return i;
  };
  const body = lines.map(l => {
    const del = h('button', 'link-btn', '×');
    del.title = '이 항목 지우기';
    del.onclick = () => { db.lines = db.lines.filter(x => x !== l); save(); };
    // 메모도 바로 고침. 예전 세부 항목(subs)은 보이던 그대로 메모 칸에 넣고, 고치면 메모 하나로 합침
    const memoIn = h('input', 'inline memo-input');
    memoIn.value = [l.subs?.join('·'), l.memo].filter(Boolean).join(' — ');
    memoIn.title = memoIn.value;
    memoIn.onchange = () => { l.memo = memoIn.value.trim() || undefined; l.subs = []; save(); };
    const memo = h('td', 'memo', memoIn);
    const os = ordersOf(l.id), fromOrders = os.length ? h('button', 'from-orders', `+ 주문 ${fmt(sum(os))}`) : null;
    if (fromOrders) { // 재고 탭 주문 기록으로
      fromOrders.title = `${os.map(o => `${o.date} ${o.name} ${fmt(o.amount || 0)}`).join('\n')}\n\n집행 = 직접 적은 값 + 주문 합 (${fmt(lineSpent(l))})`;
      fromOrders.onclick = () => { stockView = 'orders'; setTab('stock'); };
    }
    const name = h('input', 'inline name'); // 항목 이름도 바로 고침
    name.value = l.name;
    name.onchange = () => { l.name = name.value.trim() || l.name; save(); };
    // ≡ 를 끌어 다른 줄 위쪽·아래쪽 절반에 놓으면 그 앞·뒤로 (db.lines 순서 = 보이는 순서)
    const move = touchHandle(h('span', 'line-move', '≡'));
    move.draggable = true;
    move.title = '끌어서 순서 바꾸기';
    const tr = h('tr', null,
      h('td', 'line-name', name, move),
      h('td', null, sel([['', '세목 ?'], ...db.lineCats.map(c => [c, c])], l.cat, v => { l.cat = v || null; save(); }, l.cat ? null : 'no-cat')),
      h('td', 'r', num(l.plan, v => { l.plan = v; save(); })),
      h('td', 'r', num(l.spent, v => { l.spent = v; save(); }), fromOrders),
      memo, h('td', null, del));
    move.ondragstart = e => { e.dataTransfer.setData('text/x-line', l.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setDragImage(tr, 16, 16); };
    const side = e => (e.clientY - tr.getBoundingClientRect().top > tr.offsetHeight / 2 ? 'after' : 'before');
    const clear = () => tr.classList.remove('drop-before', 'drop-after');
    tr.ondragover = e => {
      if (!e.dataTransfer.types.includes('text/x-line')) return;
      e.preventDefault();
      tr.classList.toggle('drop-before', side(e) === 'before');
      tr.classList.toggle('drop-after', side(e) === 'after');
    };
    tr.ondragleave = clear;
    tr.ondrop = e => {
      e.preventDefault();
      clear();
      const from = lineOf(e.dataTransfer.getData('text/x-line'));
      if (!from || from === l) return;
      db.lines = db.lines.filter(x => x !== from);
      db.lines.splice(db.lines.indexOf(l) + (side(e) === 'after' ? 1 : 0), 0, from);
      save();
    };
    return tr;
  });
  const add = h('button', 'btn small', '+ 항목');
  add.onclick = () => ask(`${g.name} ${pd.n}차년도 — 예산 항목`, [
    { key: 'name', label: '항목', required: true, placeholder: '예: 해외학회' },
    { key: 'cat', label: '세목', type: 'select', options: [['', '나중에'], ...db.lineCats.map(c => [c, c])], value: '연구활동비' },
    { key: 'plan', label: '계획액 (천원)', type: 'number', required: true },
    { key: 'memo', label: '메모' },
  ], v => { db.lines.push({ id: uid(), grant: g.id, n: pd.n, name: v.name.trim(), cat: v.cat || null, subs: [], plan: +v.plan, memo: v.memo }); save(); });
  return h('div', 'panel', h('div', 'panel-head', h('h2', null, '세목 예산'), h('span', 'hint', '천원 · 항목·계획·집행·메모는 바로 고쳐져요 · 집행엔 재고 탭 주문이 더해져요 · ≡ 를 끌면 순서, 머리칸 끝을 끌면 열 너비')),
    lines.length ? h('div', 'tbl-wrap', linesTable(
      h('tbody', null, body),
      h('tfoot', null, h('tr', null, h('td', null, '합계'), h('td'), h('td', 'r', fmt(sum(lines, l => l.plan))), h('td', 'r', fmt(sum(lines, lineSpent))), h('td'), h('td')))))
      : h('p', 'hint', '아직 항목이 없어요.'),
    h('div', null, add));
}

function etcDetail(g) {
  const byPerson = {};
  for (const x of db.pays.filter(x => x.grant === g.id)) (byPerson[x.person] ||= []).push(x);
  const rows = Object.entries(byPerson).map(([pid, xs]) => {
    const ms = xs.map(x => x.month).sort();
    return h('tr', null, h('td', null, person(pid).name), h('td', 'memo', `${mShort(ms[0])}–${mShort(ms.at(-1))}`), h('td', 'r', fmt(xs[0].amount)), h('td', 'r', fmt(sum(xs))));
  });
  return h('div', 'panel etc-panel', h('div', 'panel-head', h('h2', null, '지급 내역'), h('span', 'hint', '천원 · 기간 없는 재원은 연차 없이 지급 칸만 모아 봐요')),
    rows.length ? h('table', 'tbl', h('thead', null, h('tr', null, h('th', null, '학생'), h('th', null, '기간'), h('th', 'r', '월액'), h('th', 'r', '합계'))), h('tbody', null, rows))
      : h('p', 'hint', '잡힌 지급이 없어요.'));
}
