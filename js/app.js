'use strict';
// 랩 매니저 — 연구 모드(프로토콜·재고·기기·팁, 학생과 같이) + 행정 모드(재원·연차·학생인건비·서류·정보 노트). 저장은 이 브라우저(localStorage), 로그인하면 sync.js가 Firestore와 맞춤
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
// 터치 화면(폰·태블릿)이면 <html class="touch"> → 끌기 손잡이 ≡ 를 보임. CSS (hover: none) 만 보면
// 삼성 인터넷처럼 갤럭시에서 hover 가 된다고 알리는 브라우저에서 손잡이가 안 보임
document.documentElement.classList.toggle('touch', navigator.maxTouchPoints > 0 || matchMedia('(any-pointer: coarse)').matches);
// 색 고르기 기본 팔레트 10색 (빨강→주황→노랑→초록→민트→하늘→파랑→보라→분홍→회색, 그 밖의 색은 + 로).
// 예전 10색은 순서대로 붙어 있던 색을 그대로 두는 데만 씀
const PALETTE = ['#E89B91', '#EFBB93', '#EFD487', '#A8CB95', '#92CDB9', '#94CCDD', '#95B6EC', '#B39BE9', '#E8A9C6', '#9DA5B0'];
const palette = () => db.palette || PALETTE; // 색 고르기 팔레트: + 로 넣고 길게 눌러 뺌 (db.palette)
const SUGGEST_COLORS = ['#C47F7A', '#D9A35E', '#8FAE7E', '#6FA3A0', '#6F8FB8', '#9A84B8', '#B07A99', '#8C8577']; // + 를 누르면 보이는 추천 (차분한 톤)
const newColor = (used = []) => { const p = palette().length ? palette() : PALETTE; return p.find(c => !used.includes(c)) || p[0]; }; // 새로 만들 때 안 쓴 색부터
const OLD_PALETTE = ['#5B9BEA', '#F0727A', '#2BB39A', '#9D7BE0', '#E8B10C', '#8B93A1', '#F08A4B', '#D46FB0', '#4FB3D9', '#B39B7A'];
const KEY = 'lab-manager', OLD_KEYS = ['lab-admin', 'lab-admin-mockup'], VERSION = 3;
function fresh() {
  const s = structuredClone(window.SEED);
  const pays = [];
  for (const [person, grant, from, to, amount] of s.payRanges)
    for (const month of range(from, to)) pays.push({ person, grant, month, amount });
  return withDocs({ version: VERSION, rates: s.rates, grants: s.grants, people: s.people, pays, lines: s.lines, info: s.info, rows: [] });
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
  v.stock.equipGroups ||= []; // 공동기기 handbook: 묶음 → 기기 (프로토콜과 같은 틀)
  v.stock.equips ||= [];
  v.stock.tips ||= []; // 팁: Google 문서 링크 목록
  delete v.stock.photoScript; // 예전 기기 사진 저장(Apps Script 웹 앱) 주소 → 'Google Drive 연결'(photoDrive)로 바뀜
  v.labMembers ||= []; // 재고를 같이 쓰는 학생 구글 이메일 (sync.js가 랩 문서에 올림)
  // 가상 학생(시뮬레이션) 기능을 뺐음 → 남아 있던 가상 학생과 그 인건비는 지움
  const ghosts = new Set(v.people.filter(p => p.virtual).map(p => p.id));
  if (ghosts.size) {
    v.people = v.people.filter(p => !ghosts.has(p.id));
    v.pays = v.pays.filter(x => !ghosts.has(x.person));
    if (v.rows) v.rows = v.rows.filter(r => !ghosts.has(r.split('|')[0]));
  }
  delete v.sim;
  v.stock.cats.forEach((c, i) => { c.color ||= OLD_PALETTE[i % 10]; });
  v.stock.protoGroups.forEach((g, i) => { g.color ||= OLD_PALETTE[(i + 3) % 10]; });
  v.docGroups ||= {};
  window.FORMS.groups.forEach(([gid], gi) => { const o = v.docGroups[gid] ||= {}; o.color ||= OLD_PALETTE[gi % 10]; });
  v.lineCats ||= ['연구활동비', '연구재료비', '연구시설·장비비', '연구수당', '위탁연구개발비', '국제공동연구개발비', '기타', '간접비']; // 세목 (설정에서 고침)
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
const ratesAt = m => ({ ...db.rates, ...histAt(db.rates, db.rateHist, m) }); // 나중에 생긴 과정(포닥)은 기록에 없으면 처음 기준에서
const centralAt = m => histAt(db.central, db.centralHist, m);
const rateAt = (p, m) => { const d = degreeAt(p, m); return d ? ratesAt(m)[d] : null; };
const partRate = (v, rate) => Math.round(v / rate * 100); // 참여율 = 인건비 ÷ 기준 인건비

// ---------- 연차 ----------
// 시작월부터 차례로: 연차 끝 월을 고쳐 뒀으면(g.periods[n].to) 거기까지, 아니면 12개월. 다음 연차는 그 다음 달부터.
// 마지막 연차는 종료월에서 자름. 번호는 firstNo(기본 1)부터
function periods(g) {
  if (!g.start) return [];
  const out = [], end = mNum(g.end);
  for (let s = mNum(g.start), n = g.firstNo || 1; s <= end; n++) {
    const info = (g.periods || {})[n] || {}, to = info.to && mNum(info.to) >= s ? mNum(info.to) : s + 11;
    const e = Math.min(to, end);
    out.push({ n, from: mStr(s), to: mStr(e), budget: info.budget ?? null, pay: info.pay ?? null });
    s = e + 1;
  }
  return out;
}
const periodAt = (g, m) => periods(g).find(p => between(m, p.from, p.to)) || null;
const inGrant = (g, m) => !g.start || between(m, g.start, g.end);
const grantIn = (g, from, to) => !g.start || (g.start <= to && g.end >= from); // 그 구간에 걸친 재원 (기간 없는 재원은 늘)
const paysOf = (gid, from, to) => db.pays.filter(x => x.grant === gid && between(x.month, from, to));
const linesOf = (gid, n) => db.lines.filter(l => l.grant === gid && l.n === n);
const lineOf = id => db.lines.find(l => l.id === id);
const ordersOf = lid => db.orders.filter(o => o.line === lid);
const lineSpent = l => (+l.spent || 0) + sum(ordersOf(l.id)); // 집행 = 직접 적은 값 + 재고 탭에서 이 항목으로 낸 주문
// 포닥은 학생인건비가 아니라 인건비 비목 → 계상액과는 비교 안 하고 배정액 쓰임에만 더함
const isPostdoc = x => { const p = person(x.person); return !!p && degreeAt(p, x.month) === '포닥'; };
// 세목이 간접비인 항목은 직접비 배정과 따로 셈 (indirect)
function periodStats(g, pd) {
  const xs = paysOf(g.id, pd.from, pd.to);
  const pay = sum(xs.filter(x => !isPostdoc(x))), postdoc = sum(xs.filter(isPostdoc));
  const ls = linesOf(g.id, pd.n), direct = ls.filter(l => l.cat !== '간접비');
  const lines = sum(direct, l => l.plan), indirect = sum(ls.filter(l => l.cat === '간접비'), l => l.plan);
  return { pay, postdoc, lines, indirect, spent: sum(direct, lineSpent), used: pay + postdoc + lines };
}
const monthTotal = (pid, m) => sum(db.pays.filter(x => x.person === pid && x.month === m));
const cellTotal = (pid, gid, m) => sum(db.pays.filter(x => x.person === pid && x.grant === gid && x.month === m));
function setPeriodValue(g, n, key, value) {
  g.periods ||= {};
  const info = g.periods[n] ||= {};
  if (value === '' || value == null || isNaN(+value)) delete info[key]; else info[key] = +value;
  save();
}

// ---------- 화면 전환 ----------
let tab = 'home', selGrant = null, selN = null;
// 인건비 표는 5학기 구간(payFocus 학기 앞 1학기 + 그 학기 + 뒤 3학기)만 그림 — ‹ ›는 구간을 한 학기씩 옮김
// payFocus = 다음에 그릴 때 맨 왼쪽에 둘 달 (폰처럼 좁으면 그 앞 학기는 왼쪽으로 넘겨 봄)
let payFocus = semStart(semOf(NOW)), payScroll = true;
const paySems = () => Array.from({ length: 5 }, (_, i) => semAdd(semOf(payFocus), i - 1));
let payShow = {}; // 구간에 인건비가 없어도 표에 꺼낸 학생: { 학생 id: 그때 구간 첫 학기 }
let payView = 'sem';
try { payView = localStorage.getItem('lab-manager-payview') || 'sem'; } catch { /* 기본값 */ }
function setPayView(v) { payView = v; payScroll = true; try { localStorage.setItem('lab-manager-payview', v); } catch { /* 없음 */ } render(); }
function setTab(t) { tab = t; try { localStorage.setItem(MODE_KEY, modeOf(t)); } catch { /* 없음 */ } render(); }
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

// 모드: 행정(한눈에·예산·인건비·서류·정보 — PI만) │ 연구(프로토콜·재고·기기·팁 — 랩 멤버와 같이). 모드는 지금 탭으로 정해지고,
// 모드를 바꾸면 그 모드에서 마지막에 본 탭으로. 마지막 모드는 이 브라우저에 기억 → 다음에 열면 그 모드의 첫 탭부터
// 랩 멤버(학생)로 로그인하면 db.member = { lab, labName } 이고 연구 모드만 보임 (sync.js가 정함)
const isMember = () => !!db.member;
const LAB_TABS = ['protocol', 'stock', 'equip', 'tips'];
const modeOf = t => (LAB_TABS.includes(t) ? 'lab' : 'admin');
const MODE_KEY = 'lab-manager-mode';
const lastTab = { admin: 'home', lab: 'protocol' };
try { if (localStorage.getItem(MODE_KEY) === 'lab') tab = 'protocol'; } catch { /* 처음 */ }
function render() {
  if (isMember() && !LAB_TABS.includes(tab)) tab = 'protocol';
  const mode = modeOf(tab);
  lastTab[mode] = tab; // 이 모드에서 마지막에 본 탭
  document.body.dataset.tab = tab;
  document.body.dataset.role = isMember() ? 'member' : 'pi';
  for (const b of $('modeSeg').querySelectorAll('[data-mode]')) b.classList.toggle('on', b.dataset.mode === mode);
  for (const b of $('tabSeg').querySelectorAll('[data-tab]')) { b.classList.toggle('on', b.dataset.tab === tab); b.hidden = modeOf(b.dataset.tab) !== mode; }
  $('cellPop').hidden = true;
  renderProtocol();
  renderStock();
  renderEquip();
  renderTips();
  if (isMember()) return;
  renderHome();
  renderPay();
  renderBudget();
  renderInfo();
  renderDocs();
}

// ---------- 입력 창 ----------
const dlg = $('dlg');
function field(f) {
  if (f.type === 'color') { // 색: 팔레트 (+ 팔레트에 없는 지금 색) 중 하나 (라디오 — 안 골랐으면 값이 안 넘어감 → 그대로)
    // 끝의 + = 원하는 색을 팔레트에 넣기, 팔레트 색을 길게 누르면(PC는 오른쪽 클릭) 팔레트에서 빼기
    const box = h('div', 'swatches'), same = (a, b) => a.toLowerCase() === b.toLowerCase();
    let sel = f.value || '', skipClick = false;
    box.addEventListener('pointerdown', () => { skipClick = false; }, true); // 오른쪽 클릭 뒤엔 click 이 안 와서 여기서 풀어 둠
    box.addEventListener('click', e => { if (skipClick) { e.preventDefault(); e.stopPropagation(); skipClick = false; } }, true); // 길게 누른 뒤 손 떼면 고르지 않음
    const hold = (el, fn) => {
      let timer = 0, done = false;
      const go = () => { clearTimeout(timer); if (!done) { done = true; skipClick = true; fn(); } };
      el.addEventListener('pointerdown', e => { done = false; if (e.pointerType !== 'mouse') timer = setTimeout(go, 550); });
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, () => clearTimeout(timer));
      el.addEventListener('contextmenu', e => { e.preventDefault(); go(); });
    };
    // + 를 누르면 펼쳐지는 칸: 추천 5색 · 컬러코드 · 직접 고르기(폰 기본 창) · 기본 색으로 되돌리기
    const panel = h('div', 'color-add');
    panel.hidden = true;
    const add = c => {
      c = c.toUpperCase();
      if (!palette().some(x => same(x, c))) { db.palette = [...palette(), c]; persist(); }
      sel = c;
      panel.hidden = true;
      draw();
    };
    const btn = (k, label, fn) => { const b = h('button', k, label); b.type = 'button'; b.onclick = fn; return b; };
    const hexOf = v => { const m = v.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i); return m ? `#${m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1]}` : null; };
    const hexIn = h('input', 'hex-in'), dot = h('span', 'hex-dot');
    hexIn.placeholder = '#6F8FB8';
    hexIn.maxLength = 7;
    hexIn.spellcheck = false;
    hexIn.autocapitalize = 'off';
    hexIn.oninput = () => { dot.style.setProperty('--c', hexOf(hexIn.value) || 'transparent'); };
    hexIn.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const c = hexOf(hexIn.value); if (c) add(c); } }; // 설정 창이 닫히지 않게
    const native = h('label', 'link-btn color-native', '직접 고르기'), picker = h('input');
    picker.type = 'color';
    picker.onchange = () => add(picker.value);
    native.append(picker);
    const drawPanel = () => panel.replaceChildren(
      h('div', 'color-add-row', h('span', 'hint', '추천'), ...SUGGEST_COLORS.filter(c => !palette().some(x => same(x, c))).slice(0, 5).map(c => {
        const b = btn('swatch', null, () => add(c));
        b.style.setProperty('--c', c);
        b.title = c;
        return b;
      })),
      h('div', 'color-add-row', h('span', 'hint', '컬러코드'), dot, hexIn, btn('btn small', '넣기', () => { const c = hexOf(hexIn.value); if (c) add(c); else hexIn.focus(); })),
      h('div', 'color-add-row', native, h('span', 'spacer'), btn('link-btn', '기본 색으로 되돌리기', () => {
        if (!confirm('팔레트를 기본 10색으로 되돌릴까요?\n넣은 색은 팔레트에서 빠져요 (이미 쓰는 재원·묶음 색은 그대로).')) return;
        delete db.palette;
        persist();
        panel.hidden = true;
        draw();
      })));
    const draw = () => {
      const cs = [...palette()];
      if (sel && !cs.some(c => same(c, sel))) cs.push(sel);
      const plus = btn('swatch swatch-add', '+', () => { panel.hidden = !panel.hidden; if (!panel.hidden) drawPanel(); });
      plus.title = '색 넣기';
      box.replaceChildren(...cs.map(c => {
        const r = h('input');
        r.type = 'radio';
        r.name = f.key;
        r.value = c;
        r.checked = same(c, sel);
        r.onchange = () => { sel = c; };
        const l = h('label', 'swatch', r);
        l.style.setProperty('--c', c);
        if (palette().some(x => same(x, c))) {
          l.title = '길게 누르면 팔레트에서 빼기';
          hold(l, () => {
            if (!confirm('이 색을 팔레트에서 지울까요?\n이미 이 색을 쓰는 재원·묶음은 그대로예요.')) return;
            db.palette = palette().filter(x => !same(x, c));
            persist();
            draw();
          });
        }
        return l;
      }), plus);
    };
    draw();
    return h('div', 'field', f.label, box, panel);
  }
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
// 칸: { key… } 하나 · [ … ] 한 줄에 여럿 · { fold: 제목, hint, fields } 접는 묶음 (접혀 있어도 값은 같이 넘어감) · 화면 요소 그대로
function ask(title, fields, onOk, extra = []) {
  $('dlgTitle').textContent = title;
  const draw = f => f instanceof Node ? f : Array.isArray(f) ? h('div', 'row3', f.map(field))
    : f.fold ? Object.assign(fold(f.fold, f.hint, ...f.fields.map(draw)), { className: 'fold-box set-box' }) : field(f);
  $('dlgBody').replaceChildren(...fields.map(draw), ...extra.filter(Boolean));
  dlg.returnValue = '';
  dlg.onclose = () => { if (dlg.returnValue === 'ok') onOk(Object.fromEntries(new FormData($('dlgForm')))); };
  dlg.showModal();
}
// 접는 칸 (처음엔 접힘). hint = 제목 옆에 늘 보이는 요약
function fold(title, hint, ...kids) {
  return h('details', 'fold-box', h('summary', 'set-fold', h('span', 'caret'), h('b', null, title), h('span', 'hint', hint || '')), h('div', 'fold-body', ...kids));
}
// 묶음 막대의 이름·색 고치기: ✎ (마우스를 올리면 보임) · 오른쪽 클릭 · 폰에선 길게 누르기
function groupEditable(head, onEdit) {
  const edit = h('span', 'cat-edit', '✎');
  edit.role = 'button';
  edit.title = '이름·색 고치기';
  edit.onclick = e => { e.stopPropagation(); onEdit(); };
  head.insertBefore(edit, head.querySelector('.cat-add')); // + 앞 (없으면 맨 끝)
  let timer = 0, fired = false, x0 = 0, y0 = 0;
  const fire = () => { clearTimeout(timer); if (!fired) { fired = true; onEdit(); } };
  head.addEventListener('pointerdown', e => {
    fired = false;
    if (e.pointerType === 'mouse' || e.target.closest('.touch-drag')) return; // ≡ 는 끌기
    [x0, y0] = [e.clientX, e.clientY];
    timer = setTimeout(fire, 500);
  });
  head.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10) clearTimeout(timer); }); // 목록 스크롤
  for (const t of ['pointerup', 'pointercancel']) head.addEventListener(t, () => clearTimeout(timer));
  head.addEventListener('contextmenu', e => { e.preventDefault(); fire(); });
  head.addEventListener('click', e => { if (fired) { e.stopImmediatePropagation(); fired = false; } }, true); // 길게 누른 뒤 손을 떼도 접기·고르기는 안 함
}
// 폰 끌기: 폰 브라우저는 터치로 HTML 끌어 놓기(draggable)를 일으키지 않음 → 손잡이(≡, 폰에서만 보임)를 누른 채 움직이면
// dragstart·dragover·drop 을 흉내 내서 PC용 끌기 코드를 그대로 씀. 손잡이만 touch-action: none 이라 나머지 칸은 그대로 스크롤
function touchHandle(handle = h('span', 'touch-only', '≡')) {
  handle.classList.add('touch-drag');
  let src = null, dt = null, over = null, ok = false, last = null, timer = 0;
  const fire = (el, type, t) => {
    const e = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: t.clientX, clientY: t.clientY });
    el.dispatchEvent(e);
    return e.defaultPrevented;
  };
  const track = t => { // 손가락 아래 칸에 dragover (칸이 바뀌면 앞 칸에 dragleave)
    const el = document.elementFromPoint(t.clientX, t.clientY);
    if (el !== over) { if (over) fire(over, 'dragleave', t); over = el; }
    ok = !!over && fire(over, 'dragover', t);
  };
  const edgeScroll = () => { // 손가락이 화면 끝에 있으면 위아래(페이지)·옆(넓은 표)으로 넘김
    if (!last) return;
    const wrap = src?.closest('.tbl-wrap'), m = 70;
    const dy = last.clientY < m ? -10 : last.clientY > innerHeight - m ? 10 : 0, dx = wrap ? (last.clientX < 40 ? -10 : last.clientX > innerWidth - 40 ? 10 : 0) : 0;
    if (dy) scrollBy(0, dy);
    if (dx) wrap.scrollLeft += dx;
    if (dx || dy) track(last);
  };
  handle.addEventListener('touchstart', e => {
    src = handle.closest('[draggable="true"]');
    if (!src || e.touches.length > 1 || typeof DataTransfer !== 'function') { src = null; return; }
    e.preventDefault(); // 누른 칸 접기·고르기(click)·길게 누르기 메뉴 막음
    dt = new DataTransfer(); over = null; ok = false; last = null;
    fire(src, 'dragstart', e.touches[0]);
    src.classList.add('touch-src');
    timer = setInterval(edgeScroll, 30);
  }, { passive: false });
  handle.addEventListener('touchmove', e => {
    if (!dt) return;
    last = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    track(last);
  }, { passive: true });
  const end = e => {
    if (!dt) return;
    clearInterval(timer);
    const t = e.changedTouches[0];
    if (over) fire(over, ok ? 'drop' : 'dragleave', t);
    fire(src, 'dragend', t);
    src.classList.remove('touch-src');
    src = dt = over = last = null;
  };
  handle.addEventListener('touchend', end);
  handle.addEventListener('touchcancel', end);
  return handle;
}
// 묶음 순서: 막대를 끌어 다른 막대 위(위쪽 절반 = 앞, 아래쪽 절반 = 뒤)에 놓으면 onMove(새 id 순서). ids = 지금 순서
function dragReorder(head, id, ids, onMove) {
  head.draggable = true;
  head.insertBefore(touchHandle(), head.querySelector('.cat-add')); // 폰: + 앞 ≡
  const side = e => (e.clientY - head.getBoundingClientRect().top > head.offsetHeight / 2 ? 'after' : 'before');
  const clear = () => head.classList.remove('drop-before', 'drop-after');
  head.ondragstart = e => { e.dataTransfer.setData('text/x-group', id); e.dataTransfer.effectAllowed = 'move'; };
  head.ondragover = e => {
    if (!e.dataTransfer.types.includes('text/x-group')) return;
    e.preventDefault();
    head.classList.toggle('drop-before', side(e) === 'before');
    head.classList.toggle('drop-after', side(e) === 'after');
  };
  head.ondragleave = clear;
  head.ondrop = e => {
    e.preventDefault();
    clear();
    const from = e.dataTransfer.getData('text/x-group');
    if (!ids.includes(from) || from === id) return;
    const next = ids.filter(x => x !== from);
    next.splice(next.indexOf(id) + (side(e) === 'after' ? 1 : 0), 0, from);
    onMove(next);
  };
}
const byIds = (list, ids) => ids.map(id => list.find(x => x.id === id)); // 끌어서 바꾼 순서대로

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

