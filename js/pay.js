'use strict';
// ---------- 인건비 표 (학기 보기 / 월 보기) — 금액은 만원으로 보여 줌 ----------
// 학생 아래 재원 줄: 그 구간에 인건비가 있거나, 넣어 둔 줄 중 구간에 걸친 재원
function rowsOf(p, first, last) {
  const ids = new Set([...db.pays.filter(x => x.person === p.id && between(x.month, first, last)).map(x => x.grant),
    ...db.rows.filter(r => r.startsWith(`${p.id}|`)).map(r => r.split('|')[1]).filter(id => grant(id) && grantIn(grant(id), first, last))]);
  return sortedGrants().filter(g => ids.has(g.id));
}

function renderPay() {
  for (const b of $('viewSeg').children) b.classList.toggle('on', b.dataset.view === payView);
  const sems = paySems();
  const months = sems.flatMap(semMonths), first = months[0], last = months.at(-1);
  // 재원 칩: 이 구간에 걸친 재원만 (기간 없는 재원은 이 구간에 인건비가 있을 때만), 누르면 그 재원 예산으로
  const inWin = g => (g.start ? grantIn(g, first, last) : db.pays.some(x => x.grant === g.id && between(x.month, first, last)));
  const chips = sortedGrants().filter(inWin).map(g => {
    const c = chip(g);
    c.classList.add('chip-link');
    c.title = `${g.name} 예산 보기`;
    c.onclick = () => openBudget(g.id);
    return c;
  });
  $('legend').replaceChildren(...chips, ...(payView === 'sem' ? [
    h('span', null, '학생 줄 = 월 인건비 · 참여율(인건비 ÷ 기준)'),
    h('span', null, '칸을 누르면 학기 단위로 고쳐요'),
    h('span', null, h('span', 'sw out'), '과제 기간 밖'),
  ] : [
    h('span', null, h('span', 'sw now'), '이번 달'),
    h('span', null, '지난 달 = 실지급 · 이번 달 뒤 = 계획(흐리게)'),
    h('span', null, h('span', 'sw out'), '과제 기간 밖'),
  ]), h('span', null, '표를 끌면 옆으로 넘어가요 · 머리칸 오른쪽 끝을 끌면 열 너비'));

  // 학생: 이 구간에 인건비가 있거나, 아직 인건비가 하나도 없는 새 학생, 또는 아래에서 꺼낸 학생만
  const people = [], hidden = [];
  for (const p of db.people) {
    const xs = db.pays.filter(x => x.person === p.id);
    if (!xs.length || xs.some(x => between(x.month, first, last)) || payShow[p.id] === sems[0]) people.push(p); else hidden.push(p);
  }
  // 다시 그려도 보던 자리 유지. 화면 이동(오늘·경고 보기 등)이 있을 때만 payFocus로 넘김
  const wrap = $('gridWrap'), keep = [wrap.scrollLeft, wrap.scrollTop];
  const table = $('payGrid');
  const nData = payView === 'sem' ? sems.length : months.length;
  table.replaceChildren(gridCols(nData), ...(payView === 'sem' ? semTable(sems, people, nData) : monthTable(sems, months, people, nData)));
  applyColW(table, nData);
  if (payScroll && tab === 'pay') {
    payScroll = false;
    scrollPayTo(payFocus, false);
  } else [wrap.scrollLeft, wrap.scrollTop] = keep;
  updatePayRange();
  $('payFoot').replaceChildren(payView === 'sem' ? '단위: 만원 · 학생 칸은 월액(학기 안에서 달마다 다르면 범위), 맨 아래는 학기 합계(6개월)'
    : '단위: 만원 · 칸을 누르면 금액을 고쳐요. 어느 연차인지는 월만 보고 자동으로 정해져요.');
  if (hidden.length) {
    const b = h('button', 'link-btn', '꺼내기');
    b.onclick = () => showHidden(hidden, sems[0]);
    $('payFoot').append(`  ·  이 구간에 인건비가 없는 학생 ${hidden.length}명 `, b);
  }
}
// 구간 밖 학생을 이 구간 표에 꺼냄 (다시 인건비를 넣으려고). 최근에 받은 학생부터
function showHidden(hidden, s0) {
  const lastPay = p => db.pays.filter(x => x.person === p.id).map(x => x.month).sort().at(-1);
  const opts = hidden.map(p => [p.id, `${p.name} (마지막 ${mDot(lastPay(p))})`, lastPay(p)]).sort((a, b) => b[2].localeCompare(a[2]));
  ask('학생 꺼내기', [{ key: 'pid', label: '이 구간 표에 보일 학생', type: 'select', options: opts, value: opts[0][0] }], v => {
    payShow[v.pid] = s0;
    render();
  });
}

