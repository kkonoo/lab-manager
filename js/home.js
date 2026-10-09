'use strict';
// ---------- 확인할 것 ----------
function alerts() {
  const out = [], missing = [];
  for (const g of sortedGrants()) {
    const outside = db.pays.filter(x => x.grant === g.id && !inGrant(g, x.month));
    if (outside.length) {
      const ms = outside.map(x => x.month).sort();
      const names = [...new Set(outside.map(x => person(x.person).name))].join(', ');
      out.push({ lv: 'bad', t: `${g.emoji} ${g.name} 기간(~${mDot(g.end)}) 밖에 인건비가 잡혀 있어요`,
        s: `${names} · ${mDot(ms[0])}–${mDot(ms.at(-1))} · ${fmtM(sum(outside))}만원`, go: () => openPay(ms[0], 1) });
    }
    for (const pd of periods(g)) {
      const st = periodStats(g, pd);
      if (pd.pay != null && st.pay > pd.pay)
        out.push({ lv: 'bad', t: `${g.emoji} ${g.name} ${pd.n}차년도 인건비가 계상액을 넘어요`,
          s: `인건비 ${fmt(st.pay)} / 계상 ${fmt(pd.pay)}천원 (${fmt(st.pay - pd.pay)}천원 초과)`, go: () => openBudget(g.id, pd.n) });
      if (pd.budget != null && st.used > pd.budget)
        out.push({ lv: 'bad', t: `${g.emoji} ${g.name} ${pd.n}차년도 계획이 배정액을 넘어요`,
          s: `인건비 ${fmt(st.pay + st.postdoc)} + 세목 ${fmt(st.lines)} = ${fmt(st.used)} / 배정 ${fmt(pd.budget)}천원`, go: () => openBudget(g.id, pd.n) });
    }
    const cur = periodAt(g, NOW);
    if (cur && cur.budget == null && cur.pay == null) missing.push({ g, cur });
  }
  if (missing.length)
    out.push({ lv: 'warn', t: '지금 연차의 배정액이 비어 있어요', s: missing.map(({ g, cur }) => `${g.name} ${cur.n}차년도`).join(' · '),
      go: () => openBudget(missing[0].g.id, missing[0].cur.n) });
  const noCat = db.lines.filter(l => !l.cat);
  if (noCat.length)
    out.push({ lv: 'warn', t: `세목이 비어 있는 예산 항목 ${noCat.length}개`, s: noCat.map(l => `${l.name}(${grant(l.grant).name})`).join(' · '),
      go: () => openBudget(noCat[0].grant, noCat[0].n) });
  // 앞으로 12개월 중 기준 인건비를 넘는 달 (과정은 그 달의 학기 기준)
  const overs = [];
  const next12 = range(NOW, mAdd(NOW, 11));
  for (const p of db.people) {
    const months = next12.filter(m => { const r = rateAt(p, m); return r && monthTotal(p.id, m) > r; });
    if (months.length) overs.push(`${p.name} ${months.length}개월 (${mShort(months[0])}~)`);
  }
  if (overs.length) out.push({ lv: 'bad', t: '기준 인건비를 넘는 달이 있어요 (참여율 100% 초과)', s: overs.join(' · '), go: () => openPay(NOW) });
  const late = db.orders.filter(o => !o.got && daysSince(o.date) >= LATE_DAYS).sort((a, b) => a.date.localeCompare(b.date));
  if (late.length)
    out.push({ lv: 'warn', t: `주문하고 ${LATE_DAYS}일 넘게 못 받은 것이 ${late.length}건 있어요`, s: late.map(o => `${o.name} (${daysSince(o.date)}일째${o.vendor ? ` · ${o.vendor}` : ''})`).join(' · '),
      go: () => { stockView = 'need'; setTab('stock'); } });
  const noDeg = db.people.filter(p => db.pays.some(x => x.person === p.id && x.month >= NOW && !degreeAt(p, x.month)));
  if (noDeg.length)
    out.push({ lv: 'info', t: '과정이 정해지지 않은 학생이 있어요', s: `${noDeg.map(p => p.name).join(', ')} · 인건비 표(학기 보기)에서 학기별 과정을 고르세요`, go: () => openPay(NOW) });
  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.lv] - order[b.lv]);
}

