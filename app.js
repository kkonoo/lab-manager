'use strict';
// 랩 매니저 — 연구실(프로토콜·재고, 학생과 같이) + 행정(재원·연차·학생인건비·서류·정보 노트). 저장은 이 브라우저(localStorage), 로그인하면 sync.js가 Firestore와 맞춤
// 금액은 모두 천원으로 저장. 인건비 화면만 만원으로 보여 줌 (fmtM)
// db.grants 재원 / db.people 학생 (과정은 학기마다) / db.pays 학생×재원×월 한 칸씩 / db.lines 연차별 세목 예산 / db.info 정보 노트
// db.stock·db.orders 재고·주문 (랩 멤버와 같이 씀) / db.docs 서류 / db.trips 출장 / db.profile 내 정보
// 연차는 저장하지 않고 과제 시작·끝 월에서 계산 → 인건비는 월만 적으면 어느 연차인지 자동으로 정해짐

const $ = id => document.getElementById(id);
function h(tag, cls, ...kids) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.append(...kids.flat(9).filter(k => k != null && k !== false).map(k => typeof k === 'number' ? String(k) : k));
  return el;
}
const cls = (...xs) => xs.filter(Boolean).join(' ');

// ---------- 월: 'YYYY-MM' ↔ 월 번호 ----------
const mNum = s => +s.slice(0, 4) * 12 + +s.slice(5, 7) - 1;
const mStr = n => `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}`;
const mAdd = (s, k) => mStr(mNum(s) + k);
const mDot = s => `${s.slice(0, 4)}.${s.slice(5, 7)}`;
const mShort = s => `${s.slice(2, 4)}.${s.slice(5, 7)}`;
const mKo = s => `${+s.slice(5, 7)}월`;
const between = (m, a, b) => m >= a && m <= b;
const range = (from, to) => { const out = []; for (let n = mNum(from); n <= mNum(to); n++) out.push(mStr(n)); return out; };
const TODAY = new Date();
const NOW = mStr(TODAY.getFullYear() * 12 + TODAY.getMonth());
const fmt = n => (Math.round(n * 10) / 10).toLocaleString('ko-KR'); // 천원 그대로
const fmtM = n => fmt(n / 10);                                       // 천원 → 만원
const sum = (arr, f = x => x.amount) => arr.reduce((a, x) => a + (+f(x) || 0), 0);
const uid = () => Math.random().toString(36).slice(2, 9);

// ---------- 학기: 1학기 = 3–8월, 2학기 = 9–다음 해 2월. 키는 '2026-2' ----------
const semOf = m => { const y = +m.slice(0, 4), mo = +m.slice(5, 7); return mo >= 3 && mo <= 8 ? `${y}-1` : `${mo >= 9 ? y : y - 1}-2`; };
const semStart = s => `${s.slice(0, 4)}-${s.endsWith('-1') ? '03' : '09'}`;
const semEnd = s => mAdd(semStart(s), 5);
const semMonths = s => range(semStart(s), semEnd(s));
const semAdd = (s, k) => semOf(mAdd(semStart(s), 6 * k));
const semLabel = s => `${s.slice(2, 4)}년 ${s.slice(5)}학기`;
const semRange = s => `${mShort(semStart(s))}–${mShort(semEnd(s))}`;

// ---------- 저장 ----------
// 같은 주소(kkonoo.github.io)의 다른 앱과 localStorage를 같이 쓰므로 키는 lab-manager* 로만. 예전 이름(랩 행정·목업) 때 키도 읽어 이어받음
const KEY = 'lab-manager', OLD_KEYS = ['lab-admin', 'lab-admin-mockup'], VERSION = 3;
function fresh() {
  const s = structuredClone(window.SEED);
  const pays = [];
  for (const [person, grant, from, to, amount] of s.payRanges)
    for (const month of range(from, to)) pays.push({ person, grant, month, amount });
  return withDocs({ version: VERSION, rates: s.rates, grants: s.grants, people: s.people, pays, lines: s.lines, info: s.info, rows: [], sim: true });
}
// 서류·내 정보는 나중에 생긴 칸이라 예전 저장본에도 채워 넣음
function withDocs(v) {
  v.docs ||= structuredClone(window.FORMS.docs);
  v.profile ||= structuredClone(window.FORMS.profile);
  if (!v.trips) { // 출장 기능 처음 → 예시 출장 2건과 그 서류
    v.trips = structuredClone(window.FORMS.trips);
    v.docs.push(...structuredClone(window.FORMS.tripDocs));
  }
  if (!v.buySeed) { v.buySeed = true; v.docs.push(...structuredClone(window.FORMS.buyDocs)); } // 구매 규격서 처음 → 예시 (2606 비품 규격서)
  if (!v.miscSeed) { v.miscSeed = true; v.docs.push(...structuredClone(window.FORMS.miscDocs)); } // 회의록·레터 처음 → 원본에 있던 내용
  for (const g of v.grants) if (g.overview && !g.finalGoal) { g.finalGoal = g.overview; delete g.overview; } // 과제 개요 → 최종 목표
  if (!v.stock) { v.stock = structuredClone(window.SEED.stock); v.orders = []; } // 재고 처음 → 묶음과 예시 품목
  if (!v.stock.places) { // 보관 위치가 글로만 있던 저장본 → 위치 목록으로 (이름이 같으면 그 위치, 없으면 새로)
    v.stock.places = structuredClone(window.SEED.stock.places);
    for (const it of v.stock.items) if (it.place) {
      let p = v.stock.places.find(x => x.name === it.place || x.id === it.place);
      if (!p) v.stock.places.push(p = { id: uid(), name: it.place, kind: 'shelf' });
      it.place = p.id;
    }
  }
  if (!v.stock.vendors) { // 업체 연락처: 정보 탭 노트 → 재고(랩 멤버와 같이 봄)로 옮김
    const n = v.info.notes.find(x => x.id === 'vendor' && x.type === 'table');
    v.stock.vendors = n ? { columns: n.columns, rows: n.rows } : structuredClone(window.SEED.stock.vendors);
    if (n) v.info.notes = v.info.notes.filter(x => x !== n);
  }
  for (const l of v.lines) l.id ||= uid(); // 주문을 세목 항목에 이어 붙이려고
  v.central ||= { equip: 1000, other: 5000 }; // 중앙구매 기준 (천원): 장비·비품 100만원, 소모품·시약 500만원 — 설정에서 바꿈
  v.stock.protoGroups ||= []; // 프로토콜·실험 묶음 → 프로토콜 (품목의 protocols 로 이어짐)
  v.stock.protocols ||= [];
  v.labMembers ||= []; // 재고를 같이 쓰는 학생 구글 이메일 (sync.js가 랩 문서에 올림)
  return v;
}
function load() {
  for (const k of [KEY, ...OLD_KEYS]) {
    try { const v = JSON.parse(localStorage.getItem(k)); if (v && v.version === VERSION) return withDocs(v); } catch { /* 처음이거나 막힘 */ }
  }
  return fresh();
}
let db = load();
// 저장: 이 브라우저(localStorage) + 로그인했으면 sync.js가 바뀐 부분만 올림 (window.onSave)
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 저장 못 해도 화면은 그대로 */ }
  window.onSave?.();
}
function save() { persist(); render(); }

const grant = id => db.grants.find(g => g.id === id);
const person = id => db.people.find(p => p.id === id);
const shown = x => db.sim || !person(x.person)?.virtual; // 가상 학생 빼고 보기
const dated = g => !!g.start;

// 재원 정렬: 책임과제 → 참여과제 → BK21 → 기타, 같은 묶음 안에서는 연 예산 큰 순
const GROUPS = [
  ['책임과제', g => g.kind === '과제' && g.role === '책임'],
  ['참여과제', g => g.kind === '과제' && g.role !== '책임'],
  ['BK21', g => g.kind === 'BK21'],
  ['기타', () => true],
];
const groupOf = g => GROUPS.findIndex(([, f]) => f(g));
const sortedGrants = () => [...db.grants].sort((a, b) => groupOf(a) - groupOf(b) || (b.annual ?? -1) - (a.annual ?? -1) || a.name.localeCompare(b.name, 'ko'));
const roleLabel = g => g.kind === '과제' ? `${g.role || '참여'}과제` : g.kind;

// 과정: 그 학기에 적힌 값, 없으면 바로 앞 학기 값
function degreeAt(p, m) {
  const s = semOf(m), d = p.degrees || {};
  const keys = Object.keys(d).filter(k => k <= s && d[k]).sort();
  return keys.length ? d[keys.at(-1)] : null;
}
// 기준(기준 인건비·중앙구매)은 시행 월부터 바뀜: db.rateHist / db.centralHist = [{ from: 'YYYY-MM', v }]
// 첫 기록 전 달은 db.rates / db.central (처음 기준). 기준을 바꿔도 지난 달 참여율·주문 판단은 그때 기준대로
const histAt = (base, hist, m) => (hist || []).filter(x => x.from <= m).sort((a, b) => a.from.localeCompare(b.from)).at(-1)?.v ?? base;
const ratesAt = m => histAt(db.rates, db.rateHist, m);
const centralAt = m => histAt(db.central, db.centralHist, m);
const rateAt = (p, m) => { const d = degreeAt(p, m); return d ? ratesAt(m)[d] : null; };
const partRate = (v, rate) => Math.round(v / rate * 100); // 참여율 = 인건비 ÷ 기준 인건비

// ---------- 연차 ----------
// 시작월부터 12개월씩, 마지막 연차는 종료월에서 자름. 번호는 firstNo(기본 1)부터
function periods(g) {
  if (!g.start) return [];
  const out = [], end = mNum(g.end);
  for (let s = mNum(g.start), i = 0; s <= end; s += 12, i++) {
    const n = (g.firstNo || 1) + i, info = (g.periods || {})[n] || {};
    out.push({ n, from: mStr(s), to: mStr(Math.min(s + 11, end)), budget: info.budget ?? null, pay: info.pay ?? null });
  }
  return out;
}
const periodAt = (g, m) => periods(g).find(p => between(m, p.from, p.to)) || null;
const inGrant = (g, m) => !g.start || between(m, g.start, g.end);
const paysOf = (gid, from, to) => db.pays.filter(x => x.grant === gid && shown(x) && between(x.month, from, to));
const linesOf = (gid, n) => db.lines.filter(l => l.grant === gid && l.n === n);
const lineOf = id => db.lines.find(l => l.id === id);
const ordersOf = lid => db.orders.filter(o => o.line === lid);
const lineSpent = l => (+l.spent || 0) + sum(ordersOf(l.id)); // 집행 = 직접 적은 값 + 재고 탭에서 이 항목으로 낸 주문
function periodStats(g, pd) {
  const pay = sum(paysOf(g.id, pd.from, pd.to));
  const lines = sum(linesOf(g.id, pd.n), l => l.plan);
  return { pay, lines, spent: sum(linesOf(g.id, pd.n), lineSpent), used: pay + lines };
}
const monthTotal = (pid, m) => sum(db.pays.filter(x => x.person === pid && x.month === m));
const cellTotal = (pid, gid, m) => sum(db.pays.filter(x => x.person === pid && x.grant === gid && x.month === m));
function setPeriodValue(g, n, key, value) {
  g.periods ||= {};
  const info = g.periods[n] ||= {};
  if (value === '' || value == null || isNaN(+value)) delete info[key]; else info[key] = +value;
  save();
}

// ---------- 확인할 것 ----------
function alerts() {
  const out = [], missing = [];
  for (const g of sortedGrants()) {
    const outside = db.pays.filter(x => x.grant === g.id && shown(x) && !inGrant(g, x.month));
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
          s: `인건비 ${fmt(st.pay)} + 세목 ${fmt(st.lines)} = ${fmt(st.used)} / 배정 ${fmt(pd.budget)}천원`, go: () => openBudget(g.id, pd.n) });
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
    if (p.virtual && !db.sim) continue;
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

