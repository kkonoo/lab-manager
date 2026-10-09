'use strict';
// 실험 계산기 (calc.html) — 몰농도 · 희석 · 버퍼 조제 · 세포 seeding
// 수업 학생에게 링크로 나눠 주는 따로 페이지: 로그인 없이 열리게 app.js·sync.js(데이터·Firebase)는 읽지 않고, 계산 값은 저장하지 않음
// 카드 안의 칸을 고칠 때마다(input·change) 그 카드만 다시 계산

const $ = id => document.getElementById(id);
function h(tag, cls, ...kids) { // app.js와 같음
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.append(...kids.flat(9).filter(k => k != null && k !== false).map(k => typeof k === 'number' ? String(k) : k));
  return el;
}

// ---------- 단위: 기준 단위(질량 g · 몰농도 M · 질량 농도 mg/mL · 배수 X · 부피 L)로 바꿀 때 곱하는 값 ----------
const MASS = { g: 1, mg: 1e-3, 'µg': 1e-6 };
const MOLAR = { M: 1, mM: 1e-3, 'µM': 1e-6, nM: 1e-9 };
const CONC = { ...MOLAR, 'mg/mL': 1, 'µg/mL': 1e-3, X: 1 }; // 희석·버퍼 stock 농도
const VOL = { L: 1, mL: 1e-3, 'µL': 1e-6 };
const concKind = u => (u in MOLAR ? 'M' : u === 'X' ? 'X' : 'mg/mL'); // 종류가 같아야 서로 바꿈 (M ↔ mg/mL 은 MW가 있어야 해서 안 함)

// ---------- 숫자 보이기: 유효숫자 4자리, 아주 크거나 작으면 a.b × 10ⁿ ----------
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = n => (n < 0 ? '⁻' : '') + [...String(Math.abs(n))].map(d => SUP[d]).join('');
function sci(x) {
  let e = Math.floor(Math.log10(x)), m = +(x / 10 ** e).toPrecision(3);
  if (m >= 10) { m /= 10; e++; }
  return `${Number.isInteger(m) ? m.toFixed(1) : m} × 10${sup(e)}`;
}
const fmt = x => (x && (x < 1e-4 || x >= 1e6) ? sci(x) : String(+x.toPrecision(4)));
const fmtVol = L => (L < 2e-3 ? `${fmt(L * 1e6)} µL` : `${fmt(L * 1e3)} mL`); // 2 mL 아래는 µL (피펫으로 재기 좋게)
const rest = (all, part) => (all - part > all * 1e-9 ? all - part : 0); // 나머지 (같으면 소수 오차 대신 0)

// ---------- 입력 칸 ----------
// 빈칸 = null, 숫자로 못 읽으면 NaN (type=number 는 잘못 친 값을 '' 로 줘서 badInput 으로 가려냄)
const num = input => (input.validity.badInput ? NaN : input.value.trim() === '' ? null : +input.value);
const bad = v => v != null && !(v > 0); // 0 · 음수 · 숫자 아님
// opts: ['값', …] 또는 [['값', '보일 글'], …]
function select(opts, value) {
  return h('select', null, opts.map(o => {
    const [v, label] = Array.isArray(o) ? o : [o, o];
    const op = h('option', null, label);
    op.value = v;
    op.selected = v === value;
    return op;
  }));
}
// 숫자 칸(폰에선 숫자 키패드) + 단위 — units: 목록이면 고르는 칸, 글자면 그대로 붙임, 없으면 숫자만
function numField(label, units, unit, { ph = '', value = '', wide = false } = {}) {
  const input = h('input');
  input.type = 'number';
  input.inputMode = 'decimal';
  input.step = 'any';
  input.placeholder = ph;
  input.value = value ?? '';
  const sel = Array.isArray(units) ? select(units, unit) : null;
  const box = h('div', 'calc-num', input, sel || (units ? h('span', 'calc-unit', units) : null));
  return { el: h('label', wide ? 'field wide' : 'field', label, box), input, sel, box };
}