// ---------- 한눈에 ----------
function renderHome() {
  $('alerts').replaceChildren(...alerts().map(a => {
    const b = h('button', `alert ${a.lv}`, h('span', 'ic', a.lv === 'info' ? 'ℹ' : '⚠'), h('span', 't', a.t), h('span', 's', a.s), h('span', 'go', '보기 ›'));
    b.onclick = a.go;
    return b;
  }));
  renderTimeline();
  renderThisMonth();
  renderCards();
}

function renderTimeline() {
  const gs = sortedGrants().filter(dated);
  if (!gs.length) { $('timeline').replaceChildren(h('p', 'hint', '기간이 있는 과제가 없어요.')); return; }
  const y0 = Math.min(...gs.map(g => +g.start.slice(0, 4))), YEARS = 5;
  const from = y0 * 12, span = YEARS * 12;
  const pct = n => (n - from) / span * 100; // n = 월 번호 (그 달의 시작)
  const axis = h('div', 'tl-axis', Array.from({ length: YEARS }, (_, i) => {
    const s = h('span', null, `${y0 + i}`);
    s.style.left = `${pct(from + i * 12 + 6)}%`;
    return s;
  }));
  const rows = gs.map(g => {
    const track = h('div', 'tl-track');
    for (let i = 1; i < YEARS; i++) { const y = h('i', 'tl-year'); y.style.left = `${pct(from + i * 12)}%`; track.append(y); }
    const cur = periodAt(g, NOW);
    for (const pd of periods(g)) {
      const a = Math.max(0, pct(mNum(pd.from))), b = Math.min(100, pct(mNum(pd.to) + 1));
      if (b <= 0 || a >= 100) continue;
      const seg = h('button', 'tl-seg' + (cur?.n === pd.n ? ' cur' : ''), `${pd.n}차`);
      seg.style.setProperty('--c', g.color);
      seg.style.left = `${a}%`;
      seg.style.width = `${b - a}%`;
      seg.title = `${g.name} ${pd.n}차년도 · ${mDot(pd.from)}–${mDot(pd.to)} — 누르면 이 연차 예산으로`;
      seg.onclick = () => openBudget(g.id, pd.n);
      track.append(seg);
    }
    if (mNum(g.end) >= from + span) track.append(h('span', 'tl-more', `→ ${mDot(g.end)}`));
    else if (g.end >= NOW && mNum(g.end) - mNum(NOW) <= 12) {
      const e = h('span', 'tl-end', `${mDot(g.end)} 종료`);
      e.style.left = `${pct(mNum(g.end) + 1)}%`;
      track.append(e);
    }
    const t = h('i', 'tl-today');
    t.style.left = `${pct(mNum(NOW) + (TODAY.getDate() - 1) / 31)}%`;
    track.append(t);
    const label = h('div', 'tl-label', h('span', null, g.emoji), h('span', null, g.name));
    label.title = `${g.full || g.name} · ${roleLabel(g)}`;
    return [label, track];
  });
  $('timeline').replaceChildren(h('div'), axis, ...rows.flat());
}