// ---------- 화면 전환 ----------
let tab = 'home', selGrant = null, selN = null;
// 인건비 표는 데이터가 있는 기간 전체를 그리고 옆으로 넘겨 봄. payFocus = 다음에 그릴 때 맨 왼쪽에 둘 달
let payFocus = semStart(semOf(NOW)), payScroll = true;
let payView = 'sem';
try { payView = localStorage.getItem('lab-manager-payview') || 'sem'; } catch { /* 기본값 */ }
function setPayView(v) { payView = v; payScroll = true; try { localStorage.setItem('lab-manager-payview', v); } catch { /* 없음 */ } render(); }
function setTab(t) { tab = t; render(); }
function openPay(month, back = 0) { payFocus = semStart(semAdd(semOf(month), -back)); payScroll = true; setTab('pay'); }

// 화면 배치(패널 너비·열 너비·글씨 크기)는 이 브라우저에만 따로 저장
const LAYOUT_KEY = 'lab-manager-layout';
let layout = {};
try { layout = JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch { /* 처음 */ }
layout.colW ||= { month: { name: 190, col: 66 }, sem: { name: 190, col: 170 } };
const saveLayout = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* 없음 */ } };
const applyFont = () => document.documentElement.style.setProperty('--fs', layout.fs || 1);
applyFont();

// 패널 사이 경계를 끌어 왼쪽 칸 너비(px)를 CSS 변수로 바꿈. 두 번 누르면 원래대로
function splitter(container, varName, min = 160) {
  if (layout[varName]) container.style.setProperty(varName, layout[varName]);
  const bar = h('div', 'splitter');
  bar.title = '끌어서 크기 조절 · 두 번 누르면 원래대로';
  bar.addEventListener('pointerdown', e => {
    e.preventDefault();
    bar.setPointerCapture(e.pointerId);
    bar.classList.add('active');
    document.body.classList.add('resizing');
    const box = container.getBoundingClientRect();
    const move = ev => container.style.setProperty(varName, `${Math.round(Math.min(box.width - min, Math.max(min, ev.clientX - box.left)))}px`);
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.classList.remove('active');
      document.body.classList.remove('resizing');
      layout[varName] = container.style.getPropertyValue(varName);
      saveLayout();
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  });
  bar.ondblclick = () => { container.style.removeProperty(varName); delete layout[varName]; saveLayout(); };
  return bar;
}

// 머리칸 오른쪽 끝을 끌어 열 너비 조정. onSize(px)는 끄는 동안, onDone은 놓을 때
function colGrip(onSize, onDone, min = 40) {
  const grip = h('span', 'col-grip');
  grip.title = '끌어서 열 너비 조정';
  grip.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startW = grip.parentElement.getBoundingClientRect().width;
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    const move = ev => onSize(Math.max(min, Math.round(startW + ev.clientX - startX)));
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      onDone();
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  });
  grip.addEventListener('click', e => e.stopPropagation());
  return grip;
}
function openBudget(gid, n) { selGrant = gid; selN = n ?? null; setTab('budget'); }