// ---------- 설정 ----------
const FONT_SIZES = [['0.85', '작게 (85%)'], ['0.92', '조금 작게 (92%)'], ['1', '보통'], ['1.1', '조금 크게 (110%)'], ['1.2', '크게 (120%)'], ['1.3', '아주 크게 (130%)']];
$('settingsBtn').onclick = () => {
  const member = isMember();
  const btn = (label, fn) => { const b = h('button', 'btn small', label); b.type = 'button'; b.onclick = fn; return b; };
  const resetLayout = btn('패널·열 너비 처음대로', () => { layout = { fs: layout.fs }; saveLayout(); location.reload(); });
  const r = ratesAt(NOW), c = centralAt(NOW); // 화면엔 이번 달 기준
  const month = (key, label) => ({ key, label, type: 'month', value: NOW, placeholder: 'YYYY-MM' });
  const won = (key, label, v) => ({ key, label, type: 'number', step: 'any', value: v != null ? v / 10 : '' }); // 접혀 있으면 잘못된 값을 못 보니 소수도 받음
  ask('설정', [
    { key: 'fs', label: '글씨 크기', type: 'select', options: FONT_SIZES, value: String(layout.fs || 1) },
    member ? null : { fold: '인건비 기준금액', hint: `${['학사', '석사', '박사', '포닥'].filter(k => r[k] != null).map(k => `${k} ${fmtM(r[k])}`).join(' · ')}만원`, fields: [
      [won('학사', '학사 (만원)', r.학사), won('석사', '석사', r.석사), won('박사', '박사', r.박사), won('포닥', '포닥', r.포닥)],
      month('rFrom', '↑ 바꾸면 이 달부터 적용 (비우면 처음부터)'),
      h('p', 'hint', '참여율 = 월 인건비 ÷ 그 달 과정의 기준 인건비'), standardHistory('rateHist')] },
    member ? null : { fold: '중앙구매 기준금액', hint: centralText(), fields: [
      [won('cEquip', '장비·비품 (만원 초과)', c.equip), won('cOther', '소모품·시약 (만원 초과)', c.other)],
      month('cFrom', '↑ 바꾸면 이 달 주문부터 적용 (비우면 처음부터)'),
      h('p', 'hint', '기준을 넘는 주문은 재고 주문함에서 규격서를 바로 만들어요'), standardHistory('centralHist')] },
    member ? null : lineCatsBox(),
    member ? null : { fold: '기기 사진 저장', hint: db.stock.photoDrive ? 'Google Drive (원본)' : '앱 안 (줄여서)', fields: [photoDriveBox()] }, // 연결·끊기는 누르면 바로 (equip.js)
  ].filter(Boolean), v => {
    layout.fs = +v.fs || 1;
    saveLayout();
    applyFont();
    if (!member) {
      const nr = Object.fromEntries(['학사', '석사', '박사', '포닥'].map(k => [k, Math.round(+v[k] * 10) || r[k]]));
      const nc = { equip: Math.round(+v.cEquip * 10) || c.equip, other: Math.round(+v.cOther * 10) || c.other };
      setStandard('rates', 'rateHist', v.rFrom, r, nr); // 칸을 고친 경우에만 기록
      setStandard('central', 'centralHist', v.cFrom, c, nc);
    }
    save();
  }, [
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
// 기준 바뀐 기록: 설정의 인건비·중앙구매 칸 안에 접어 둠 (시행 월부터의 기록, 뺄 수 있음)
function standardHistory(histKey) {
  const txt = histKey === 'rateHist' ? v => `학사 ${fmtM(v.학사)} · 석사 ${fmtM(v.석사)} · 박사 ${fmtM(v.박사)}${v.포닥 ? ` · 포닥 ${fmtM(v.포닥)}` : ''}만원`
    : v => `장비·비품 ${fmtM(v.equip)} · 소모품·시약 ${fmtM(v.other)}만원 초과`;
  const box = fold('기준 바뀐 기록', ''), count = box.querySelector('summary .hint'), body = box.querySelector('.fold-body');
  box.classList.add('sub-fold');
  const draw = () => {
    const rows = [...(db[histKey] || [])].sort((a, b) => a.from.localeCompare(b.from));
    count.textContent = rows.length ? `${rows.length}건` : '없음';
    body.replaceChildren(h('p', 'hint', `처음 기준 — ${txt(histKey === 'rateHist' ? db.rates : db.central)}`),
      ...rows.map(x => {
        const del = h('button', 'link-btn', '빼기');
        del.type = 'button';
        del.onclick = () => { if (confirm(`${mDot(x.from)}부터의 기준 기록을 뺄까요?`)) { db[histKey] = db[histKey].filter(y => y !== x); persist(); draw(); } };
        return h('div', 'member', h('span', null, h('b', null, `${mDot(x.from)}부터 `), txt(x.v)), del);
      }),
      rows.length ? null : h('p', 'hint', '아직 바뀐 적 없어요. 위에서 기준을 고치면 시행 월부터 적용되고 여기에 남아요.'));
  };
  draw();
  return box;
}
// 세목 (세목 예산의 분류): 이름 바꾸기·추가·빼기. 간접비는 직접비 계산에서 빼는 데 써서 그대로 둠
function lineCatsBox() {
  const box = fold('세목', ''), count = box.querySelector('summary .hint'), body = box.querySelector('.fold-body');
  box.classList.add('set-box');
  const enterBlur = inp => { inp.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); inp.blur(); } }; }; // 설정 창이 닫히지 않게
  const draw = () => {
    count.textContent = `${db.lineCats.length}개`;
    const rows = db.lineCats.map((c, i) => {
      if (c === '간접비') return h('div', 'member', h('span', null, c), h('span', 'hint', '직접비 계산에서 빠지는 세목이라 그대로 둬요'));
      const inp = h('input', 'member-input');
      inp.value = c;
      enterBlur(inp);
      inp.onchange = () => {
        const name = inp.value.trim();
        if (!name || db.lineCats.includes(name)) { inp.value = c; return; }
        db.lineCats[i] = name;
        for (const l of db.lines) if (l.cat === c) l.cat = name;
        save(); draw();
      };
      const x = h('button', 'link-btn', '빼기');
      x.type = 'button';
      x.onclick = () => {
        const n = db.lines.filter(l => l.cat === c).length;
        if (n && !confirm(`'${c}' 세목인 예산 항목 ${n}개는 세목이 비어요. 뺄까요?`)) return;
        db.lineCats = db.lineCats.filter(y => y !== c);
        for (const l of db.lines) if (l.cat === c) l.cat = null;
        save(); draw();
      };
      return h('div', 'member', inp, x);
    });
    const add = h('input', 'member-input');
    add.placeholder = '새 세목 이름';
    const plus = h('button', 'btn small', '+ 추가');
    plus.type = 'button';
    plus.onclick = () => {
      const name = add.value.trim();
      if (!name || db.lineCats.includes(name)) { add.focus(); return; }
      db.lineCats.splice(db.lineCats.includes('간접비') ? db.lineCats.indexOf('간접비') : db.lineCats.length, 0, name); // 간접비 앞에
      save(); draw();
    };
    add.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); plus.click(); } };
    body.replaceChildren(...rows, h('div', 'member-add', add, plus), h('p', 'hint', '이름을 바꾸면 그 세목인 예산 항목도 같이 바뀌어요.'));
  };
  draw();
  return box;
}