// ---------- 결과 칸: 굵은 한 줄 + 작은 설명 / 안내만 (msg: 빈칸·잘못된 값, warn: 계산은 되지만 만들 수 없는 값) ----------
const BAD = '0보다 큰 숫자를 넣어 주세요';
function show(out, main, sub) {
  out.className = 'calc-out';
  out.replaceChildren(h('b', null, main));
  if (sub) out.append(h('small', null, sub));
}
function say(out, text, kind = 'msg') { out.className = `calc-out ${kind}`; out.replaceChildren(text); }
// 카드: 제목 + 안내 + 칸들. 안의 칸을 고칠 때마다 update
function card(title, hint, update, ...kids) {
  const el = h('section', 'panel calc-card', h('div', 'panel-head', h('h2', null, title), h('span', 'hint', hint)), ...kids);
  el.addEventListener('input', update);
  el.addEventListener('change', update); // 버퍼 행 종류처럼 고르면 칸을 새로 그리는 경우, 그린 뒤에 다시 계산
  update();
  return el;
}

// ---------- 입력 창 (app.js ask 와 같은 모양, 글 칸만) · 길게 누르기 (app.js groupEditable 과 같은 방식) ----------
const dlg = $('dlg');
function ask(title, fields, onOk, extra = [], canOk = true) {
  $('dlgTitle').textContent = title;
  $('dlgBody').replaceChildren(...fields.map(f => {
    const input = h('input');
    input.name = f.key;
    input.value = f.value ?? '';
    input.placeholder = f.placeholder || '';
    input.required = !!f.required;
    input.enterKeyHint = 'enter'; // 모바일 키보드가 '다음' 대신 Enter → 확인
    return h('label', 'field', f.label, input);
  }), ...extra.filter(Boolean));
  $('dlgOk').disabled = !canOk;
  dlg.returnValue = '';
  dlg.onclose = () => { if (dlg.returnValue === 'ok') onOk(Object.fromEntries(new FormData($('dlgForm')))); };
  dlg.showModal();
}
// 길게 누르기(폰) · 오른쪽 클릭(PC) → onHold. 길게 누른 뒤 손을 떼도 click 은 안 함
function holdable(el, onHold) {
  let timer = 0, fired = false, x0 = 0, y0 = 0;
  const fire = () => { clearTimeout(timer); if (!fired) { fired = true; onHold(); } };
  el.addEventListener('pointerdown', e => {
    fired = false;
    if (e.pointerType === 'mouse') return;
    [x0, y0] = [e.clientX, e.clientY];
    timer = setTimeout(fire, 500);
  });
  el.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10) clearTimeout(timer); }); // 스크롤
  for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, () => clearTimeout(timer));
  el.addEventListener('contextmenu', e => { e.preventDefault(); fire(); });
  el.addEventListener('click', e => { if (fired) { e.stopImmediatePropagation(); fired = false; } }, true);
}

// ---------- 1. 몰농도: 질량 = 몰농도 × 부피 × MW (셋 중 빈 칸 하나를 계산) ----------
function molarCard() {
  const mw = numField('분자량 MW', 'g/mol', null, { ph: '58.44' });
  const xs = [['질량', MASS, 'g'], ['몰농도', MOLAR, 'M'], ['부피', VOL, 'mL']]
    .map(([name, units, u]) => ({ name, units, ...numField(name, Object.keys(units), u, { ph: '?' }) }));
  const out = h('div');
  const update = () => {
    const w = num(mw.input), vs = xs.map(x => { const v = num(x.input); return v == null ? null : v * x.units[x.sel.value]; });
    const blank = vs.filter(v => v == null).length;
    if (w == null && blank === 3) return say(out, 'MW와 두 칸을 넣으면 빈 칸을 계산해요');
    if ([w, ...vs].some(bad)) return say(out, BAD);
    if (w == null) return say(out, 'MW를 넣어 주세요');
    if (blank !== 1) return say(out, blank ? '질량·몰농도·부피 중 두 칸을 넣어 주세요' : '계산할 칸 하나를 비워 두세요');
    const [m, c, v] = vs, i = vs.indexOf(null), x = xs[i];
    const r = [c * v * w, m / (v * w), m / (c * w)][i]; // g · M · L
    show(out, `${x.name} ${fmt(r / x.units[x.sel.value])} ${x.sel.value}`);
  };
  return card('⚖️ 몰농도', '질량 = 몰농도 × 부피 × MW · 하나를 비우면 계산해요', update,
    h('div', 'calc-fields', mw.el, xs.map(x => x.el)), out);
}