// 열 너비: 이름 열 하나 + 데이터 열(달/학기)은 모두 같은 너비. 보기마다 따로 기억
const SUM_W = 84;
const gridCols = n => h('colgroup', null, h('col', 'c-name'), Array.from({ length: n }, () => h('col', 'c-data')), h('col', 'c-sum'));
function applyColW(table, n) {
  const w = layout.colW[payView];
  table.style.setProperty('--name-w', `${w.name}px`);
  table.style.setProperty('--col-w', `${w.col}px`);
  table.style.width = `${w.name + n * w.col + SUM_W}px`;
  const wrap = $('gridWrap');
  wrap.classList.toggle('can-drag', wrap.scrollWidth > wrap.clientWidth + 1 || wrap.scrollHeight > wrap.clientHeight + 1);
}
const nameGrip = n => colGrip(w => { layout.colW[payView].name = w; applyColW($('payGrid'), n); }, saveLayout, 120);
const dataGrip = n => colGrip(w => { layout.colW[payView].col = w; applyColW($('payGrid'), n); }, saveLayout, payView === 'sem' ? 110 : 44);

// 그 달(학기)의 머리칸이 이름 열 바로 오른쪽에 오게 넘김
function scrollPayTo(month, smooth = true) {
  const wrap = $('gridWrap');
  const th = wrap.querySelector(payView === 'sem' ? `th[data-s="${semOf(month)}"]` : `th[data-m="${month}"]`);
  if (!th) return;
  const left = wrap.scrollLeft + th.getBoundingClientRect().left - wrap.getBoundingClientRect().left - layout.colW[payView].name;
  wrap.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
}
// 위 제목 = 지금 화면에 보이는 기간
function updatePayRange() {
  const wrap = $('gridWrap'), box = wrap.getBoundingClientRect(), from = box.left + layout.colW[payView].name;
  const ths = [...wrap.querySelectorAll(payView === 'sem' ? 'th[data-s]' : 'th[data-m]')].filter(th => {
    const r = th.getBoundingClientRect();
    return r.right > from + 8 && r.left < box.right - 8;
  });
  if (!ths.length) return;
  const a = ths[0].dataset, b = ths.at(-1).dataset;
  $('rangeTitle').textContent = payView === 'sem' ? `${semLabel(a.s)} – ${semLabel(b.s)}` : `${mDot(a.m)} – ${mDot(b.m)}`;
}
let rangeTick = 0;
$('gridWrap').addEventListener('scroll', () => { cancelAnimationFrame(rangeTick); rangeTick = requestAnimationFrame(updatePayRange); });
addEventListener('resize', () => { if (tab === 'pay') applyColW($('payGrid'), $('payGrid').querySelectorAll('col.c-data').length); });