// ---------- 계정·랩 멤버 (sync.js가 window.cloud 를 만듦 — Firebase 설정 전엔 없음 = 이 브라우저에만 저장) ----------
function accountPanel() {
  const c = window.cloud;
  if (!c) return null;
  const btn = (label, fn, k = 'btn small') => { const b = h('button', k, label); b.type = 'button'; b.onclick = () => { dlg.close(); fn(); }; return b; };
  if (!c.user) return h('div', 'set-box', h('b', null, '계정'), h('p', 'hint', '구글로 로그인하면 PC·폰에서 같은 데이터를 보고, 랩 멤버(학생)와 연구 모드(프로토콜·재고·기기·팁)를 같이 써요.'), h('div', 'set-btns', btn('구글로 로그인', c.login, 'btn small primary')));
  return h('div', 'set-box', h('b', null, '계정'),
    h('p', 'hint', `${c.user.email} · 자동 동기화${isMember() ? ` · ${db.member.labName} 랩 멤버 (연구 모드만 보여요)` : ''}`),
    h('div', 'set-btns', btn('로그아웃', c.logout)), isMember() ? null : labMembersBox());
}
// 랩 멤버: 학생 구글 이메일. 그 계정으로 로그인하면 연구 모드(프로토콜·재고·기기·팁)만 보임 (보안 규칙이 이 목록으로 막음)
function labMembersBox() {
  const box = fold('랩 멤버', ''), count = box.querySelector('summary .hint'), body = box.querySelector('.fold-body');
  box.classList.add('members');
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
    count.textContent = `${db.labMembers.length}명`;
    body.replaceChildren(
      ...db.labMembers.map(e => {
        const x = h('button', 'link-btn', '빼기');
        x.type = 'button';
        x.onclick = () => { db.labMembers = db.labMembers.filter(y => y !== e); persist(); draw(); };
        return h('div', 'member', h('span', null, e), x);
      }),
      h('div', 'member-add', inp, plus),
      h('p', 'hint', '학생이 이 주소에서 그 구글 계정으로 로그인하면 연구 모드(프로토콜·재고·기기·팁)만 보여요. 과제·인건비·정보·서류와 주문의 재원은 안 보여요.'));
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
for (const b of $('modeSeg').querySelectorAll('[data-mode]')) b.onclick = () => setTab(lastTab[b.dataset.mode]);
$('homeGrid').insertBefore(splitter($('homeGrid'), '--home-l', 260), $('homeGrid').children[1]);
$('budgetLayout').insertBefore(splitter($('budgetLayout'), '--list-w', 150), $('grantDetail'));
$('noteView').before(splitter($('noteView').parentElement, '--info-w', 180));
$('docMain').before(splitter($('docMain').parentElement, '--docs-w', 180));
$('stockMain').before(splitter($('stockMain').parentElement, '--stock-w', 180));
$('protoMain').before(splitter($('protoMain').parentElement, '--proto-w', 180));
$('equipMain').before(splitter($('equipMain').parentElement, '--proto-w', 180)); // 기기·팁 목록 너비는 프로토콜과 같이
$('tipMain').before(splitter($('tipMain').parentElement, '--proto-w', 180));

// 처음 열면 마지막 모드의 첫 탭 (행정 = 한눈에, 연구 = 프로토콜 · 학생은 늘 연구). 폰에 설치한 앱은 닫아도 메모리에 남아 있다가 이어서 열리므로,
// 1시간 넘게 내려 두었거나 날짜가 바뀌었으면 새로 불러옴 → 첫 화면부터, 오늘 날짜(TODAY·NOW)도 새로
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (hiddenAt && (new Date().toDateString() !== TODAY.toDateString() || Date.now() - hiddenAt > 36e5)) location.reload();
});

addEventListener('DOMContentLoaded', () => render()); // 탭별 파일(home.js … stock.js)까지 다 읽은 뒤에 그리기