// ---------- 2. 희석: C1V1 = C2V2 (넷 중 빈 칸 하나를 계산) → stock ○ + 용매 ○ ----------
function dilutionCard() {
  const cu = Object.keys(CONC), vu = Object.keys(VOL), ph = '?';
  const xs = [numField('C1 stock 농도', cu, 'mM', { ph }), numField('V1 stock 부피', vu, 'µL', { ph }),
    numField('C2 최종 농도', cu, 'µM', { ph }), numField('V2 최종 부피', vu, 'mL', { ph })];
  const out = h('div');
  const update = () => {
    const vs = xs.map((x, i) => { const v = num(x.input); return v == null ? null : v * (i % 2 ? VOL : CONC)[x.sel.value]; });
    const blank = vs.filter(v => v == null).length;
    if (blank === 4) return say(out, '넷 중 세 칸을 넣으면 빈 칸을 계산해요');
    if (vs.some(bad)) return say(out, BAD);
    if (blank !== 1) return say(out, blank ? '넷 중 세 칸을 넣어 주세요' : '계산할 칸 하나를 비워 두세요');
    if (concKind(xs[0].sel.value) !== concKind(xs[2].sel.value)) return say(out, 'C1·C2 단위 종류를 맞춰 주세요 (M · mg/mL · X)');
    const i = vs.indexOf(null), [c1, v1, c2, v2] = vs;
    vs[i] = [c2 * v2 / v1, c2 * v2 / c1, c1 * v1 / v2, c1 * v1 / c2][i];
    const [C1, V1, C2, V2] = vs;
    if (C1 < C2 * (1 - 1e-9)) return say(out, 'stock이 최종 농도보다 묽어요. 희석으로는 만들 수 없어요', 'warn');
    const mix = `stock ${fmtVol(V1)} + 용매 ${fmtVol(rest(V2, V1))}`, fold = `${fmt(C1 / C2)}배 희석`;
    if (i % 2) show(out, mix, `최종 ${i === 3 ? fmtVol(V2) : `${xs[3].input.value} ${xs[3].sel.value}`} · ${fold}`); // 넣은 최종 부피는 넣은 그대로
    else show(out, `${i ? '최종 농도' : 'stock 농도'} ${fmt(vs[i] / CONC[xs[i].sel.value])} ${xs[i].sel.value}`, `${mix} · ${fold}`);
  };
  return card('💧 희석', 'C1V1 = C2V2 · 하나를 비우면 계산해요', update, h('div', 'calc-fields', xs.map(x => x.el)), out);
}