// 랩 멤버(학생)로 로그인하면 db.member = { lab, labName } 이고 연구실 탭(프로토콜·재고)만 보임 (sync.js가 정함)
const isMember = () => !!db.member;
const LAB_TABS = ['protocol', 'stock'];
function render() {
  if (isMember() && !LAB_TABS.includes(tab)) tab = 'protocol';
  document.body.dataset.tab = tab;
  document.body.dataset.role = isMember() ? 'member' : 'pi';
  for (const b of $('tabSeg').querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === tab);
  $('cellPop').hidden = true;
  renderProtocol();
  renderStock();
  if (isMember()) return;
  renderHome();
  renderPay();
  renderBudget();
  renderInfo();
  renderDocs();
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
  const rows = db.people.filter(p => db.sim || !p.virtual)
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
      h('div', 'sbar-name', p.name, h('small', null, [p.virtual ? '가상' : null, deg || '과정 미정'].filter(Boolean).join(' · '))),
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

// ---------- 인건비 표 (학기 보기 / 월 보기) — 금액은 만원으로 보여 줌 ----------
function rowsOf(p) {
  const ids = new Set([...db.pays.filter(x => x.person === p.id).map(x => x.grant),
    ...db.rows.filter(r => r.startsWith(`${p.id}|`)).map(r => r.split('|')[1])]);
  return sortedGrants().filter(g => ids.has(g.id));
}

function renderPay() {
  for (const b of $('viewSeg').children) b.classList.toggle('on', b.dataset.view === payView);
  $('simToggle').checked = db.sim;
  // 그릴 기간: 인건비가 있는 첫 달(또는 이번 학기)부터 마지막 달·1년 반 뒤 중 늦은 쪽까지, 학기 단위
  const ms = db.pays.filter(shown).map(x => x.month).sort();
  const lo = [ms[0], NOW, payFocus].filter(Boolean).sort()[0];
  const hi = [ms.at(-1), mAdd(NOW, 18), mAdd(payFocus, 11)].filter(Boolean).sort().at(-1);
  const sems = [];
  for (let s = semOf(lo); semStart(s) <= hi; s = semAdd(s, 1)) sems.push(s);
  const months = sems.flatMap(semMonths), first = months[0], last = months.at(-1);
  $('legend').replaceChildren(...sortedGrants().map(g => chip(g)), ...(payView === 'sem' ? [
    h('span', null, '학생 줄 = 월 인건비 · 참여율(인건비 ÷ 기준)'),
    h('span', null, '칸을 누르면 학기 단위로 고쳐요'),
    h('span', null, h('span', 'sw out'), '과제 기간 밖'),
  ] : [
    h('span', null, h('span', 'sw now'), '이번 달'),
    h('span', null, '지난 달 = 실지급 · 이번 달 뒤 = 계획(흐리게)'),
    h('span', null, h('span', 'sw out'), '과제 기간 밖'),
  ]), h('span', null, '표를 끌면 옆으로 넘어가요 · 머리칸 오른쪽 끝을 끌면 열 너비'));

  const people = [], hidden = [];
  for (const p of [...db.people.filter(p => !p.virtual), ...db.people.filter(p => p.virtual && db.sim)]) {
    const inWin = db.pays.some(x => x.person === p.id && between(x.month, first, last));
    if (inWin || p.virtual || db.rows.some(r => r.startsWith(`${p.id}|`))) people.push(p); else hidden.push(p.name);
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
  $('payFoot').textContent = [
    payView === 'sem' ? '단위: 만원 · 학생 칸은 월액(학기 안에서 달마다 다르면 범위), 맨 아래는 학기 합계(6개월)'
      : '단위: 만원 · 칸을 누르면 금액을 고쳐요. 어느 연차인지는 월만 보고 자동으로 정해져요.',
    hidden.length ? `이 구간에 인건비가 없는 학생: ${hidden.join(', ')}` : '',
  ].filter(Boolean).join('  ·  ');
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
  const td = h('td', 'name', h('span', 'pname', p.name), p.virtual ? h('span', 'tag', '가상') : null);
  if (payView === 'month') {
    const s = h('span', 'deg-sum', degreeSummary(p, first, last));
    s.title = '과정은 학기 보기에서 학기마다 바꿔요';
    td.append(s);
  }
  if (p.virtual) {
    const del = h('button', 'link-btn', '삭제');
    del.onclick = () => { if (confirm(`가상 학생 '${p.name}'을(를) 지울까요?`)) removePerson(p.id); };
    td.append(del);
  }
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
    h('th', 'sum', '합계', h('small', null, '기간 전체')));
  const body = h('tbody');
  for (const p of people) {
    const cells = sems.map(s => {
      const ms = semMonths(s), sm = summarize(ms.map(m => monthTotal(p.id, m)));
      const deg = degreeAt(p, ms[0]), rate = deg ? ratesAt(ms[0])[deg] : null, own = (p.degrees || {})[s];
      const sel = h('select', cls('degree', !own && 'inherit'), ['', '학사', '석사', '박사'].map(d => {
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
    body.append(h('tr', cls('p-head', p.virtual && 'virtual'), personNameCell(p, first, last), cells, h('td', 'sum', fmtM(total))));
    for (const g of rowsOf(p)) {
      const gSum = sum(db.pays.filter(x => x.person === p.id && x.grant === g.id && between(x.month, first, last)));
      body.append(h('tr', 'g-row', grantNameCell(g), sems.map(s => semCell(p, g, s)), h('td', 'sum', gSum ? fmtM(gSum) : '')));
    }
    body.append(addRow(p, sems.length));
  }
  const foot = h('tfoot');
  for (const g of sortedGrants()) {
    const xs = paysOf(g.id, first, last);
    if (!xs.length) continue;
    foot.append(h('tr', null, grantNameCell(g),
      sems.map(s => { const t = sum(xs.filter(x => between(x.month, semStart(s), semEnd(s)))); return h('td', s === cur ? 'now' : null, t ? fmtM(t) : ''); }),
      h('td', 'sum', fmtM(sum(xs)))));
  }
  const all = db.pays.filter(x => shown(x) && between(x.month, first, last));
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
    body.append(h('tr', cls('p-head', p.virtual && 'virtual'), personNameCell(p, first, last), totals, h('td', 'sum', fmtM(total))));
    for (const g of rowsOf(p)) {
      const gSum = sum(db.pays.filter(x => x.person === p.id && x.grant === g.id && between(x.month, first, last)));
      body.append(h('tr', 'g-row', grantNameCell(g), months.map(m => monthCell(p, g, m, ss(m))), h('td', 'sum', gSum ? fmtM(gSum) : '')));
    }
    body.append(addRow(p, months.length));
  }
  const foot = h('tfoot');
  for (const g of sortedGrants()) {
    const xs = paysOf(g.id, first, last);
    if (!xs.length) continue;
    foot.append(h('tr', null, grantNameCell(g),
      months.map(m => {
        const t = sum(xs.filter(x => x.month === m));
        return h('td', cls(m === NOW && 'now', ss(m) && 'ss', t && !inGrant(g, m) && 'cell out bad'), t ? fmtM(t) : '');
      }),
      h('td', 'sum', fmtM(sum(xs)))));
  }
  const all = db.pays.filter(x => shown(x) && between(x.month, first, last));
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

// ---------- 입력 창 ----------
const dlg = $('dlg');
function field(f) {
  let input;
  if (f.type === 'select') {
    input = h('select', null, f.options.map(([v, label]) => { const o = h('option', null, label); o.value = v; o.selected = v === f.value; return o; }));
  } else if (f.type === 'textarea') { // 여러 줄 (Enter = 줄바꿈)
    input = h('textarea');
    input.rows = f.rows || 3;
    input.value = f.value ?? '';
    if (f.placeholder) input.placeholder = f.placeholder;
  } else {
    input = h('input');
    input.type = f.type || 'text';
    input.enterKeyHint = 'enter'; // 모바일 키보드가 '다음'(다음 칸으로만 감) 대신 Enter → 확인
    input.value = f.value ?? '';
    if (f.step) input.step = f.step;
    if (f.placeholder) input.placeholder = f.placeholder;
  }
  input.name = f.key;
  if (f.required) input.required = true;
  if (f.suggest?.length) { // 고를 수 있는 값 [[값, 옆에 보일 설명]] — 목록에 없는 값도 그냥 적을 수 있음
    const dl = h('datalist', null, f.suggest.map(([v, label]) => Object.assign(h('option'), { value: v, label: label || '' })));
    dl.id = `dl-${f.key}`;
    input.setAttribute('list', dl.id);
    return h('label', 'field', f.label, input, dl);
  }
  return h('label', 'field', f.label, input);
}
function ask(title, fields, onOk, extra = []) {
  $('dlgTitle').textContent = title;
  $('dlgBody').replaceChildren(...fields.map(f => Array.isArray(f) ? h('div', 'row3', f.map(field)) : field(f)), ...extra);
  dlg.returnValue = '';
  dlg.onclose = () => { if (dlg.returnValue === 'ok') onOk(Object.fromEntries(new FormData($('dlgForm')))); };
  dlg.showModal();
}
const DEGREES = [['', '미정'], ['학사', '학사'], ['석사', '석사'], ['박사', '박사']];

$('addPerson').onclick = () => ask('학생 추가', [
  { key: 'name', label: '이름', required: true },
  [{ key: 'degree', label: '과정', type: 'select', options: DEGREES, value: '' },
    { key: 'sem', label: '어느 학기부터', type: 'select', options: Array.from({ length: 4 }, (_, i) => { const s = semAdd(semOf(NOW), i); return [s, semLabel(s)]; }), value: semOf(NOW) }],
], v => {
  db.people.push({ id: uid(), name: v.name.trim(), degrees: v.degree ? { [v.sem]: v.degree } : {} });
  save();
});

$('addVirtual').onclick = () => {
  const k = db.people.filter(p => p.virtual).length + 1;
  ask('가상 학생 (시뮬레이션)', [
    { key: 'name', label: '이름', value: `가상 ${k}`, required: true },
    [{ key: 'degree', label: '과정', type: 'select', options: DEGREES.slice(1), value: '박사' },
      { key: 'start', label: '시작 월', type: 'month', value: semStart(semAdd(semOf(NOW), 1)), required: true },
      { key: 'months', label: '개월 수', type: 'number', value: 12, required: true }],
    { key: 'amount', label: '월액 (만원, 비우면 과정 기준 인건비 = 참여율 100%)', type: 'number', step: '0.5', placeholder: '예: 130' },
    { key: 'grant', label: '어느 재원에서', type: 'select', options: sortedGrants().map(g => [g.id, `${g.emoji} ${g.name}`]), value: sortedGrants()[0]?.id },
  ], v => {
    const id = uid(), amount = v.amount ? Math.round(+v.amount * 10) : ratesAt(NOW)[v.degree];
    db.people.push({ id, name: v.name.trim(), degrees: { [semOf(v.start)]: v.degree }, virtual: true });
    db.sim = true;
    payFocus = semStart(semOf(v.start));
    payScroll = true;
    setMonths(id, v.grant, range(v.start, mAdd(v.start, Math.max(1, +v.months) - 1)), amount);
  });
};

function addGrantRow(p) {
  const have = new Set(rowsOf(p).map(g => g.id));
  const opts = sortedGrants().filter(g => !have.has(g.id)).map(g => [g.id, `${g.emoji} ${g.name}`]);
  if (!opts.length) return alert('이미 모든 재원이 있어요.');
  ask(`${p.name} — 재원 추가`, [{ key: 'grant', label: '재원', type: 'select', options: opts, value: opts[0][0] }], v => {
    db.rows.push(`${p.id}|${v.grant}`);
    save();
  });
}

$('simToggle').onchange = e => { db.sim = e.target.checked; save(); };
// ‹ › = 한 학기씩 옆으로 (학기 보기 1칸, 월 보기 6칸)
const pageBy = dir => $('gridWrap').scrollBy({ left: dir * layout.colW[payView].col * (payView === 'sem' ? 1 : 6), behavior: 'smooth' });
$('prevRange').onclick = () => pageBy(-1);
$('nextRange').onclick = () => pageBy(1);
$('todayRange').onclick = () => scrollPayTo(semStart(semOf(NOW)));
for (const b of $('viewSeg').children) b.onclick = () => setPayView(b.dataset.view);

// ---------- 재원별 예산 (천원) ----------
const CATS = ['연구활동비', '연구재료비', '연구시설·장비비', '연구수당', '위탁연구개발비', '국제공동연구개발비', '기타'];
const CAT_COLOR = { 인건비: '#F08A4B', 연구활동비: '#5B9BEA', 연구재료비: '#2BB39A', '연구시설·장비비': '#9D7BE0', 연구수당: '#E8B10C', 위탁연구개발비: '#F0727A', 국제공동연구개발비: '#D46FB0', 기타: '#8B93A1', 미지정: '#C9C5BB' };
const STATUS = ['계획', '집행중', '완료'];
const KINDS = ['과제', 'BK21', '기타'];
const PALETTE = ['#5B9BEA', '#F0727A', '#2BB39A', '#9D7BE0', '#E8B10C', '#8B93A1', '#F08A4B', '#D46FB0', '#4FB3D9', '#B39B7A'];

function renderBudget() {
  const listBtn = g => {
    const b = h('button', g.id === selGrant ? 'on' : null, h('span', null, g.emoji), h('span', 'gname', g.name), g.annual != null ? h('span', 'kind', fmt(g.annual)) : null);
    b.style.setProperty('--c', g.color);
    b.title = g.annual != null ? `연 ${fmt(g.annual)}천원` : '연 예산 미입력';
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
      g.annual != null ? h('span', 'chip', `연 ${fmt(g.annual)}천원`) : null),
    g.title && g.title !== g.full ? h('div', 'gd-desc', g.title) : null);
  head.style.setProperty('--c', g.color);

  const overview = overviewPanel(g, ps);
  if (!ps.length) { $('grantDetail').replaceChildren(head, overview, etcDetail(g)); return; }
  const pd = ps.find(p => p.n === selN), st = periodStats(g, pd);

  // 쓰임 막대: 인건비 + 세목별
  const parts = [['인건비', st.pay]];
  const byCat = {};
  for (const l of linesOf(g.id, pd.n)) byCat[l.cat || '미지정'] = (byCat[l.cat || '미지정'] || 0) + (+l.plan || 0);
  for (const c of [...CATS, '미지정']) if (byCat[c]) parts.push([c, byCat[c]]);
  const base = Math.max(pd.budget || 0, st.used) || 1;
  const stack = h('div', 'stack', parts.map(([k, v]) => {
    const i = h('i');
    i.style.setProperty('--c', CAT_COLOR[k]);
    i.style.width = `${v / base * 100}%`;
    i.title = `${k} ${fmt(v)}천원`;
    return i;
  }));
  const stackLegend = h('div', 'stack-legend', parts.map(([k, v]) => {
    const d = h('span', 'dot');
    d.style.setProperty('--c', CAT_COLOR[k]);
    return h('span', null, d, `${k} ${fmt(v)}`);
  }));
  const summary = `계획 ${fmt(st.used)}${pd.budget != null ? ` / 배정 ${fmt(pd.budget)}` : ''} · 집행 ${fmt(st.spent)} (천원)`;
  const usage = h('div', 'panel', h('div', 'panel-head', h('h2', null, `${pd.n}차년도 쓰임`), h('span', 'hint', `${mDot(pd.from)}–${mDot(pd.to)} · ${summary}`)), stack, stackLegend);

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
      h('td', 'memo', `${mDot(pd.from)}–${mDot(pd.to)}`),
      h('td', 'goal', preview(g.periods?.[pd.n]?.goal) || '–'),
      h('td', 'r', inp(pd, 'budget')),
      h('td', 'r', inp(pd, 'pay')),
      h('td', cls('r', pd.pay != null && st.pay > pd.pay && 'over'), st.pay ? fmt(st.pay) : '–'),
      h('td', 'r', st.lines ? fmt(st.lines) : '–'),
      h('td', cls('r', left != null && (left < 0 ? 'over' : 'good')), left == null ? '–' : fmt(left)));
    tr.onclick = () => { selN = pd.n; render(); };
    return tr;
  });
  return h('div', 'panel ptable-panel', h('div', 'panel-head', h('h2', null, '연차별 예산'), h('span', 'hint', '단위 천원 · 줄을 누르면 그 연차를 아래에 펼쳐요 · 배정·계상액은 칸에서 바로 고쳐요')),
    h('div', 'tbl-wrap', h('table', 'tbl ptable',
      h('thead', null, h('tr', null, h('th', null, '연차'), h('th', null, '기간'), h('th', null, '목표'), h('th', 'r', '배정 (직접비)'), h('th', 'r', '인건비 계상액'),
        h('th', 'r', '인건비 계획'), h('th', 'r', '세목 계획'), h('th', 'r', '남은 금액'))),
      h('tbody', null, rows))));
}

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
    { key: 'annual', label: '연 예산 (천원)', type: 'number', value: base.annual, placeholder: '간접비 포함 총액 — 같은 묶음 안 정렬 기준' },
  ], v => {
    if (!!v.start !== !!v.end || (v.start && v.end < v.start)) return alert('시작·끝 월은 둘 다 넣고, 끝이 시작보다 늦어야 해요. 기간 없는 재원(장학·수당)이면 둘 다 비워요.');
    const t = g || { id: uid(), color: PALETTE.find(c => !used.has(c)) || PALETTE[0], periods: {} };
    Object.assign(t, {
      name: v.name.trim(), kind: v.kind, role: v.kind === '과제' ? v.role : null, emoji: v.emoji.trim() || '📁',
      full: v.full.trim() || null, title: v.title.trim() || null, no: v.no.trim() || null,
      start: v.start || null, end: v.end || null, firstNo: Math.max(1, Math.round(+v.firstNo) || 1),
      annual: v.annual === '' ? null : +v.annual,
    });
    if (isNew) db.grants.push(t);
    selGrant = t.id;
    selN = null;
    save();
  }, isNew ? [] : [h('p', 'hint', '기간·첫 연차 번호를 바꾸면 연차가 다시 계산돼요. 연차별 배정액은 번호를 따라가요.'), del]);
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
      return h('tr', null, h('td', null, p.name, p.virtual ? [' ', h('span', 'tag', '가상')] : null), h('td', 'memo', `${mShort(ms[0])}–${mShort(ms.at(-1))}`),
        h('td', 'r', new Set(ms).size), h('td', 'r', fmt(sum(xs))));
    })),
    h('tfoot', null, h('tr', null, h('td', null, '합계'), h('td'), h('td'), h('td', 'r', fmt(sum(totals, x => x))))));
  const goPay = h('button', 'btn small', '인건비 표에서 고치기');
  goPay.onclick = () => openPay(pd.from);
  return h('div', 'panel', h('div', 'panel-head', h('h2', null, '월별 학생인건비'), h('span', 'hint', '천원 · 흐린 막대 = 계획')), chart,
    rows.length ? table : h('p', 'hint', '이 연차에 잡힌 인건비가 없어요.'), h('div', null, goPay));
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
    const memo = h('td', 'memo', [l.subs?.join('·'), l.memo].filter(Boolean).join(' — '));
    memo.title = memo.textContent;
    const os = ordersOf(l.id), fromOrders = os.length ? h('button', 'from-orders', `+ 주문 ${fmt(sum(os))}`) : null;
    if (fromOrders) { // 재고 탭 주문 기록으로
      fromOrders.title = `${os.map(o => `${o.date} ${o.name} ${fmt(o.amount || 0)}`).join('\n')}\n\n집행 = 직접 적은 값 + 주문 합 (${fmt(lineSpent(l))})`;
      fromOrders.onclick = () => { stockView = 'orders'; setTab('stock'); };
    }
    return h('tr', null,
      h('td', null, l.name),
      h('td', null, sel([['', '세목 ?'], ...CATS.map(c => [c, c])], l.cat, v => { l.cat = v || null; save(); }, l.cat ? null : 'no-cat')),
      h('td', 'r', num(l.plan, v => { l.plan = v; save(); })),
      h('td', 'r', num(l.spent, v => { l.spent = v; save(); }), fromOrders),
      h('td', null, sel(STATUS.map(s => [s, s]), l.status || '계획', v => { l.status = v; save(); })),
      memo, h('td', null, del));
  });
  const add = h('button', 'btn small', '+ 항목');
  add.onclick = () => ask(`${g.name} ${pd.n}차년도 — 예산 항목`, [
    { key: 'name', label: '항목', required: true, placeholder: '예: 해외학회' },
    { key: 'cat', label: '세목', type: 'select', options: [['', '나중에'], ...CATS.map(c => [c, c])], value: '연구활동비' },
    { key: 'plan', label: '계획액 (천원)', type: 'number', required: true },
    { key: 'memo', label: '메모' },
  ], v => { db.lines.push({ id: uid(), grant: g.id, n: pd.n, name: v.name.trim(), cat: v.cat || null, subs: [], plan: +v.plan, memo: v.memo }); save(); });
  return h('div', 'panel', h('div', 'panel-head', h('h2', null, '세목 예산'), h('span', 'hint', '천원 · 계획·집행·상태는 바로 고쳐져요 · 집행엔 재고 탭 주문이 더해져요')),
    lines.length ? h('div', 'tbl-wrap', h('table', 'tbl',
      h('thead', null, h('tr', null, h('th', null, '항목'), h('th', null, '세목'), h('th', 'r', '계획'), h('th', 'r', '집행'), h('th', null, '상태'), h('th', null, '메모'), h('th'))),
      h('tbody', null, body),
      h('tfoot', null, h('tr', null, h('td', null, '합계'), h('td'), h('td', 'r', fmt(sum(lines, l => l.plan))), h('td', 'r', fmt(sum(lines, lineSpent))), h('td'), h('td'), h('td')))))
      : h('p', 'hint', '아직 항목이 없어요.'),
    h('div', null, add));
}