function personNameCell(p, first, last) {
  const td = h('td', 'name', h('span', 'pname', p.name));
  if (payView === 'month') {
    const s = h('span', 'deg-sum', degreeSummary(p, first, last));
    s.title = '과정은 학기 보기에서 학기마다 바꿔요';
    td.append(s);
  }
  const del = h('button', 'link-btn', '삭제');
  del.onclick = () => {
    const n = db.pays.filter(x => x.person === p.id).length;
    const msg = `'${p.name}'을(를) 지울까요?${n ? `\n인건비 기록 ${n}건(지난 달 포함)도 같이 지워져서 연차 예산 계산에서 빠져요.\n졸업했으면 지우지 않아도 인건비가 없는 구간에선 안 보여요.` : ''}`;
    if (confirm(msg)) removePerson(p.id);
  };
  td.append(del);
  return td;
}
// '학사 → 석사(27.03~)'
function degreeSummary(p, first, last) {
  const parts = [];
  for (let s = semOf(first); semStart(s) <= last; s = semAdd(s, 1)) {
    const d = degreeAt(p, semStart(s)) || '과정 미정';
    if (!parts.length || parts.at(-1).d !== d) parts.push({ d, s });
  }
  const known = parts.length > 1 ? parts.filter(x => x.d !== '과정 미정') : parts; // 과정 적기 전 학기는 빼고
  return known.map((x, i) => i ? `${x.d}(${mShort(semStart(x.s))}~)` : x.d).join(' → ');
}
// 재원 줄: 금액을 그 재원 색으로 (CSS --g)
const grantRow = (k, g, ...kids) => { const tr = h('tr', k, ...kids); tr.style.setProperty('--g', g.color); return tr; };
function grantNameCell(g) {
  const dot = h('span', 'dot');
  dot.style.setProperty('--c', g.color);
  return h('td', 'name', dot, g.name);
}
function addRow(p, cols) {
  const add = h('button', 'link-btn', '+ 재원');
  add.onclick = () => addGrantRow(p);
  return h('tr', 'add-row', h('td', 'name', add), Array.from({ length: cols + 1 }, () => h('td')));
}

// 학기 보기: 열 = 학기, 학생 줄에 그 학기 과정·월 인건비·참여율
function summarize(vals) {
  const nz = vals.filter(v => v);
  if (!nz.length) return null;
  return { min: Math.min(...nz), max: Math.max(...nz), n: nz.length, full: nz.length === vals.length };
}
const semText = sm => [sm.min === sm.max ? fmtM(sm.min) : `${fmtM(sm.min)}–${fmtM(sm.max)}`, sm.full ? null : h('span', 'mcount', `${sm.n}개월`)];
const rateText = (sm, rate) => { const a = partRate(sm.min, rate), b = partRate(sm.max, rate); return a === b ? `${a}%` : `${a}–${b}%`; };

function semTable(sems, people, nData) {
  const cur = semOf(NOW), first = semStart(sems[0]), last = semEnd(sems.at(-1));
  const head = h('tr', null, h('th', 'name', '학생 · 재원', nameGrip(nData)),
    sems.map(s => {
      const th = h('th', cls('semcol', s === cur && 'now'), semLabel(s), h('small', null, `${semRange(s)}${s === cur ? ' · 지금' : ''}`), dataGrip(nData));
      th.dataset.s = s;
      return th;
    }),
    h('th', 'sum', '합계', h('small', null, '이 5학기')));
  const body = h('tbody');
  for (const p of people) {
    const cells = sems.map(s => {
      const ms = semMonths(s), sm = summarize(ms.map(m => monthTotal(p.id, m)));
      const deg = degreeAt(p, ms[0]), rate = deg ? ratesAt(ms[0])[deg] : null, own = (p.degrees || {})[s];
      const sel = h('select', cls('degree', !own && 'inherit'), ['', '학사', '석사', '박사', '포닥'].map(d => {
        const o = h('option', null, d || '과정');
        o.value = d;
        o.selected = (deg || '') === d;
        return o;
      }));
      sel.title = own ? `${semLabel(s)} 과정` : deg ? '앞 학기에서 이어받음 — 바꾸면 이 학기부터 적용' : '과정을 고르면 기준 인건비와 비교해요';
      sel.onchange = () => { p.degrees ||= {}; if (sel.value) p.degrees[s] = sel.value; else delete p.degrees[s]; save(); };
      return h('td', cls('semhead-td', s === cur && 'now', sm && rate && sm.max > rate && 'over'),
        h('div', 'semhead', sel, h('span', 'sv', sm ? semText(sm) : '·'), sm && rate ? h('small', 'pr', rateText(sm, rate)) : null));
    });
    const total = sum(db.pays.filter(x => x.person === p.id && between(x.month, first, last)));
    body.append(h('tr', 'p-head', personNameCell(p, first, last), cells, h('td', 'sum', fmtM(total))));
    for (const g of rowsOf(p, first, last)) {
      const gSum = sum(db.pays.filter(x => x.person === p.id && x.grant === g.id && between(x.month, first, last)));
      body.append(grantRow('g-row', g, grantNameCell(g), sems.map(s => semCell(p, g, s)), h('td', 'sum', gSum ? fmtM(gSum) : '')));
    }
    body.append(addRow(p, sems.length));
  }
  const foot = h('tfoot');
  for (const g of sortedGrants()) {
    const xs = paysOf(g.id, first, last);
    if (!xs.length) continue;
    foot.append(grantRow('g-foot', g, grantNameCell(g),
      sems.map(s => { const t = sum(xs.filter(x => between(x.month, semStart(s), semEnd(s)))); return h('td', s === cur ? 'now' : null, t ? fmtM(t) : ''); }),
      h('td', 'sum', fmtM(sum(xs)))));
  }
  const all = db.pays.filter(x => between(x.month, first, last));
  foot.append(h('tr', 'total', h('td', 'name', '학기 합계 (6개월)'),
    sems.map(s => h('td', s === cur ? 'now' : null, fmtM(sum(all.filter(x => between(x.month, semStart(s), semEnd(s))))))),
    h('td', 'sum', fmtM(sum(all)))));
  return [h('thead', null, head), body, foot];
}