// ---------- 3. 버퍼 조제: 최종 부피 + 성분 행 → 성분별 넣을 양 (고체는 MW로 g, stock 용액은 µL·mL) ----------
// 프리셋 행: 최종 농도 fin (단위 finUnit, 없으면 mM) · 고체는 MW val, stock 용액은 stock 농도 val (단위 unit)
// 기본 프리셋은 id가 정해져 있음 → '기본 프리셋 되돌리기'가 이 id로 찾아 처음 값으로
const BASE_PRESETS = [
  { id: 'pbs', name: 'PBS 1X', ph: '목표 pH 7.4', rows: [
    { name: 'NaCl', val: 58.44, fin: 137 },
    { name: 'KCl', val: 74.55, fin: 2.7 },
    { name: 'Na₂HPO₄ (무수)', val: 141.96, fin: 10 },
    { name: 'KH₂PO₄', val: 136.09, fin: 1.8 }] },
  { id: 'tbs', name: 'TBS 1X', ph: '목표 pH 7.6 (HCl로)', rows: [
    { name: 'Tris base', val: 121.14, fin: 50 },
    { name: 'NaCl', val: 58.44, fin: 150 }] },
  { id: 'tae', name: '10X TAE', ph: '보통 pH를 따로 맞추지 않아요 (1X에서 약 8.3)', rows: [
    { name: 'Tris base', val: 121.14, fin: 400 },
    { name: '빙초산', kind: 'stock', val: 17.4, unit: 'M', fin: 200 },
    { name: 'EDTA (pH 8.0)', kind: 'stock', val: 0.5, unit: 'M', fin: 10 }] },
];
// 지금 프리셋 목록. calc.html?lab={PI uid} 로 열면 calc-sync.js가 그 PI의 프리셋으로 바꾸고(setPresets),
// 그 PI가 이 브라우저에서 로그인해 있으면 고칠 수 있게 저장 함수를 줌(setPresetOwner) — 학생은 보기만
let presets = structuredClone(BASE_PRESETS), savePresets = null, drawPresets = () => {};
function setPresets(list) { if (Array.isArray(list)) { presets = list; drawPresets(); } }
function setPresetOwner(save, lab) {
  savePresets = save;
  drawPresets();
  const box = $('calcShare'), link = `${location.origin}${location.pathname}?lab=${lab}`;
  box.hidden = !save;
  if (!save) return;
  const copy = h('button', 'link-btn calc-copy', '링크 복사');
  copy.type = 'button';
  copy.onclick = () => navigator.clipboard.writeText(link).then(() => { copy.textContent = '복사했어요'; }, () => prompt('이 링크를 복사해 주세요', link));
  box.replaceChildren('🔗 학생에게는 이 링크를 나눠 주세요 (버퍼 프리셋이 같이 보여요) ', copy);
}
// 그 PI인데 프리셋을 못 불러왔을 때만 (덮어쓰지 않게 고치기는 끔)
function presetError(text) { const box = $('calcShare'); box.hidden = false; box.replaceChildren(`⚠️ ${text}`); }
// 성분 한 행: 이름 · 종류(고체 MW / stock 용액) · MW 또는 stock 농도 · 최종 농도. 종류를 바꾸면 단위 칸을 새로 그림 (최종 농도는 그대로)
function bufRow(d, onDel) {
  const r = {};
  r.name = h('input', 'calc-text');
  r.name.value = d.name || '';
  r.name.placeholder = '성분명';
  r.kind = select([['mw', '고체 (MW)'], ['stock', 'stock 용액']], d.kind || 'mw');
  r.kind.className = 'calc-kind';
  const del = h('button', 'link-btn', '빼기');
  del.type = 'button';
  del.onclick = () => onDel(r);
  const fields = h('div', 'calc-fields');
  const draw = v => {
    const fins = r.kind.value === 'mw' ? MOLAR : CONC;
    r.val = r.kind.value === 'mw' ? numField('MW', 'g/mol', null, { value: v.val }) : numField('stock 농도', Object.keys(CONC), v.unit || 'M', { value: v.val });
    r.fin = numField('최종 농도', Object.keys(fins), v.finUnit in fins ? v.finUnit : 'mM', { value: v.fin });
    fields.replaceChildren(r.val.el, r.fin.el);
  };
  draw(d);
  r.kind.onchange = () => draw({ fin: r.fin.input.value, finUnit: r.fin.sel.value });
  r.el = h('div', 'calc-row', h('div', 'calc-row-head', r.name, r.kind, del), fields);
  r.data = () => ({ name: r.name.value.trim(), kind: r.kind.value, val: r.val.input.value, unit: r.val.sel?.value, fin: r.fin.input.value, finUnit: r.fin.sel.value });
  return r;
}
function bufferCard() {
  let rows = [];
  const vol = numField('최종 부피', Object.keys(VOL), 'mL', { ph: '예: 500' });
  const list = h('div'), out = h('div'), presetNote = h('span');
  const update = () => {
    const V = num(vol.input);
    if (!rows.length) return say(out, '프리셋을 고르거나 성분을 추가해 주세요');
    if (V == null) return say(out, '최종 부피를 넣어 주세요');
    if (bad(V)) return say(out, BAD);
    const L = V * VOL[vol.sel.value];
    const amount = r => {
      const a = num(r.val.input), c = num(r.fin.input), au = r.val.sel?.value, cu = r.fin.sel.value, note = t => h('span', 'hint', t);
      if (a == null || c == null) return note('값을 채워 주세요');
      if (bad(a) || bad(c)) return note('0보다 큰 값을 넣어 주세요');
      if (!au) return h('b', null, `${fmt(c * MOLAR[cu] * L * a)} g`); // 고체 (MW 칸엔 단위 고르기가 없음)
      if (concKind(au) !== concKind(cu)) return note('stock과 단위 종류를 맞춰 주세요');
      if (c * CONC[cu] > a * CONC[au]) return note('stock보다 진할 수 없어요');
      return h('b', null, fmtVol(c * CONC[cu] * L / (a * CONC[au])));
    };
    out.className = 'calc-out';
    out.replaceChildren(h('table', 'tbl calc-tbl',
      h('thead', null, h('tr', null, h('th', null, '성분'), h('th', 'r', '넣을 양'))),
      h('tbody', null, rows.map((r, i) => h('tr', null, h('td', null, r.name.value.trim() || `성분 ${i + 1}`), h('td', 'r', amount(r)))))),
    h('small', null, `증류수로 최종 ${V} ${vol.sel.value}까지 채워요`));
  };
  const add = d => {
    const r = bufRow(d, x => { rows = rows.filter(y => y !== x); x.el.remove(); update(); });
    rows.push(r);
    list.append(r.el);
    return r;
  };
  // 프리셋: 행을 통째로 바꿈 (최종 부피가 비어 있으면 1 L)
  const load = p => {
    rows = [];
    list.replaceChildren();
    p.rows.forEach(add);
    if (vol.input.value === '') { vol.input.value = 1; vol.sel.value = 'L'; }
    presetNote.textContent = p.ph ? ` ${p.name}: ${p.ph}.` : '';
    update();
  };
  add({});
  const plus = h('button', 'cat-new calc-add', '+ 성분 추가');
  plus.type = 'button';
  plus.onclick = () => { add({}).name.focus(); update(); };
  // 프리셋 줄: 누르면 불러오기. 고칠 수 있으면(그 PI) 길게 눌러(PC는 오른쪽 클릭) 고치기·지우기, 끝의 + 로 지금 표를 저장
  const presetRow = h('div', 'calc-presets');
  const filled = () => rows.map(r => r.data()).filter(x => x.name || x.val || x.fin); // 지금 표 (빈 행 빼고)
  const commit = () => { drawPresets(); savePresets?.(presets); };
  const addPreset = () => {
    const data = filled();
    const restore = h('button', 'link-btn', '기본 프리셋 되돌리기');
    restore.type = 'button';
    restore.onclick = () => {
      if (!confirm('기본 프리셋(PBS 1X·TBS 1X·10X TAE)을 처음 값으로 되돌릴까요?\n직접 만든 프리셋은 그대로예요.')) return;
      presets = [...structuredClone(BASE_PRESETS), ...presets.filter(p => !BASE_PRESETS.some(b => b.id === p.id))];
      dlg.close();
      commit();
    };
    ask('버퍼 프리셋 추가', data.length ? [{ key: 'name', label: '이름', required: true, placeholder: '예: RIPA buffer' },
      { key: 'ph', label: 'pH·메모 (불러오면 아래에 보여요)', placeholder: '예: 목표 pH 8.0' }] : [], v => {
      presets.push({ id: Math.random().toString(36).slice(2, 9), name: v.name.trim(), ph: v.ph.trim(), rows: data });
      commit();
    }, [h('p', 'hint', data.length ? `지금 표의 성분 ${data.length}개를 저장해요. 학생이 링크를 열면 같이 보여요.` : '성분 행을 먼저 채우면 지금 표를 프리셋으로 저장할 수 있어요.'),
      h('p', 'hint', '프리셋을 길게 누르면(PC는 오른쪽 클릭) 이름을 바꾸거나 지울 수 있어요.'), h('p', null, restore)], data.length > 0);
  };
  const editPreset = p => {
    const data = filled(), replace = h('input'), del = h('button', 'btn danger small', '이 프리셋 지우기');
    replace.type = 'checkbox';
    replace.name = 'replace';
    del.type = 'button';
    del.onclick = () => {
      if (!confirm(`'${p.name}' 프리셋을 지울까요?`)) return;
      presets = presets.filter(x => x !== p);
      dlg.close();
      commit();
    };
    ask('버퍼 프리셋 고치기', [{ key: 'name', label: '이름', value: p.name, required: true }, { key: 'ph', label: 'pH·메모', value: p.ph }], v => {
      p.name = v.name.trim();
      p.ph = v.ph.trim();
      if (v.replace) p.rows = data;
      commit();
    }, [data.length ? h('label', 'check calc-check', replace, `성분을 지금 표(${data.length}개)로 바꾸기`) : null, h('p', null, del)]);
  };
  drawPresets = () => {
    const chips = presets.map(p => {
      const b = h('button', 'btn small', p.name);
      b.type = 'button';
      b.onclick = () => load(p);
      if (savePresets) {
        b.title = '누르면 불러오기 · 길게 누르면(PC는 오른쪽 클릭) 고치기';
        holdable(b, () => editPreset(p));
      }
      return b;
    });
    const more = savePresets ? h('button', 'btn small calc-preset-add', '+') : null;
    if (more) { more.type = 'button'; more.title = '지금 표를 프리셋으로 저장'; more.onclick = addPreset; }
    presetRow.hidden = !chips.length && !more;
    presetRow.replaceChildren(h('span', 'hint', '프리셋'), ...chips, ...(more ? [more] : []));
  };
  drawPresets();
  return card('🧪 버퍼 조제', '성분별로 넣을 양을 계산해요 · 프리셋은 불러온 뒤 고칠 수 있어요', update,
    presetRow, h('div', 'calc-fields', vol.el), list, plus, out, h('p', 'hint calc-note', '💡 pH는 pH 미터로 직접 맞춰 주세요.', presetNote));
}