function etcDetail(g) {
  const byPerson = {};
  for (const x of db.pays.filter(x => x.grant === g.id && shown(x))) (byPerson[x.person] ||= []).push(x);
  const rows = Object.entries(byPerson).map(([pid, xs]) => {
    const ms = xs.map(x => x.month).sort();
    return h('tr', null, h('td', null, person(pid).name), h('td', 'memo', `${mShort(ms[0])}–${mShort(ms.at(-1))}`), h('td', 'r', fmt(xs[0].amount)), h('td', 'r', fmt(sum(xs))));
  });
  return h('div', 'panel', h('div', 'panel-head', h('h2', null, '지급 내역'), h('span', 'hint', '천원 · 기간 없는 재원은 연차 없이 지급 칸만 모아 봐요')),
    rows.length ? h('table', 'tbl', h('thead', null, h('tr', null, h('th', null, '학생'), h('th', null, '기간'), h('th', 'r', '월액'), h('th', 'r', '합계'))), h('tbody', null, rows))
      : h('p', 'hint', '잡힌 지급이 없어요.'));
}

// ---------- 글 (정보 노트·과제 개요·연차 목표가 같이 씀) ----------
// 문법: ## 소제목, - [ ] 체크, - 목록 (앞에 빈칸 두 개 = 들여쓰기), 1. 순서, > 메모, **굵게**, 링크
// editKey = 지금 고치는 글: 'note:<id>' · 'ov:<재원>' (과제 개요 전체)
let editKey = null;
const DOC_HINT = '## 소제목 · - [ ] 체크 · - 목록 (앞에 빈칸 두 개면 들여쓰기) · 1. 순서 · > 메모 · **굵게** · 링크는 그대로 붙여 넣기';

function docEditor(text, setText, placeholder) {
  const ta = h('textarea', 'doc-edit');
  ta.value = text || '';
  ta.spellcheck = false;
  ta.placeholder = placeholder;
  ta.oninput = () => { setText(ta.value); persist(); };
  setTimeout(() => ta.focus());
  return [ta, h('p', 'hint', DOC_HINT)];
}