function semCell(p, g, s) {
  const ms = semMonths(s), vals = ms.map(m => cellTotal(p.id, g.id, m)), sm = summarize(vals);
  const inside = ms.filter(m => inGrant(g, m));
  const bad = ms.some((m, i) => vals[i] && !inGrant(g, m));
  const td = h('td', cls('cell semc', s === semOf(NOW) && 'now', !sm && 'blank', !inside.length && 'out', bad && 'bad'), sm ? semText(sm) : null);
  const starts = periods(g).filter(pd => between(pd.from, ms[0], ms[5]));
  if (starts.length) {
    td.style.setProperty('--c', g.color);
    td.append(h('span', 'ptag', starts.map(pd => `${pd.n}차 ${+pd.from.slice(5)}월~`).join(' ')));
  }
  const ns = [...new Set(ms.map(m => periodAt(g, m)?.n).filter(Boolean))];
  td.title = bad ? `${g.name} 과제 기간(${mDot(g.start)}–${mDot(g.end)}) 밖에 잡힌 달이 있어요` : ns.length ? `${g.name} ${ns.join('·')}차년도` : g.name;
  td.onclick = e => { e.stopPropagation(); openSemPop(td, p, g, s, sm); };
  return td;
}

// 월 보기: 열 = 달, 위에 학기 띠
function monthTable(sems, months, people, nData) {
  const ss = m => m.endsWith('-03') || m.endsWith('-09'); // 학기 첫 달
  const first = months[0], last = months.at(-1), cur = semOf(NOW);
  const nameTh = h('th', 'name', '학생 · 재원', nameGrip(nData));
  nameTh.rowSpan = 2;
  const sumTh = h('th', 'sum', '합계');
  sumTh.rowSpan = 2;
  const band = h('tr', 'band', nameTh, sems.map(s => {
    const th = h('th', cls('semband ss', s === cur && 'now'), `${semLabel(s)} · ${semRange(s)}`);
    th.colSpan = 6;
    return th;
  }), sumTh);
  const mrow = h('tr', 'mrow', months.map(m => {
    const th = h('th', cls(m === NOW && 'now', ss(m) && 'ss'), mShort(m), h('small', null, m < NOW ? '지급' : m === NOW ? '이번 달' : '계획'), dataGrip(nData));
    th.dataset.m = m;
    return th;
  }));
  const body = h('tbody');
  for (const p of people) {
    const totals = months.map(m => {
      const t = monthTotal(p.id, m), rate = rateAt(p, m);
      const td = h('td', cls(m === NOW && 'now', ss(m) && 'ss', rate && t > rate && 'over'), t ? fmtM(t) : '', t && rate ? h('small', null, `${partRate(t, rate)}%`) : null);
      td.title = rate ? `${degreeAt(p, m)} 기준 ${fmtM(rate)}만원 · 참여율 ${partRate(t, rate)}%` : '과정 미정';
      return td;
    });
    const total = sum(db.pays.filter(x => x.person === p.id && between(x.month, first, last)));
    body.append(h('tr', 'p-head', personNameCell(p, first, last), totals, h('td', 'sum', fmtM(total))));
    for (const g of rowsOf(p, first, last)) {
      const gSum = sum(db.pays.filter(x => x.person === p.id && x.grant === g.id && between(x.month, first, last)));
      body.append(grantRow('g-row', g, grantNameCell(g), months.map(m => monthCell(p, g, m, ss(m))), h('td', 'sum', gSum ? fmtM(gSum) : '')));
    }
    body.append(addRow(p, months.length));
  }
  const foot = h('tfoot');
  for (const g of sortedGrants()) {
    const xs = paysOf(g.id, first, last);
    if (!xs.length) continue;
    foot.append(grantRow('g-foot', g, grantNameCell(g),
      months.map(m => {
        const t = sum(xs.filter(x => x.month === m));
        return h('td', cls(m === NOW && 'now', ss(m) && 'ss', t && !inGrant(g, m) && 'cell out bad'), t ? fmtM(t) : '');
      }),
      h('td', 'sum', fmtM(sum(xs)))));
  }
  const all = db.pays.filter(x => between(x.month, first, last));
  foot.append(h('tr', 'total', h('td', 'name', '전체'),
    months.map(m => h('td', cls(m === NOW && 'now', ss(m) && 'ss'), fmtM(sum(all.filter(x => x.month === m))))),
    h('td', 'sum', fmtM(sum(all)))));
  return [h('thead', null, band, mrow), body, foot];
}