// ---------- 4. 세포 seeding: hemocytometer(또는 직접 입력) → cells/mL → 현탁액 + 배지 ----------
// 플레이트: [이름, 웰 면적 cm², 권장 부피, 단위] — Corning·Thermo 기준 (제조사마다 조금 다름)
const PLATES = [['6-well', 9.6, 2, 'mL'], ['12-well', 3.8, 1, 'mL'], ['24-well', 1.9, 500, 'µL'], ['48-well', 0.95, 300, 'µL'], ['96-well', 0.32, 100, 'µL']];
const POW = [['1e3', '×10³'], ['1e4', '×10⁴'], ['1e5', '×10⁵'], ['1e6', '×10⁶'], ['1e7', '×10⁷']]; // 큰 수는 숫자 × 10ⁿ 로 (폰 숫자 키패드엔 e가 없음)
function cellCard() {
  let direct = false;
  // 세포 농도: hemocytometer (큰 사각형 한 칸 = 0.1 µL → × 10⁴) 또는 직접
  const avg = numField('사각형 평균 세포 수', null, null, { ph: '예: 50' });
  const dil = numField('희석배수', null, null, { ph: '예: 2' });
  const conc = numField('세포 농도 (cells/mL)', POW.slice(1), '1e6', { ph: '예: 1.2', wide: true });
  const countOut = h('div');
  const hemo = h('div', null, h('div', 'calc-fields', avg.el, dil.el), h('p', 'hint calc-formula', 'cells/mL = 평균 × 희석배수 × 10⁴ (큰 사각형 한 칸 = 0.1 µL)'), countOut);
  const own = h('div', 'calc-fields', conc.el);
  own.hidden = true;
  const modes = [['hemocytometer', false], ['직접 입력', true]].map(([t, d]) => {
    const b = h('button', d ? null : 'on', t);
    b.type = 'button';
    b.onclick = () => {
      direct = d;
      for (const x of modes) x.classList.toggle('on', x === b);
      hemo.hidden = d;
      own.hidden = !d;
      update();
    };
    return b;
  });
  // 심기: 플레이트를 고르면 웰 면적·권장 부피를 채움 (고쳐 써도 됨)
  const plate = select(PLATES.map(p => p[0]), '96-well');
  const area = numField('웰 면적', 'cm²', null, { value: 0.32 });
  const target = numField('목표 세포 수', POW.slice(0, 4), '1e4', { ph: '예: 1', wide: true });
  const per = select([['well', 'cells/well'], ['cm2', 'cells/cm²']], 'well');
  target.box.append(per);
  const vpw = numField('well당 부피', ['µL', 'mL'], 'µL', { value: 100 });
  const wells = numField('웰 수', null, null, { ph: '예: 60' });
  const margin = numField('여유분', '%', null, { value: 10 });
  plate.onchange = () => {
    const p = PLATES.find(x => x[0] === plate.value);
    area.input.value = p[1];
    vpw.input.value = p[2];
    vpw.sel.value = p[3];
  };
  const out = h('div');
  const update = () => {
    let c;
    if (direct) { const v = num(conc.input); c = v == null ? null : v * +conc.sel.value; }
    else {
      const a = num(avg.input), d = num(dil.input);
      c = a == null || d == null ? null : a * d * 1e4;
      if (c == null) say(countOut, '평균 세포 수와 희석배수를 넣어 주세요');
      else if (bad(c)) say(countOut, BAD);
      else show(countOut, `${sci(c)} cells/mL`);
    }
    if (c == null || bad(c)) return say(out, '세포 농도를 먼저 넣어 주세요');
    const cm2 = per.value === 'cm2', t = num(target.input), v = num(vpw.input), n = num(wells.input), a = cm2 ? num(area.input) : 1, m = num(margin.input) ?? 0;
    if ([t, v, n, a].includes(null)) return say(out, `목표 세포 수·${cm2 ? '웰 면적·' : ''}well당 부피·웰 수를 넣어 주세요`);
    if ([t, v, n, a].some(bad)) return say(out, BAD);
    if (!(m >= 0)) return say(out, '여유분은 0 이상으로 넣어 주세요');
    const perWell = t * +target.sel.value * a, vml = v * (vpw.sel.value === 'mL' ? 1 : 1e-3);
    const W = Math.ceil(+(n * (1 + m / 100)).toFixed(6)); // 여유분까지 웰 수 (소수면 올림, 60 × 1.1 = 66.00000000000001 같은 오차는 버림)
    const total = W * vml, susp = W * perWell / c;
    if (susp > total) return say(out, `세포가 묽어요. 최소 ${sci(perWell / vml)} cells/mL이 있어야 해요 (원심분리해 농축해 주세요)`, 'warn');
    show(out, `현탁액 ${fmt(susp)} mL + 배지 ${fmt(rest(total, susp))} mL`, `총 ${fmt(total)} mL · ${W} well 분량 (${n} + 여유 ${m}%) · 세포 ${sci(W * perWell)}개`);
  };
  return card('🧫 세포 seeding', 'hemocytometer → cells/mL → 현탁액 + 배지', update,
    h('div', 'calc-sec', '① 세포 세기'), h('div', 'seg calc-seg', modes), hemo, own,
    h('div', 'calc-sec', '② 심기'),
    h('div', 'calc-fields', h('label', 'field', '플레이트', plate), area.el, target.el, vpw.el, wells.el, margin.el), out);
}