function renderThisMonth() {
  $('thisMonthTitle').textContent = `${mKo(NOW)} 학생별 인건비`;
  const order = sortedGrants();
  const rows = db.people
    .map(p => ({ p, items: db.pays.filter(x => x.person === p.id && x.month === NOW) }))
    .filter(r => r.items.length)
    .sort((a, b) => sum(b.items) - sum(a.items)); // 이번 달 많이 받는 학생부터
  const total = sum(rows.flatMap(r => r.items));
  $('thisMonthHint').textContent = rows.length ? `합계 ${fmtM(total)}만원 · ${rows.length}명` : '';
  if (!rows.length) { $('thisMonth').replaceChildren(h('p', 'hint', '이번 달에 잡힌 인건비가 없어요.')); return; }
  // 막대 전체 = 그 학생의 기준 인건비 (참여율 100%). 과정이 없으면 이번 달 가장 많이 받는 학생 기준
  const fallback = Math.max(...rows.map(r => sum(r.items)));
  const used = new Set();
  const list = rows.map(({ p, items }) => {
    const t = sum(items), rate = rateAt(p, NOW), deg = degreeAt(p, NOW), base = rate || fallback;
    const part = rate ? partRate(t, rate) : null;
    const bar = h('div', cls('sbar', part > 100 && 'over'));
    for (const x of items.sort((a, b) => order.indexOf(grant(a.grant)) - order.indexOf(grant(b.grant)))) {
      const g = grant(x.grant);
      used.add(g);
      const i = h('i');
      i.style.setProperty('--c', g.color);
      i.style.width = `${x.amount / base * 100}%`;
      i.title = `${g.name} ${fmtM(x.amount)}만원${rate ? ` (${partRate(x.amount, rate)}%)` : ''}`;
      bar.append(i);
    }
    return h('div', 'sbar-row',
      h('div', 'sbar-name', p.name, h('small', null, deg || '과정 미정')),
      bar,
      h('div', cls('sbar-total num', part > 100 && 'over'), fmtM(t)),
      h('div', cls('sbar-pct num', part > 100 && 'over'), part == null ? '–' : `${part}%`));
  });
  const headRow = h('div', 'sbar-row sbar-colhead', h('span'), h('span'), h('span', null, '만원'), h('span', null, '참여율'));
  const legend = h('div', 'sbar-legend', order.filter(g => used.has(g)).map(g => chip(g)), h('span', 'hint', '막대 끝 = 참여율 100%'));
  $('thisMonth').replaceChildren(headRow, ...list, legend);
}

function chip(g, text = `${g.emoji} ${g.name}`) {
  const c = h('span', 'chip', text);
  c.style.setProperty('--c', g.color);
  return c;
}

function meter(label, value, ratio, kind) {
  const m = h('div', 'meter', h('div', 'meter-top', h('span', null, label), h('b', ratio > 1 ? 'over' : ratio == null ? 'empty-num' : null, value)));
  if (ratio != null) {
    const i = h('i', kind || (ratio > 1 ? 'over' : null));
    i.style.width = `${Math.min(1, ratio) * 100}%`;
    m.append(h('div', 'bar', i));
  }
  return m;
}

function renderCards() {
  $('cards').replaceChildren(...sortedGrants().filter(dated).map(g => {
    const pd = periodAt(g, NOW);
    const card = h('button', 'card', h('div', 'card-head', h('span', null, g.emoji), h('span', null, g.name), chip(g, roleLabel(g))));
    card.style.setProperty('--c', g.color);
    card.onclick = () => openBudget(g.id, pd?.n);
    if (!pd) { card.append(h('div', 'card-sub', NOW < g.start ? `${mDot(g.start)} 시작` : '끝난 과제')); return card; }
    const len = mNum(pd.to) - mNum(pd.from) + 1, done = mNum(NOW) - mNum(pd.from) + 1, left = mNum(pd.to) - mNum(NOW);
    const st = periodStats(g, pd);
    card.append(
      h('div', 'card-sub', `${pd.n}차년도 · ${mDot(pd.from)}–${mDot(pd.to)} · ${left ? `${left}개월 남음` : '이번 달로 끝'}`),
      meter('연차 진행', `${done} / ${len}개월`, done / len, 'time'),
      pd.pay != null ? meter('학생인건비 / 계상액', `${fmt(st.pay)} / ${fmt(pd.pay)}`, st.pay / pd.pay)
        : meter('학생인건비', `${fmt(st.pay)} · 계상액 미입력`, null),
      pd.budget != null ? meter('계획 / 배정(직접비)', `${fmt(st.used)} / ${fmt(pd.budget)}`, st.used / pd.budget)
        : meter('배정(직접비)', '미입력', null));
    if (g.end <= mAdd(NOW, 12)) card.append(h('div', 'card-warn', `⚠ ${mDot(g.end)} 과제 종료 — 그 뒤 인건비 재원 확인`));
    return card;
  }));
}