function monthCell(p, g, m, semFirst) {
  const v = cellTotal(p.id, g.id, m);
  const td = h('td', cls('cell', m < NOW ? 'past' : m === NOW ? 'now' : 'future', semFirst && 'ss', !v && 'blank'), v ? fmtM(v) : null);
  const pd = periodAt(g, m);
  if (!inGrant(g, m)) {
    td.classList.add('out');
    td.title = `${g.name} 과제 기간(${mDot(g.start)}–${mDot(g.end)}) 밖`;
    if (v) td.classList.add('bad');
  } else if (pd) {
    td.title = `${g.name} ${pd.n}차년도 (${mDot(pd.from)}–${mDot(pd.to)})`;
    if (pd.from === m) {
      td.classList.add('pstart');
      td.style.setProperty('--c', g.color);
      td.append(h('span', 'ptag', `${pd.n}차`));
    }
  }
  td.onclick = e => { e.stopPropagation(); openMonthPop(td, p, g, m); };
  return td;
}

// 표를 마우스로 끌어서 옆·위아래로 넘기기. 5px 넘게 움직이면 끌기로 보고 칸 클릭은 막음 (터치는 원래 스크롤)
function dragScroll(el) {
  let start = null, moved = false;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('select, input, button')) return;
    start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, id: e.pointerId };
    moved = false;
  });
  el.addEventListener('pointermove', e => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) { moved = true; el.setPointerCapture(start.id); el.classList.add('dragging'); }
    el.scrollLeft = start.left - dx;
    el.scrollTop = start.top - dy;
  });
  const end = () => { start = null; el.classList.remove('dragging'); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('click', e => { if (moved) { e.stopPropagation(); moved = false; } }, true);
}
dragScroll($('gridWrap'));