// ---------- 테마: 앱(◐)과 같은 저장 키 → 같은 기기면 같은 테마 ----------
const THEME_KEY = 'lab-manager-theme';
function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
try { applyTheme(localStorage.getItem(THEME_KEY)); } catch { /* 없음 */ }
$('themeBtn').onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const t = dark ? 'light' : 'dark';
  applyTheme(t);
  try { localStorage.setItem(THEME_KEY, t); } catch { /* 없음 */ }
};

// ---------- 왼쪽 목록: 누른 계산기만 보임 (나머지는 숨겨 두기만 해서 넣은 값은 그대로) ----------
const CALCS = [['⚖️', '몰농도', molarCard()], ['💧', '희석', dilutionCard()], ['🧪', '버퍼 조제', bufferCard()], ['🧫', '세포 seeding', cellCard()]];
const tabs = CALCS.map(([emoji, name], i) => {
  const b = h('button', 'note-row', h('span', 'note-emoji', emoji), h('span', 'note-title', name));
  b.type = 'button';
  b.onclick = () => pick(i);
  return b;
});
function pick(i) {
  CALCS.forEach(([, , el], j) => { el.hidden = j !== i; tabs[j].classList.toggle('on', j === i); });
}
$('calcNav').replaceChildren(...tabs);
$('calcMain').replaceChildren(...CALCS.map(c => c[2]));
pick(0);