function docView(text, setText) {
  const lines = text.split('\n');
  return h('div', 'doc', lines.map((line, i) => {
    const indent = Math.floor(line.match(/^\s*/)[0].length / 2), t = line.trim();
    let m, el;
    if ((m = t.match(/^- \[([ x])\] (.*)$/))) {
      const cb = h('input');
      cb.type = 'checkbox';
      cb.checked = m[1] === 'x';
      cb.onchange = () => { lines[i] = line.replace(/- \[[ x]\]/, cb.checked ? '- [x]' : '- [ ]'); setText(lines.join('\n')); save(); };
      el = h('label', cls('d-check', cb.checked && 'done'), cb, h('span', null, inline(m[2])));
    } else if ((m = t.match(/^- (.*)$/))) el = h('div', 'd-li', inline(m[1]));
    else if ((m = t.match(/^(\d+)\. (.*)$/))) el = h('div', 'd-ol', h('span', 'd-num', `${m[1]}.`), h('span', null, inline(m[2])));
    else if ((m = t.match(/^## (.*)$/))) el = h('h3', 'd-h', inline(m[1]));
    else if ((m = t.match(/^> (.*)$/))) el = h('div', 'd-note', inline(m[1]));
    else if (!t) el = h('div', 'd-gap');
    else el = h('p', 'd-p', inline(t));
    if (indent) el.style.marginLeft = `${indent * 22}px`;
    return el;
  }));
}
function inline(s) {
  return s.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*)/g).filter(Boolean).map(part => {
    if (/^https?:\/\//.test(part)) { const a = h('a', null, part); a.href = part; a.target = '_blank'; a.rel = 'noopener'; return a; }
    if (part.startsWith('**') && part.endsWith('**')) return h('b', null, part.slice(2, -2));
    return part;
  });
}
// 첫 줄 미리보기 (기호 빼고)
const preview = text => (text || '').split('\n').map(l => l.trim().replace(/^(## |> |- \[[ x]\] |- |\d+\. )/, '').replace(/\*\*/g, '')).find(Boolean) || '';

// ---------- 정보: 카테고리 → 노트 (살림노트 노트 목록과 같은 구성) ----------
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
    add.title = '이 카테고리에 노트 추가';
    add.onclick = e => { e.stopPropagation(); addNote(c); };
    const head = h('div', 'cat-head', h('span', 'caret', c.open ? '▾' : '▸'), h('span', 'cat-name', c.name), h('span', 'cat-count', String(ns.length)), add);
    head.style.setProperty('--c', c.color);
    head.title = '누르면 접기·펴기 · 두 번 누르면 이름 바꾸기';
    head.onclick = () => { c.open = !c.open; save(); };
    head.ondblclick = e => { e.stopPropagation(); editCat(c); };
    list.push(head);
    if (c.open) for (const n of ns) {
      const row = h('button', cls('note-row', n.id === selNote && 'on'), h('span', 'note-emoji', n.emoji || '·'), h('span', 'note-title', n.title), h('span', 'note-meta', noteMeta(n)));
      row.onclick = () => { selNote = n.id; editKey = null; showSecret = false; render(); };
      list.push(row);
    }
  }
  const addCat = h('button', 'cat-new', '+ 카테고리');
  addCat.onclick = () => ask('카테고리 추가', [{ key: 'name', label: '이름', required: true }], v => {
    cats.push({ id: uid(), name: v.name.trim(), color: PALETTE.find(c => !cats.some(x => x.color === c)) || PALETTE[0], open: true });
    save();
  });
  $('noteList').replaceChildren(h('h2', 'note-list-title', '정보'), ...list, addCat);
  const n = notes.find(x => x.id === selNote);
  $('noteView').replaceChildren(...(n ? noteView(n) : [h('p', 'hint', '카테고리의 + 로 노트를 만들어요.')]));
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
  catSel.title = '카테고리 옮기기';
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
    return h('th', c.secret ? 'secret' : null, h('div', 'th-wrap', name, lock, x), grip);
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
    h('div', 'itable-tools', addRow, addCol, h('span', 'hint', '머리칸 오른쪽 끝을 끌면 열 너비가 바뀌어요'),
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
  const del = h('button', 'btn danger', '카테고리 지우기');
  del.type = 'button';
  del.onclick = () => {
    const ns = db.info.notes.filter(n => n.cat === c.id);
    if (!confirm(ns.length ? `노트 ${ns.length}개도 같이 지워져요. 지울까요?` : `'${c.name}'을(를) 지울까요?`)) return;
    db.info.cats = db.info.cats.filter(x => x !== c);
    db.info.notes = db.info.notes.filter(n => n.cat !== c.id);
    dlg.close();
    save();
  };
  ask('카테고리', [{ key: 'name', label: '이름', value: c.name, required: true }], v => { c.name = v.name.trim(); save(); }, [del]);
}

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
  // 묶음 순서: 막대를 끌어 다른 막대 위(위쪽 절반 = 앞, 아래쪽 절반 = 뒤)에 놓으면 바뀜 (db.docGroupOrder). 색은 원래 순서대로 고정
  const order = db.docGroupOrder || [], rank = gid => (order.includes(gid) ? order.indexOf(gid) : 999 + F.groups.findIndex(([g]) => g === gid));
  const groups = F.groups.map(([gid, gname], gi) => ({ gid, gname, gi })).filter(g => F.list.some(f => f.group === g.gid)).sort((a, b) => rank(a.gid) - rank(b.gid));
  const folded = new Set(layout.docFold || []); // 접은 묶음 (이 브라우저에만)
  groups.forEach(({ gid, gname, gi }) => {
    const fs = F.list.filter(f => f.group === gid), shut = folded.has(gid);
    const head = h('div', 'cat-head static drag', h('span', 'caret', shut ? '▸' : '▾'), h('span', 'cat-name', gname), h('span', 'cat-count', String(fs.length)));
    head.style.setProperty('--c', PALETTE[gi % PALETTE.length]);
    head.draggable = true;
    head.title = '누르면 접기·펴기 · 끌어서 순서 바꾸기';
    head.onclick = () => { if (shut) folded.delete(gid); else folded.add(gid); layout.docFold = [...folded]; saveLayout(); render(); };
    const side = e => (e.offsetY > head.offsetHeight / 2 ? 'after' : 'before');
    head.ondragstart = e => { e.dataTransfer.setData('text/x-docgroup', gid); e.dataTransfer.effectAllowed = 'move'; };
    head.ondragover = e => {
      if (!e.dataTransfer.types.includes('text/x-docgroup')) return;
      e.preventDefault();
      head.classList.toggle('drop-before', side(e) === 'before');
      head.classList.toggle('drop-after', side(e) === 'after');
    };
    head.ondragleave = () => head.classList.remove('drop-before', 'drop-after');
    head.ondrop = e => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/x-docgroup');
      if (!from || from === gid) return head.classList.remove('drop-before', 'drop-after');
      const ids = groups.map(g => g.gid).filter(x => x !== from);
      ids.splice(ids.indexOf(gid) + (side(e) === 'after' ? 1 : 0), 0, from);
      db.docGroupOrder = ids;
      save();
    };
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
  const me = h('button', 'cat-new', '👤 내 정보 (소속·성명·도장·서명)');
  me.onclick = editProfile;
  $('formList').replaceChildren(h('h2', 'note-list-title', '서류'), ...list, me);
  const f = form(selForm);
  $('docMain').replaceChildren(...(selForm === TRIPS ? tripPage() : pagesOf(f).length ? docPage(f) : formTodo(f)));
  fitAll(); // 붙인 바로 뒤에 잼 (탭이 안 보이면 건너뜀)
}

function formTodo(f) {
  return [h('div', 'panel todo-card',
    h('div', 'note-head', h('span', 'todo-emoji', f.emoji), h('h2', null, f.title), h('span', 'tag', f.note ? '안내' : '준비 중')),
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
  }), add);
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

// ---------- 재고: 살림노트 장보기처럼 '전체'(늘 쓰는 것)에서 떨어진 것만 '살 것'으로 → 주문 → 받음 ----------
// db.stock.items { id, cat, name, maker, catNo, place, memo, need } · db.orders { id, item, name, vendor, qty, amount(천원), date, line, got, memo, doc }
// 주문의 line(세목 항목)에 금액이 집행으로 더해짐 (lineSpent). 중앙구매 기준을 넘으면 규격서를 바로 만들 수 있음
let stockView = null, stockFocus = null; // stockView: 'need' | 'orders' | 묶음 id · stockFocus: 다시 그린 뒤 커서를 돌려놓을 입력칸
const stockItem = id => db.stock.items.find(it => it.id === id);
const stockCat = id => db.stock.cats.find(c => c.id === id);
const openOrder = it => db.orders.find(o => o.item === it.id && !o.got);
const isoToday = () => `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}-${String(TODAY.getDate()).padStart(2, '0')}`;
const daysSince = iso => Math.round((Date.parse(isoToday()) - Date.parse(iso)) / 864e5);
const LATE_DAYS = 14; // 주문하고 이만큼 지나도 못 받으면 주황색 + 한눈에 알림
const sameName = (a, b) => a.replace(/\s/g, '').toLowerCase() === b.replace(/\s/g, '').toLowerCase();
// 중앙구매 기준 (천원, 설정에서 시행 월과 함께 바꿈 — 주문일의 기준으로 판단): 장비·비품 equip 초과 → 비품 규격서, 소모품·시약 other 초과 → 소모품 규격서
const centralOf = o => {
  const eq = !!stockCat(stockItem(o.item)?.cat)?.equip, c = centralAt((o.date || isoToday()).slice(0, 7));
  return o.amount > (eq ? c.equip : c.other) ? (eq ? 'buy-spec' : 'buy-supply') : null;
};
const centralText = (m = NOW) => { const c = centralAt(m); return `장비·비품 ${fmtM(c.equip)}만원 초과, 소모품·시약 ${fmtM(c.other)}만원 초과`; };

// 왼쪽: 살 것 · 주문 기록 + 묶음 막대(누르면 오른쪽에 그 묶음, 아래로 펼치지 않음) / 오른쪽: 고른 것 하나
function renderStock() {
  const S = db.stock, need = S.items.filter(it => it.need), waiting = db.orders.filter(o => !o.got).length;
  if (!['need', 'orders', 'map', 'vendors'].includes(stockView) && !stockCat(stockView)) stockView = need.length || !S.cats.length ? 'need' : S.cats[0].id;
  const pick = (v, ...kids) => { const b = h('button', cls('note-row', stockView === v && 'on'), ...kids); b.onclick = () => { stockView = v; render(); }; return b; };
  const cats = S.cats.map((c, i) => {
    const n = S.items.filter(it => it.cat === c.id).length, b = h('button', cls('cat-head pick', stockView === c.id && 'on'), h('span', 'cat-name', c.name), h('span', 'cat-count', String(n)));
    b.style.setProperty('--c', PALETTE[i % PALETTE.length]);
    b.onclick = () => { stockView = c.id; render(); };
    return b;
  });
  const addCat = h('button', 'cat-new', '+ 묶음');
  addCat.onclick = () => editStockCat(null);
  $('stockList').replaceChildren(h('h2', 'note-list-title', '재고'),
    pick('need', h('span', 'note-emoji', '🛒'), h('span', 'note-title', '살 것'), h('span', 'note-meta', String(need.length))),
    pick('orders', h('span', 'note-emoji', '🧾'), h('span', 'note-title', '주문 기록'), h('span', 'note-meta', waiting ? `기다림 ${waiting}` : String(db.orders.length))),
    pick('map', h('span', 'note-emoji', '🗺️'), h('span', 'note-title', '보관 위치'), h('span', 'note-meta', String(S.places.length))),
    pick('vendors', h('span', 'note-emoji', '🏢'), h('span', 'note-title', '업체'), h('span', 'note-meta', String(S.vendors.rows.length))),
    ...cats, addCat);
  const vendors = () => [h('div', 'panel-head plain', h('h2', null, '업체 연락처'), h('span', 'hint', '주문하기에서 업체를 여기서 골라요 · 랩 멤버도 같이 봐요')), tableBody(S.vendors)];
  const main = { need: stockNeed, orders: () => [stockOrders()], map: () => [stockMap()], vendors }[stockView];
  $('stockMain').replaceChildren(...(main ? main() : [stockCatPanel(stockCat(stockView))]));
  if (stockFocus) { document.querySelector(stockFocus)?.focus(); stockFocus = null; }
}

// 품목 한 줄: 왼쪽 표시 + 이름(제조사·Cat. No.·위치·쓰이는 프로토콜) + 오른쪽 버튼들. hideProto = 지금 보고 있는 프로토콜은 빼고
function stockRow(it, mark, tools = [], hideProto = null) {
  const protos = (it.protocols || []).filter(id => id !== hideProto).map(id => protoOf(id)?.name).filter(Boolean).map(n => `🧪 ${n}`);
  const meta = [it.maker, it.catNo, placeOf(it.place)?.name, it.memo, ...protos].filter(Boolean).join(' · ');
  return h('div', cls('stock-row', it.need && 'need'), mark, h('div', 'stock-name', h('span', null, it.name), meta ? h('small', null, meta) : null), h('div', 'row-tools', tools));
}
// 이름을 적어 Enter. pickFrom 이 있으면 그 품목들에서 골라 넣을 수도 있음 (목록에 없으면 새 품목은 '기타' 묶음에)
function stockAdder(key, placeholder, onName, pickFrom = null) {
  const inp = h('input', 'stock-add');
  inp.enterKeyHint = 'enter'; // 모바일에서도 '다음' 대신 Enter = 추가
  inp.placeholder = placeholder;
  inp.dataset.adder = key;
  const commit = () => { const name = inp.value.trim(); if (!name) return; stockFocus = `[data-adder="${key}"]`; onName(name); };
  inp.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) commit(); };
  if (!pickFrom) return [inp];
  const dl = h('datalist', null, pickFrom.map(it => Object.assign(h('option'), { value: it.name })));
  dl.id = `dl-${key}`;
  inp.setAttribute('list', dl.id);
  inp.addEventListener('input', e => { if (e.inputType === 'insertReplacementText' || !e.inputType) commit(); }); // 목록에서 고르면 바로
  return [inp, dl];
}
const newStockItem = name => { const it = { id: uid(), cat: (stockCat('etc') || db.stock.cats[0]).id, name }; db.stock.items.push(it); return it; };

function stockNeed() {
  const todo = db.stock.items.filter(it => it.need && !openOrder(it));
  const waiting = db.orders.filter(o => !o.got).sort((a, b) => a.date.localeCompare(b.date));
  const adder = stockAdder('need', '+ 살 것 추가 (목록에서 찾기)', name => {
    (db.stock.items.find(x => sameName(x.name, name)) || newStockItem(name)).need = true;
    save();
  }, db.stock.items.filter(it => !it.need));
  const todoRows = todo.map(it => {
    const order = h('button', 'btn small primary', '주문하기');
    order.onclick = () => editOrder(null, it);
    const drop = h('button', 'link-btn', '빼기');
    drop.title = '살 것에서 빼요. 전체 목록에는 그대로 있어요';
    drop.onclick = () => { it.need = false; save(); };
    return stockRow(it, h('span', 'cat-chip', stockCat(it.cat)?.name ?? ''), [drop, order]);
  });
  const waitRows = waiting.map(o => {
    const it = stockItem(o.item), days = daysSince(o.date);
    const info = [o.vendor, o.qty, o.amount != null ? `${fmt(o.amount)}천원` : null, o.by ? `주문 ${o.by}` : null, fundText(o)];
    const got = h('button', 'btn small primary', '받음');
    got.onclick = () => { o.got = isoToday(); if (it) it.need = false; save(); };
    const edit = h('button', 'btn small', '고치기');
    edit.onclick = () => editOrder(o, it);
    return h('div', 'stock-row order', h('span', cls('days', days >= LATE_DAYS && 'late'), days ? `${days}일째` : '오늘'),
      h('div', 'stock-name', h('span', null, it?.name ?? o.name), h('small', cls(!fundSet(o) && 'warn-txt'), info.filter(Boolean).join(' · '))),
      h('div', 'row-tools', isMember() ? null : specButton(o, it), edit, got));
  });
  return [
    h('div', 'panel stock-sec', h('div', 'panel-head', h('h2', null, '주문 전'), h('span', 'hint', `${todo.length} · 왼쪽 묶음에서 누르거나 여기 적으면 살 것이 돼요 · 받으면 다시 묶음으로`)), ...adder,
      todoRows.length ? todoRows : h('p', 'hint stock-empty', '살 것이 없어요. 위에 적거나, 왼쪽 묶음에서 눌러 표시해요.')),
    h('div', 'panel stock-sec', h('div', 'panel-head', h('h2', null, '주문함 · 도착 기다림'), h('span', 'hint', String(waiting.length))),
      waitRows.length ? waitRows : h('p', 'hint stock-empty', '기다리는 주문이 없어요.')),
  ];
}

// 중앙구매 기준을 넘는 주문 → 규격서 만들기(주문 내용으로 첫 칸 채움) / 만든 뒤엔 열기
function specButton(o, it) {
  const fid = centralOf(o);
  if (!fid) return null;
  const f = form(fid), doc = db.docs.find(d => d.id === o.doc);
  const b = h('button', 'btn small make', doc ? `${f.emoji} 규격서 열기` : `중앙구매 · ${f.title} 만들기`);
  b.title = `중앙구매 대상이에요 (주문일 기준: ${centralText(o.date.slice(0, 7))})`;
  b.onclick = () => {
    let d = doc;
    if (!d) {
      d = makeDoc(f, { title: `${o.name} — ${f.title}` });
      for (const [k, v] of Object.entries(f.fromOrder({ ...o, maker: it?.maker, catNo: it?.catNo }))) if (v) d.fields[k] = v;
      o.doc = d.id;
    }
    selForm = fid; selDoc = d.id;
    tab = 'docs';
    save();
  };
  return b;
}

// 묶음 하나: 줄을 누르면 살 것 표시(●)를 켜고 끔
function stockCatPanel(c) {
  const items = db.stock.items.filter(it => it.cat === c.id);
  const rows = items.map(it => {
    const edit = h('button', 'link-btn', '✎');
    edit.title = '고치기';
    edit.onclick = e => { e.stopPropagation(); editStockItem(it); };
    const row = stockRow(it, h('span', cls('mark', it.need && 'on')), [openOrder(it) ? h('span', 'tag', '주문함') : null, edit]);
    row.classList.add('tap');
    row.title = it.need ? '눌러서 살 것에서 빼기' : '눌러서 살 것으로 표시';
    row.onclick = () => { it.need = !it.need; save(); };
    return row;
  });
  const edit = h('button', 'btn small', '묶음 고치기');
  edit.onclick = () => editStockCat(c);
  return h('div', 'panel stock-sec', h('div', 'panel-head', h('h2', null, c.name), c.equip ? h('span', 'tag', '장비·비품') : null,
    h('span', 'hint', `${items.length}개 · 줄을 누르면 살 것으로 (● = 살 것)`), h('span', 'spacer'), edit),
    ...stockAdder(c.id, '+ 항목 추가', name => { db.stock.items.push({ id: uid(), cat: c.id, name }); save(); }),
    rows.length ? rows : h('p', 'hint stock-empty', '아직 없어요. 위에 이름을 적고 Enter.'));
}

// ---------- 프로토콜 탭 (연구실 — 랩 멤버와 같이 씀): 묶음 → 프로토콜. 프로토콜 = 본문 노트 + 재료(재고 품목, it.protocols = [id]) ----------
// 여럿이 동시에 고칠 수 있어서 sync.js가 프로토콜을 한 건씩 따로 저장함 (labs/{PI}/protocols/{id})
let selProto = null;
const protoItems = p => db.stock.items.filter(it => it.protocols?.includes(p.id));
const protoOf = id => db.stock.protocols.find(p => p.id === id);
function renderProtocol() {
  const S = db.stock, folded = new Set(layout.protoFold || []); // 접은 묶음 (이 브라우저에만)
  if (!protoOf(selProto)) selProto = S.protocols[0]?.id ?? null;
  const row = p => {
    const items = protoItems(p), need = items.filter(it => it.need).length;
    const b = h('button', cls('note-row', p.id === selProto && 'on'), h('span', 'note-emoji', '🧪'), h('span', 'note-title', p.name), h('span', 'note-meta', need ? `살 것 ${need}` : String(items.length)));
    b.title = `재료 ${items.length}개${need ? ` · 살 것 ${need}` : ''}`;
    b.onclick = () => { selProto = p.id; editKey = null; render(); };
    return b;
  };
  const list = S.protoGroups.flatMap((g, gi) => {
    const ps = S.protocols.filter(p => p.group === g.id), shut = folded.has(g.id);
    const edit = h('button', 'link-btn', '✎');
    edit.title = '묶음 고치기';
    edit.onclick = e => { e.stopPropagation(); editProtoGroup(g); };
    const add = h('button', 'cat-add', '+');
    add.title = '이 묶음에 새 프로토콜';
    add.onclick = e => { e.stopPropagation(); editProtocol(null, g.id); };
    const head = h('div', 'cat-head', h('span', 'caret', shut ? '▸' : '▾'), h('span', 'cat-name', g.name), h('span', 'cat-count', String(ps.length)), edit, add);
    head.style.setProperty('--c', PALETTE[(gi + 3) % PALETTE.length]);
    head.title = '누르면 접기·펴기';
    head.onclick = () => { if (shut) folded.delete(g.id); else folded.add(g.id); layout.protoFold = [...folded]; saveLayout(); render(); };
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
  const edit = h('button', 'btn small', '이름·묶음');
  edit.onclick = () => editProtocol(p);
  const print = h('button', 'btn small', '🖨 인쇄 / PDF');
  print.title = '실험대에 두고 볼 수 있게 A4로 인쇄해요 (인쇄 창에서 PDF로 저장도 돼요)';
  print.onclick = () => printProtocol(p);
  const head = h('div', 'panel-head proto-title', h('h2', null, p.name), g ? h('span', 'tag', g.name) : null, p.memo ? h('span', 'hint', p.memo) : null,
    p.updatedAt ? h('span', 'hint', `고친 날 ${p.updatedAt.slice(2).replaceAll('-', '.')}`) : null, h('span', 'spacer'), print, write, edit);
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
  ask(g ? '프로토콜 묶음 고치기' : '새 프로토콜 묶음', [{ key: 'name', label: '이름', value: g?.name ?? '', required: true, placeholder: '예: NGS, 세포 배양' }], v => {
    const t = g || { id: uid() };
    t.name = v.name.trim();
    if (!g) db.stock.protoGroups.push(t);
    save();
  }, del ? [h('p', null, del)] : []);
}
function editProtocol(p, group) {
  const del = p ? h('button', 'btn danger small', '이 프로토콜 지우기') : null;
  if (del) {
    del.type = 'button';
    del.onclick = () => {
      if (!confirm(`'${p.name}'을(를) 지울까요? 재료(품목)는 재고에 그대로 남아요.`)) return;
      for (const it of db.stock.items) if (it.protocols) it.protocols = it.protocols.filter(x => x !== p.id);
      db.stock.protocols = db.stock.protocols.filter(x => x !== p);
      selProto = null;
      dlg.close(); save();
    };
  }
  ask(p ? '프로토콜 고치기' : '새 프로토콜', [
    { key: 'name', label: '이름', value: p?.name ?? '', required: true, placeholder: '예: 라이브러리 제작' },
    { key: 'group', label: '묶음', type: 'select', options: db.stock.protoGroups.map(g => [g.id, g.name]), value: p?.group ?? group },
    { key: 'memo', label: '한 줄 메모', value: p?.memo ?? '', placeholder: '예: 키트 버전, 샘플 8개 기준' },
  ], v => {
    const t = p || { id: uid(), updatedAt: isoToday() };
    Object.assign(t, { name: v.name.trim(), group: v.group, memo: v.memo.trim() || undefined });
    if (!p) { db.stock.protocols.push(t); selProto = t.id; editKey = `pn:${t.id}`; } // 새로 만들면 바로 본문 쓰기
    save();
  }, del ? [h('p', null, del)] : []);
}

// ---- 보관 위치 지도: 위치 하나 = 색 칸 하나(선 그림 + 품목 칩). 누르면 그곳만 진하게, 칩을 끌어 다른 칸에 놓으면 위치가 바뀜 ----
const PLACE_KINDS = { // 그림은 40×40 선 그림
  fridge: { label: '냉장고', temp: '4°C', color: '#5B9BEA', svg: '<rect x="10" y="4" width="20" height="32" rx="3"/><path d="M10 15h20M14 8.5v3M14 19v5"/>' },
  freezer: { label: '냉동고', temp: '−20°C', color: '#4FB3D9', svg: '<rect x="10" y="4" width="20" height="32" rx="3"/><path d="M14 8v3M20 16v14M14 19.5l12 7M26 19.5l-12 7"/>' },
  deep: { label: '초저온 냉동고', temp: '−80°C', color: '#7C6FE0', svg: '<rect x="7" y="4" width="26" height="32" rx="3"/><rect x="11" y="8" width="9" height="4" rx="1"/><path d="M20 17v14M14 20.5l12 7M26 20.5l-12 7"/>' },
  cabinet: { label: '시약장', temp: '실온', color: '#E8B10C', svg: '<rect x="6" y="5" width="28" height="30" rx="2"/><path d="M20 5v30M16.5 19v3M23.5 19v3M11 10h4M12 10v3l-2.5 5h7L14 13v-3"/>' },
  drawer: { label: '서랍', temp: '실온', color: '#B39B7A', svg: '<rect x="5" y="7" width="30" height="27" rx="2"/><path d="M5 16h30M5 25h30M17 11.5h6M17 20.5h6M17 29.5h6"/>' },
  shelf: { label: '선반', temp: '실온', color: '#8B93A1', svg: '<path d="M6 5v30M34 5v30M6 14h28M6 24h28M6 34h28M10 24v-6h4v6M17 24v-4h5v4M24 14v-6h4v6"/>' },
  bench: { label: '실험대', temp: '실온', color: '#2BB39A', svg: '<path d="M3 18h34M7 18v16M33 18v16M7 27h26M12 18v-5h5v5M22 18v-9h3v9"/>' },
  etc: { label: '기타', temp: '', color: '#8B93A1', svg: '<rect x="7" y="9" width="26" height="24" rx="3"/><path d="M7 16h26"/>' },
};
const placeOf = id => db.stock.places.find(p => p.id === id);
const kindOf = p => PLACE_KINDS[p?.kind] || PLACE_KINDS.etc;
function placeIcon(p) {
  const s = h('span', 'place-icon');
  s.innerHTML = p ? `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${kindOf(p).svg}</svg>` : '?';
  return s;
}
const catColor = id => PALETTE[Math.max(0, db.stock.cats.findIndex(c => c.id === id)) % PALETTE.length]; // 왼쪽 묶음 막대와 같은 색
let mapSel = null; // { place: id | null(위치 미정) } 또는 { item: id }

function stockMap() {
  const S = db.stock, selItem = mapSel?.item ? stockItem(mapSel.item) : null;
  const selPlace = selItem ? (placeOf(selItem.place)?.id ?? null) : mapSel && 'place' in mapSel ? mapSel.place : undefined; // undefined = 고른 것 없음
  const chip = it => {
    const c = h('button', cls('item-chip', it.need && 'need', selItem === it && 'on'), h('span', 'dot'), it.name);
    c.style.setProperty('--cc', catColor(it.cat));
    c.title = `${stockCat(it.cat)?.name ?? ''}${it.need ? ' · 살 것' : ''} — 끌어서 다른 위치로`;
    c.draggable = true;
    c.ondragstart = e => { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move'; };
    c.onclick = () => { mapSel = selItem === it ? null : { item: it.id }; render(); };
    return c;
  };
  const zones = [...S.places.map(p => [p, S.items.filter(it => it.place === p.id)]), [null, S.items.filter(it => !placeOf(it.place))]];
  const cards = zones.filter(([p, items]) => p || items.length).map(([p, items]) => {
    const id = p?.id ?? null, k = kindOf(p), need = items.filter(it => it.need).length;
    const card = h('div', cls('place-card', !p && 'none', selPlace !== undefined && (selPlace === id ? 'on' : 'dim')),
      h('div', 'place-head', placeIcon(p), h('div', 'place-name', h('b', null, p?.name ?? '위치 미정'),
        h('small', null, [p ? p.temp || k.temp : '', `${items.length}개`, need ? `살 것 ${need}` : ''].filter(Boolean).join(' · ')))),
      h('div', 'place-items', items.length ? items.map(chip) : h('span', 'hint', '비어 있어요')));
    card.style.setProperty('--pc', p ? k.color : '#8B93A1');
    card.onclick = e => { if (e.target.closest('.item-chip')) return; mapSel = selPlace === id && !selItem ? null : { place: id }; render(); };
    card.ondragover = e => { e.preventDefault(); card.classList.add('drop'); };
    card.ondragleave = () => card.classList.remove('drop');
    card.ondrop = e => {
      e.preventDefault();
      const it = stockItem(e.dataTransfer.getData('text/plain'));
      if (it) { it.place = id || undefined; mapSel = { item: it.id }; save(); }
    };
    return card;
  });
  const add = h('button', 'place-card add', '+ 위치');
  add.onclick = () => editPlace(null);
  const legend = h('div', 'map-legend', S.cats.map(c => h('span', null, h('span', 'dot'), c.name)).map((el, i) => { el.style.setProperty('--cc', catColor(S.cats[i].id)); return el; }),
    h('span', null, h('span', 'dot ring'), '살 것'));
  return h('div', 'panel', h('div', 'panel-head', h('h2', null, '보관 위치'), h('span', 'hint', '위치를 누르면 그곳만 · 품목을 누르면 아래에 자세히 · 품목을 끌어 다른 위치에 놓으면 옮겨져요'), h('span', 'spacer'), legend),
    h('div', 'place-map', cards, add), mapInfo(selItem, selPlace));
}
// 지도 아래 한 줄: 고른 품목 또는 위치의 자세한 내용과 버튼
function mapInfo(it, pid) {
  if (it) {
    const p = placeOf(it.place), toggle = h('button', cls('btn small', !it.need && 'primary'), it.need ? '살 것에서 빼기' : '살 것으로');
    toggle.onclick = () => { it.need = !it.need; save(); };
    const edit = h('button', 'btn small', '고치기');
    edit.onclick = () => editStockItem(it);
    return h('div', 'map-info', h('b', null, it.name), [stockCat(it.cat)?.name, p ? `${p.name}${kindOf(p).temp ? ` (${p.temp || kindOf(p).temp})` : ''}` : '위치 미정', it.maker, it.catNo, it.memo,
      ...(it.protocols || []).map(id => protoOf(id)?.name).filter(Boolean).map(n => `🧪 ${n}`)].filter(Boolean).map(t => h('span', 'tag', t)),
      openOrder(it) ? h('span', 'hint', '주문함') : null, h('span', 'spacer'), toggle, edit);
  }
  if (pid !== undefined) {
    const p = placeOf(pid), items = db.stock.items.filter(x => (p ? x.place === p.id : !placeOf(x.place)));
    const edit = p ? h('button', 'btn small', '위치 고치기') : null;
    if (edit) edit.onclick = () => editPlace(p);
    return h('div', 'map-info', h('b', null, p?.name ?? '위치 미정'), p ? h('span', 'tag', [kindOf(p).label, p.temp || kindOf(p).temp].filter(Boolean).join(' · ')) : null,
      p?.memo ? h('span', 'hint', p.memo) : null, h('span', 'hint', `품목 ${items.length}개 · 살 것 ${items.filter(x => x.need).length}개`), h('span', 'spacer'), edit);
  }
  return h('div', 'map-info empty', h('span', 'hint', '위치나 품목을 눌러 보세요.'));
}
function editPlace(p) {
  const n = p ? db.stock.items.filter(it => it.place === p.id).length : 0;
  const del = p ? h('button', 'btn danger small', '이 위치 지우기') : null;
  if (del) {
    del.type = 'button';
    del.onclick = () => {
      if (n && !confirm(`'${p.name}'에 있는 품목 ${n}개는 '위치 미정'이 돼요. 지울까요?`)) return;
      for (const it of db.stock.items) if (it.place === p.id) delete it.place;
      db.stock.places = db.stock.places.filter(x => x !== p);
      mapSel = null; dlg.close(); save();
    };
  }
  ask(p ? '위치 고치기' : '새 보관 위치', [
    { key: 'name', label: '이름', value: p?.name ?? '', required: true, placeholder: '예: 2번 냉장고' },
    [{ key: 'kind', label: '종류 (그림·색)', type: 'select', options: Object.entries(PLACE_KINDS).map(([k, x]) => [k, x.temp ? `${x.label} · ${x.temp}` : x.label]), value: p?.kind ?? 'fridge' },
      { key: 'temp', label: '온도 (비우면 종류대로)', value: p?.temp ?? '', placeholder: '예: 4°C' }],
    { key: 'memo', label: '어디에 (메모)', value: p?.memo ?? '', placeholder: '예: 3층 실험실 창가' },
  ], v => {
    const t = p || { id: uid() };
    Object.assign(t, { name: v.name.trim(), kind: v.kind, temp: v.temp.trim() || undefined, memo: v.memo.trim() || undefined });
    if (!p) db.stock.places.push(t);
    mapSel = { place: t.id };
    save();
  }, del ? [h('p', null, del)] : []);
}

let orderYear = null; // 주문 기록에서 볼 해 (처음엔 올해)
function stockOrders() {
  const thisYear = TODAY.getFullYear(), years = [...new Set([thisYear, ...db.orders.map(o => +o.date.slice(0, 4))])].sort((a, b) => b - a);
  if (!years.includes(orderYear)) orderYear = thisYear;
  const seg = h('div', 'seg', years.map(y => { const b = h('button', cls(y === orderYear && 'on'), `${y}년`); b.type = 'button'; b.onclick = () => { orderYear = y; render(); }; return b; }));
  const os = db.orders.filter(o => +o.date.slice(0, 4) === orderYear).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const head = h('div', 'panel-head', h('h2', null, '주문 기록'), seg, h('span', 'hint', '금액 단위 천원 · 줄을 누르면 고쳐요'));
  if (!os.length) return h('div', 'panel', head, h('p', 'hint', db.orders.length ? `${orderYear}년 주문은 없어요.` : '아직 주문이 없어요. ‘살 것’에서 주문하기를 누르면 여기 쌓여요.'));
  const md = iso => iso ? `${iso.slice(2, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)}` : '';
  // 열: [키, 머리글, 기본 너비(px), 칸 class, 값]. 머리칸 오른쪽 끝을 끌면 너비가 바뀌고 이 브라우저에 저장 (layout.orderW)
  const OCOLS = [
    ['date', '주문일', 84, null, o => md(o.date)], ['name', '품목', 220, null, o => o.name], ['vendor', '업체', 120, null, o => o.vendor || ''],
    ['qty', '수량', 90, null, o => o.qty || ''], ['amount', '금액', 80, 'r', o => o.amount != null ? fmt(o.amount) : '–'], ['by', '주문자', 80, null, o => o.by || ''],
    ['fund', '재원 · 세목 항목', 220, null, fundText], ['got', '받은 날', 84, null, o => o.got ? md(o.got) : h('span', 'tag', '기다림')],
  ];
  layout.orderW ||= {};
  const widthOf = ([k, , d]) => layout.orderW[k] || d, DEL = 34;
  const cols = OCOLS.map(c => { const col = h('col'); col.style.width = `${widthOf(c)}px`; return col; });
  const table = h('table', 'tbl itable otable');
  const fit = () => { table.style.width = `${OCOLS.reduce((a, c) => a + widthOf(c), 0) + DEL}px`; };
  const thead = h('tr', null, OCOLS.map((c, i) => h('th', c[3], c[1], colGrip(w => { layout.orderW[c[0]] = w; cols[i].style.width = `${w}px`; fit(); }, saveLayout, 50))), h('th'));
  const body = os.map(o => {
    const del = h('button', 'link-btn', '×');
    del.title = '이 주문 지우기';
    del.onclick = e => { e.stopPropagation(); if (confirm(`'${o.name}' 주문을 지울까요? 집행에서도 빠져요.`)) { db.orders = db.orders.filter(x => x !== o); save(); } };
    const tr = h('tr', 'click', OCOLS.map(([k, , , c, get]) => h('td', cls(c, k === 'fund' && !fundSet(o) && 'warn-txt'), get(o))), h('td', null, del));
    tr.onclick = () => editOrder(o, stockItem(o.item));
    return tr;
  });
  const none = os.filter(o => !fundSet(o)).length;
  const foot = OCOLS.map(([k, , , c]) => h('td', c, k === 'date' ? '합계' : k === 'amount' ? fmt(sum(os)) : k === 'fund' && none ? `재원 미정 ${none}건` : ''));
  const col0 = h('col');
  col0.style.width = `${DEL}px`;
  table.append(h('colgroup', null, cols, col0), h('thead', null, thead), h('tbody', null, body), h('tfoot', null, h('tr', null, foot, h('td'))));
  fit();
  return h('div', 'panel', head, h('div', 'tbl-wrap', table), h('p', 'hint', '머리칸 오른쪽 끝을 끌면 열 너비가 바뀌어요'));
}
// 재원 표시: PI는 과제·연차·항목, 랩 멤버(학생)는 세목 항목을 볼 수 없으니 '정해짐/미정'만
const fundSet = o => (isMember() ? !!o.line : !!lineOf(o.line));
const fundText = o => { const l = lineOf(o.line), g = l && grant(l.grant); return g ? `${g.emoji} ${g.name} ${l.n}차 · ${l.name}` : fundSet(o) ? '재원 정해짐' : '재원 미정'; };

// 업체 고르기: 재고 🏢 업체 표의 업체 칸 (옆에 분야·전화) + 지난 주문에 적은 업체
function vendorList() {
  const n = db.stock.vendors, out = new Map();
  const col = n && (n.columns.find(c => c.name.includes('업체')) || n.columns[1]);
  for (const r of col ? n.rows : []) {
    const v = r.cells[col.id]?.trim();
    if (v) out.set(v, n.columns.filter(c => c !== col).map(c => r.cells[c.id]?.trim()).filter(Boolean).slice(0, 2).join(' · '));
  }
  for (const o of db.orders) if (o.vendor && !out.has(o.vendor)) out.set(o.vendor, '지난 주문');
  return [...out];
}

// 주문 창: 재원은 세목 항목(과제·연차·항목)으로 골라야 집행에 더해짐. 항목은 주문일이 든 연차 것만 보임
function editOrder(o, it) {
  const label = l => { const g = grant(l.grant); return `${g.emoji} ${g.name} ${l.n}차 · ${l.name}${l.cat ? ` · ${l.cat}` : ''}`; };
  const lines = sortedGrants().flatMap(g => db.lines.filter(l => l.grant === g.id).sort((a, b) => a.n - b.n));
  const inPeriod = (l, m) => { const g = grant(l.grant); if (!g?.start) return true; const pd = periods(g).find(p => p.n === l.n); return !!pd && between(m, pd.from, pd.to); };
  const linesFor = m => lines.filter(l => inPeriod(l, m) || l.id === o?.line); // 고치는 주문의 원래 항목은 남겨 둠
  const last = it && db.orders.filter(x => x.item === it.id && x !== o).sort((a, b) => b.date.localeCompare(a.date))[0]; // 지난번 주문을 기본값으로
  const name = it?.name ?? o.name, member = isMember();
  const me = window.currentUser?.name || (member ? '' : db.profile?.name) || ''; // 주문자 기본값 = 로그인한 사람
  const people = [...new Set([me, ...(member ? [] : db.people.filter(p => !p.virtual).map(p => p.name)), ...db.orders.map(x => x.by)].filter(Boolean))];
  ask(o ? `주문 고치기 — ${name}` : `${name} — 주문`, [
    [{ key: 'vendor', label: '업체', value: o?.vendor ?? last?.vendor ?? '', suggest: vendorList(), placeholder: '업체 연락처에서 고르거나 적기' }, { key: 'qty', label: '수량', value: o?.qty ?? last?.qty ?? '', placeholder: '예: 2 box' }],
    [{ key: 'amount', label: '금액 (천원, VAT 포함)', type: 'number', step: '0.1', value: o?.amount ?? '' }, { key: 'date', label: '주문일', type: 'date', value: o?.date ?? isoToday(), required: true }],
    { key: 'by', label: '주문자', value: o?.by ?? me, suggest: people.map(p => [p, '']), placeholder: '누가 주문했는지' },
    member ? null : { key: 'line', label: '재원 · 세목 항목 (금액이 이 항목 집행에 더해져요)', type: 'select', options: [['', '나중에 정하기']], value: '' }, // 아래 refill이 채움
    o ? { key: 'got', label: '받은 날 (비우면 아직 안 옴)', type: 'date', value: o.got || '' } : null,
    { key: 'memo', label: '메모', value: o?.memo ?? '' },
  ].filter(Boolean), v => {
    const rec = o || { id: uid(), item: it.id, name: it.name, got: null };
    Object.assign(rec, { vendor: v.vendor.trim(), qty: v.qty.trim(), amount: v.amount === '' ? null : +v.amount, date: v.date, by: v.by.trim() || undefined, memo: v.memo.trim() });
    if (!member) rec.line = v.line || null; // 재원은 PI만 정함
    if (o) { rec.got = v.got || null; if (it) it.need = !rec.got; } else { db.orders.push(rec); it.need = true; }
    save();
  }, [h('p', 'hint', member ? '재원(과제·세목)은 PI가 정해요.' : `중앙구매 기준: ${centralText()} — 넘으면 주문함에서 규격서를 바로 만들 수 있어요. (기준은 설정에서 바꿔요)`)]);
  if (member) return;
  // 주문일을 바꾸면 그 날짜가 든 연차의 항목으로 다시 채움 (고른 항목이 그 연차에 없으면 '나중에'로)
  const { date: dateEl, line: lineEl } = $('dlgForm').elements, note = h('small', 'hint field-note');
  lineEl.after(note);
  const refill = cur => {
    const m = dateEl.value.slice(0, 7), ls = linesFor(m);
    lineEl.replaceChildren(...[['', '나중에 정하기'], ...ls.map(l => [l.id, label(l)])].map(([v, t]) => Object.assign(h('option', null, t), { value: v, selected: v === cur })));
    note.textContent = !m ? '' : ls.length ? `주문일(${mDot(m)}) 연차의 항목만 보여요` : `주문일(${mDot(m)}) 연차엔 아직 세목 항목이 없어요 — 재원별 예산에서 넣거나 나중에 정해요`;
  };
  dateEl.addEventListener('change', () => refill(lineEl.value));
  refill(o?.line ?? last?.line ?? '');
}

function editStockItem(it) {
  const del = h('button', 'btn danger small', '이 품목 지우기');
  del.type = 'button';
  del.onclick = () => { if (confirm(`'${it.name}'을(를) 목록에서 지울까요? 주문 기록은 남아요.`)) { db.stock.items = db.stock.items.filter(x => x !== it); dlg.close(); save(); } };
  ask('품목 고치기', [
    { key: 'name', label: '이름', value: it.name, required: true },
    [{ key: 'cat', label: '묶음', type: 'select', options: db.stock.cats.map(c => [c.id, c.name]), value: it.cat },
      { key: 'place', label: '보관 위치', type: 'select', options: [['', '위치 미정'], ...db.stock.places.map(p => [p.id, p.name])], value: placeOf(it.place) ? it.place : '' }],
    [{ key: 'maker', label: '제조사', value: it.maker || '' }, { key: 'catNo', label: 'Cat. No.', value: it.catNo || '' }],
    { key: 'memo', label: '메모', value: it.memo || '' },
  ], v => { for (const k of ['name', 'cat', 'place', 'maker', 'catNo', 'memo']) it[k] = v[k].trim() || undefined; it.name ||= '이름 없음'; save(); }, [h('p', null, del)]);
}
function editStockCat(c) {
  const items = c ? db.stock.items.filter(it => it.cat === c.id) : [];
  const del = c ? h('button', 'btn danger small', '이 묶음 지우기') : null;
  if (del) {
    del.type = 'button';
    del.disabled = items.length > 0;
    del.title = items.length ? '품목을 다른 묶음으로 옮긴 뒤 지울 수 있어요' : '';
    del.onclick = () => { db.stock.cats = db.stock.cats.filter(x => x !== c); dlg.close(); save(); };
  }
  ask(c ? '묶음 고치기' : '새 묶음', [
    { key: 'name', label: '이름', value: c?.name ?? '', required: true, placeholder: '예: 항체' },
    { key: 'equip', label: '중앙구매 기준', type: 'select', options: [['', `소모품·시약 (${fmtM(centralAt(NOW).other)}만원 초과)`], ['1', `장비·비품 (${fmtM(centralAt(NOW).equip)}만원 초과)`]], value: c?.equip ? '1' : '' },
  ], v => {
    const t = c || { id: uid() };
    t.name = v.name.trim();
    t.equip = !!v.equip;
    if (!c) db.stock.cats.push(t);
    save();
  }, del ? [h('p', null, del)] : []);
}

// ---------- 설정 ----------
const FONT_SIZES = [['0.85', '작게 (85%)'], ['0.92', '조금 작게 (92%)'], ['1', '보통'], ['1.1', '조금 크게 (110%)'], ['1.2', '크게 (120%)'], ['1.3', '아주 크게 (130%)']];
$('settingsBtn').onclick = () => {
  const member = isMember();
  const btn = (label, fn) => { const b = h('button', 'btn small', label); b.type = 'button'; b.onclick = fn; return b; };
  const resetLayout = btn('패널·열 너비 처음대로', () => { layout = { fs: layout.fs }; saveLayout(); location.reload(); });
  const r = ratesAt(NOW), c = centralAt(NOW); // 화면엔 이번 달 기준
  const month = (key, label) => ({ key, label, type: 'month', value: NOW, placeholder: 'YYYY-MM' });
  ask('설정', [
    { key: 'fs', label: '글씨 크기', type: 'select', options: FONT_SIZES, value: String(layout.fs || 1) },
    member ? null : [{ key: '학사', label: '학사 기준 (만원)', type: 'number', value: r.학사 / 10 },
      { key: '석사', label: '석사 기준', type: 'number', value: r.석사 / 10 },
      { key: '박사', label: '박사 기준', type: 'number', value: r.박사 / 10 }],
    member ? null : month('rFrom', '↑ 바꾸면 이 달부터 적용 (비우면 처음부터)'),
    member ? null : [{ key: 'cEquip', label: '중앙구매: 장비·비품 (만원 초과)', type: 'number', value: c.equip / 10 },
      { key: 'cOther', label: '중앙구매: 소모품·시약 (만원 초과)', type: 'number', value: c.other / 10 }],
    member ? null : month('cFrom', '↑ 바꾸면 이 달 주문부터 적용 (비우면 처음부터)'),
  ].filter(Boolean), v => {
    layout.fs = +v.fs || 1;
    saveLayout();
    applyFont();
    if (!member) {
      const nr = Object.fromEntries(['학사', '석사', '박사'].map(k => [k, Math.round(+v[k] * 10) || r[k]]));
      const nc = { equip: Math.round(+v.cEquip * 10) || c.equip, other: Math.round(+v.cOther * 10) || c.other };
      setStandard('rates', 'rateHist', v.rFrom, r, nr); // 칸을 고친 경우에만 기록
      setStandard('central', 'centralHist', v.cFrom, c, nc);
    }
    save();
  }, [
    member ? null : h('p', 'hint', '참여율 = 월 인건비 ÷ 그 달 과정의 기준 인건비 · 중앙구매 기준을 넘는 주문은 재고 주문함에서 규격서를 바로 만들어요'),
    member ? null : standardHistory(),
    accountPanel(),
    member ? null : h('div', 'set-box', h('b', null, '데이터'), h('p', 'hint', '처음엔 예시 데이터가 들어 있어요. 내 데이터 파일(JSON)을 가져오면 통째로 바뀌어요.'),
      h('div', 'set-btns', btn('⬇ 내보내기 (JSON)', exportData), btn('⬆ 가져오기', importData))),
    h('p', null, resetLayout),
  ].filter(Boolean));
};

// 기준 바꾸기: 화면에 보인 값(shown)에서 고쳤을 때만. 시행 월이 있으면 그 달부터(기록 추가·같은 달이면 고침), 비우면 처음 기준을 바꿈
function setStandard(baseKey, histKey, from, shown, next) {
  if (JSON.stringify(shown) === JSON.stringify(next)) return;
  if (!from) { db[baseKey] = next; return; }
  const hist = (db[histKey] ||= []), same = hist.find(x => x.from === from);
  if (same) same.v = next; else hist.push({ from, v: next });
  hist.sort((a, b) => a.from.localeCompare(b.from));
}
let histOpen = false; // 설정의 '기준 바뀐 기록' — 처음엔 접힘
function standardHistory() {
  const box = h('div', 'set-box');
  const rateTxt = v => `학사 ${fmtM(v.학사)} · 석사 ${fmtM(v.석사)} · 박사 ${fmtM(v.박사)}만원`;
  const cenTxt = v => `장비·비품 ${fmtM(v.equip)} · 소모품·시약 ${fmtM(v.other)}만원 초과`;
  const draw = () => {
    const rows = [...(db.rateHist || []).map(x => ['rateHist', x, `기준 인건비 · ${rateTxt(x.v)}`]), ...(db.centralHist || []).map(x => ['centralHist', x, `중앙구매 · ${cenTxt(x.v)}`])]
      .sort((a, b) => a[1].from.localeCompare(b[1].from));
    const head = h('button', 'set-fold', h('span', 'caret', histOpen ? '▾' : '▸'), h('b', null, '기준 바뀐 기록'), h('span', 'hint', rows.length ? `${rows.length}건` : '없음'));
    head.type = 'button';
    head.onclick = () => { histOpen = !histOpen; draw(); };
    if (!histOpen) { box.replaceChildren(head); return; }
    box.replaceChildren(head,
      h('p', 'hint', `처음 기준 — 기준 인건비 ${rateTxt(db.rates)} · 중앙구매 ${cenTxt(db.central)}`),
      ...rows.map(([k, x, t]) => {
        const del = h('button', 'link-btn', '빼기');
        del.type = 'button';
        del.onclick = () => { if (confirm(`${mDot(x.from)}부터의 기준 기록을 뺄까요?`)) { db[k] = db[k].filter(y => y !== x); persist(); draw(); } };
        return h('div', 'member', h('span', null, h('b', null, `${mDot(x.from)}부터 `), t), del);
      }),
      ...(rows.length ? [] : [h('p', 'hint', '아직 바뀐 적 없어요. 위에서 기준을 고치면 시행 월부터 적용되고 여기에 남아요.')]));
  };
  draw();
  return box;
}

// ---------- 계정·랩 멤버 (sync.js가 window.cloud 를 만듦 — Firebase 설정 전엔 없음 = 이 브라우저에만 저장) ----------
function accountPanel() {
  const c = window.cloud;
  if (!c) return null;
  const btn = (label, fn, k = 'btn small') => { const b = h('button', k, label); b.type = 'button'; b.onclick = () => { dlg.close(); fn(); }; return b; };
  if (!c.user) return h('div', 'set-box', h('b', null, '계정'), h('p', 'hint', '구글로 로그인하면 PC·폰에서 같은 데이터를 보고, 랩 멤버(학생)와 프로토콜·재고를 같이 써요.'), h('div', 'set-btns', btn('구글로 로그인', c.login, 'btn small primary')));
  return h('div', 'set-box', h('b', null, '계정'),
    h('p', 'hint', `${c.user.email} · 자동 동기화${isMember() ? ` · ${db.member.labName} 랩 멤버 (프로토콜·재고만 보여요)` : ''}`),
    h('div', 'set-btns', btn('로그아웃', c.logout)), isMember() ? null : labMembersBox());
}
// 랩 멤버: 학생 구글 이메일. 그 계정으로 로그인하면 프로토콜·재고 탭만 보임 (보안 규칙이 이 목록으로 막음)
function labMembersBox() {
  const box = h('div', 'members');
  const draw = () => {
    const inp = h('input', 'member-input');
    inp.inputMode = 'email';
    inp.enterKeyHint = 'enter';
    inp.placeholder = '학생 구글 이메일';
    const add = () => {
      const e = inp.value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(e)) { inp.focus(); return; }
      if (!db.labMembers.includes(e)) db.labMembers.push(e);
      persist(); draw();
      box.querySelector('.member-input').focus();
    };
    inp.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } }; // 설정 창이 닫히지 않게
    const plus = h('button', 'btn small', '+ 추가');
    plus.type = 'button';
    plus.onclick = add;
    box.replaceChildren(h('b', null, `랩 멤버 ${db.labMembers.length}명`),
      ...db.labMembers.map(e => {
        const x = h('button', 'link-btn', '빼기');
        x.type = 'button';
        x.onclick = () => { db.labMembers = db.labMembers.filter(y => y !== e); persist(); draw(); };
        return h('div', 'member', h('span', null, e), x);
      }),
      h('div', 'member-add', inp, plus),
      h('p', 'hint', '학생이 이 주소에서 그 구글 계정으로 로그인하면 프로토콜·재고 탭만 보여요 (프로토콜·품목·살 것·주문·받음). 과제·인건비·정보·서류와 주문의 재원은 안 보여요.'));
  };
  draw();
  return box;
}

// ---------- 내보내기 / 가져오기 (JSON 파일) ----------
function exportData() {
  const data = { ...db };
  delete data.owner; delete data.member;
  const a = h('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  a.download = `lab-manager-${isoToday()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importData() {
  const f = h('input');
  f.type = 'file';
  f.accept = '.json,application/json';
  f.onchange = async () => {
    const file = f.files[0];
    if (!file) return;
    try {
      const v = JSON.parse(await file.text());
      if (v?.version !== VERSION || !Array.isArray(v.grants)) throw new Error('랩 매니저(랩 행정)에서 내보낸 파일이 아니에요');
      if (!confirm(`지금 데이터를 '${file.name}' 내용으로 통째로 바꿀까요?${window.cloud?.user ? '\n로그인한 계정의 데이터도 같이 바뀌어요.' : ''}`)) return;
      const owner = db.owner;
      db = withDocs(v);
      delete db.member;
      if (owner) db.owner = owner;
      dlg.close();
      save();
    } catch (e) { alert(`가져오지 못했어요: ${e.message}`); }
  };
  f.click();
}

// ---------- 테마·탭·패널 경계 ----------
const THEME_KEY = 'lab-manager-theme';
function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
try { applyTheme(localStorage.getItem(THEME_KEY)); } catch { /* 없음 */ }
$('themeBtn').onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const t = dark ? 'light' : 'dark';
  applyTheme(t);
  try { localStorage.setItem(THEME_KEY, t); } catch { /* 없음 */ }
};
for (const b of $('tabSeg').querySelectorAll('[data-tab]')) b.onclick = () => setTab(b.dataset.tab);
$('homeGrid').insertBefore(splitter($('homeGrid'), '--home-l', 260), $('homeGrid').children[1]);
$('budgetLayout').insertBefore(splitter($('budgetLayout'), '--list-w', 150), $('grantDetail'));
$('noteView').before(splitter($('noteView').parentElement, '--info-w', 180));
$('docMain').before(splitter($('docMain').parentElement, '--docs-w', 180));
$('stockMain').before(splitter($('stockMain').parentElement, '--stock-w', 180));
$('protoMain').before(splitter($('protoMain').parentElement, '--proto-w', 180));

render();