// ---------- 칸 편집 창 (입력은 만원, 저장은 천원) ----------
let popActions = [], popRate = null, popMonths = [];
// months = 학기 칸에서 고를 달 [{ m, on, off(과제 기간 밖) }] — 비우면 달 고르기 안 보임
function openPop(anchor, title, sub, value, actions, rate, months = []) {
  popActions = actions.filter(Boolean);
  popRate = rate;
  popMonths = months;
  $('popTitle').textContent = title;
  $('popSub').textContent = sub;
  $('popAmount').value = value === '' || value == null ? '' : value / 10;
  updatePopRate();
  $('popMonths').hidden = !months.length;
  $('popMonths').replaceChildren(...months.map(x => {
    const b = h('button', x.on ? 'on' : null, mKo(x.m));
    b.disabled = x.off;
    b.title = x.off ? '과제 기간 밖' : '눌러서 넣기·빼기';
    b.onclick = () => { x.on = !x.on; b.classList.toggle('on', x.on); };
    return b;
  }), months.length ? h('span', 'hint', '달을 눌러 빼거나 넣어요 (예: 10월 시작이면 9월 빼기)') : null);
  $('popBtns').replaceChildren(...popActions.map(a => {
    const b = h('button', cls('btn', a.primary && 'primary', a.danger && 'danger'), a.label);
    b.onclick = () => a.run(popValue());
    return b;
  }));
  const pop = $('cellPop');
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8))}px`;
  pop.style.top = `${r.bottom + 6 + pop.offsetHeight < innerHeight ? r.bottom + 6 : Math.max(8, r.top - pop.offsetHeight - 6)}px`;
  $('popAmount').focus();
  $('popAmount').select();
}
const popValue = () => Math.round(Math.max(0, +$('popAmount').value || 0) * 10); // 천원
function updatePopRate() { $('popRate').textContent = popRate ? `과제 참여율 ${partRate(popValue(), popRate)}%` : ''; }
$('popAmount').addEventListener('input', updatePopRate);
$('popAmount').addEventListener('keydown', e => {
  if (e.key === 'Enter' && popActions[0]) popActions[0].run(popValue());
  if (e.key === 'Escape') $('cellPop').hidden = true;
});
document.addEventListener('mousedown', e => { if (!$('cellPop').hidden && !$('cellPop').contains(e.target)) $('cellPop').hidden = true; });

// 비어 있으면 바로 앞 달 금액을 미리 채움
const prevAmount = (pid, gid, before) => db.pays.filter(x => x.person === pid && x.grant === gid && x.month < before)
  .sort((a, b) => b.month.localeCompare(a.month))[0]?.amount ?? '';

function openMonthPop(td, p, g, m) {
  const pd = periodAt(g, m), v = cellTotal(p.id, g.id, m), rate = rateAt(p, m);
  const semTo = g.start && semEnd(semOf(m)) > g.end ? g.end : semEnd(semOf(m));
  const sub = !inGrant(g, m) ? `⚠ 과제 기간(${mDot(g.start)}–${mDot(g.end)}) 밖이에요`
    : [pd ? `→ ${pd.n}차년도(${mDot(pd.from)}–${mDot(pd.to)})에 들어가요` : '기간 없는 재원 (장학·수당 등)', rate ? `${degreeAt(p, m)} 기준 ${fmtM(rate)}만원` : null].filter(Boolean).join(' · ');
  openPop(td, `${p.name} · ${g.emoji} ${g.name} · ${mDot(m)}`, sub, v || prevAmount(p.id, g.id, m), [
    { label: '이 달만', primary: true, run: x => setMonths(p.id, g.id, [m], x) },
    inGrant(g, m) && semTo > m && { label: `학기 끝까지(~${mShort(semTo)})`, run: x => setMonths(p.id, g.id, range(m, semTo), x) },
    pd && pd.to > m && pd.to !== semTo && { label: `연차 끝까지(~${mShort(pd.to)})`, run: x => setMonths(p.id, g.id, range(m, pd.to), x) },
    v && { label: '지우기', danger: true, run: () => setMonths(p.id, g.id, [m], 0) },
  ], rate);
}

function openSemPop(td, p, g, s, sm) {
  const ms = semMonths(s), inside = ms.filter(m => inGrant(g, m));
  const ns = [...new Set(inside.map(m => periodAt(g, m)?.n).filter(Boolean))];
  const rate = rateAt(p, ms[0]);
  const sub = !inside.length ? `⚠ 과제 기간(${mDot(g.start)}–${mDot(g.end)}) 밖이에요`
    : [inside.length < 6 ? `과제 기간 안의 ${inside.length}개월(${mShort(inside[0])}–${mShort(inside.at(-1))})만 채워요` : `${semRange(s)} 6개월`,
      ns.length ? `${ns.join('·')}차년도` : null, rate ? `${degreeAt(p, ms[0])} 기준 ${fmtM(rate)}만원` : null].filter(Boolean).join(' · ');
  // 이미 잡힌 달이 있으면 그 달만, 없으면 과제 기간 안의 모든 달을 켜 둠
  const has = new Set(ms.filter(m => cellTotal(p.id, g.id, m)));
  const months = ms.map(m => ({ m, off: !inGrant(g, m), on: inGrant(g, m) && (has.size ? has.has(m) : true) }));
  openPop(td, `${p.name} · ${g.emoji} ${g.name} · ${semLabel(s)}`, sub,
    sm ? (sm.min === sm.max ? sm.min : '') : prevAmount(p.id, g.id, ms[0]), [
      inside.length && { label: '이 학기 저장', primary: true, run: x => setMonths(p.id, g.id, ms, x, popMonths.filter(c => c.on).map(c => c.m)) },
      sm && { label: '이 학기 지우기', danger: true, run: () => setMonths(p.id, g.id, ms, 0) },
      { label: '월별로 보기', run: () => { payFocus = semStart(s); setPayView('month'); } },
    ], rate, inside.length ? months : []);
}

// clear 달들을 비우고, fill 달들(기본 = clear 전부)에 월액을 넣음
function setMonths(pid, gid, clear, amount, fill = clear) {
  const set = new Set(clear);
  db.pays = db.pays.filter(x => !(x.person === pid && x.grant === gid && set.has(x.month)));
  if (amount > 0) for (const month of fill) db.pays.push({ person: pid, grant: gid, month, amount });
  if (!db.rows.includes(`${pid}|${gid}`)) db.rows.push(`${pid}|${gid}`); // 다 지워도 줄은 남김
  save();
}

function removePerson(pid) {
  db.people = db.people.filter(p => p.id !== pid);
  db.pays = db.pays.filter(x => x.person !== pid);
  db.rows = db.rows.filter(r => !r.startsWith(`${pid}|`));
  save();
}

const DEGREES = [['', '미정'], ['학사', '학사'], ['석사', '석사'], ['박사', '박사'], ['포닥', '포닥']];

$('addPerson').onclick = () => ask('학생 추가', [
  { key: 'name', label: '이름', required: true },
  [{ key: 'degree', label: '과정', type: 'select', options: DEGREES, value: '' },
    { key: 'sem', label: '어느 학기부터', type: 'select', options: Array.from({ length: 4 }, (_, i) => { const s = semAdd(semOf(NOW), i); return [s, semLabel(s)]; }), value: semOf(NOW) }],
], v => {
  db.people.push({ id: uid(), name: v.name.trim(), degrees: v.degree ? { [v.sem]: v.degree } : {} });
  save();
});

function addGrantRow(p) {
  const sems = paySems(), first = semStart(sems[0]), last = semEnd(sems.at(-1));
  const have = new Set(rowsOf(p, first, last).map(g => g.id));
  const opts = sortedGrants().filter(g => !have.has(g.id) && grantIn(g, first, last)).map(g => [g.id, `${g.emoji} ${g.name}`]);
  if (!opts.length) return alert('이 구간에 더 넣을 재원이 없어요.');
  ask(`${p.name} — 재원 추가`, [{ key: 'grant', label: '재원', type: 'select', options: opts, value: opts[0][0] }], v => {
    db.rows.push(`${p.id}|${v.grant}`);
    save();
  });
}

// ‹ › = 구간을 한 학기씩 옮김
const payGo = month => { payFocus = month; payScroll = true; render(); };
$('prevRange').onclick = () => payGo(semStart(semAdd(semOf(payFocus), -1)));
$('nextRange').onclick = () => payGo(semStart(semAdd(semOf(payFocus), 1)));
$('todayRange').onclick = () => payGo(semStart(semOf(NOW)));
for (const b of $('viewSeg').children) b.onclick = () => setPayView(b.dataset.view);
