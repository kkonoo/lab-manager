'use strict';
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
  const cats = S.cats.map(c => {
    const n = S.items.filter(it => it.cat === c.id).length, b = h('button', cls('cat-head pick', stockView === c.id && 'on'), h('span', 'cat-name', c.name), h('span', 'cat-count', String(n)));
    b.style.setProperty('--c', catColor(c.id));
    b.onclick = () => { stockView = c.id; render(); };
    b.title = '누르면 오른쪽에 · 끌어서 순서 바꾸기 · 길게 누르거나 ✎ 로 이름·색 바꾸기';
    groupEditable(b, () => editStockCat(c));
    dragReorder(b, c.id, S.cats.map(x => x.id), ids => {
      const colors = S.cats.map(x => catColor(x.id)); // 순서대로 붙던 색은 그대로 두고
      S.cats.forEach((x, i) => { x.color ||= colors[i]; });
      S.cats = byIds(S.cats, ids);
      save();
    });
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
  // 고를 목록은 직접 그림: 브라우저 기본 목록(datalist)은 삼성 인터넷 등에서 골라도 앱이 알아채지 못함
  const list = h('div', 'adder-pick');
  list.hidden = true;
  let shown = [], hi = -1;
  const pick = it => { inp.value = it.name; list.hidden = true; commit(); };
  const draw = () => {
    const q = inp.value.trim().toLowerCase().replace(/\s/g, '');
    shown = pickFrom.filter(it => !q || it.name.toLowerCase().replace(/\s/g, '').includes(q)).slice(0, 8);
    hi = Math.min(hi, shown.length - 1);
    list.replaceChildren(...shown.map((it, i) => {
      const b = h('button', cls('adder-opt', i === hi && 'on'), h('span', null, it.name), h('small', null, [stockCat(it.cat)?.name, placeOf(it.place)?.name].filter(Boolean).join(' · ')));
      b.type = 'button';
      b.onpointerdown = e => e.preventDefault(); // 칸에서 포커스가 빠져 목록이 먼저 닫히지 않게
      b.onclick = () => pick(it);
      return b;
    }));
    list.hidden = !shown.length || document.activeElement !== inp;
  };
  inp.addEventListener('focus', draw);
  inp.addEventListener('input', () => { hi = -1; draw(); });
  inp.addEventListener('blur', () => { list.hidden = true; });
  inp.onkeydown = e => {
    if (e.isComposing) return;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && shown.length) { // 위아래 키로 목록 고르기 (-1 = 친 글자 그대로)
      e.preventDefault();
      const n = shown.length;
      hi = e.key === 'ArrowDown' ? (hi + 1 >= n ? -1 : hi + 1) : (hi < 0 ? n - 1 : hi - 1);
      draw();
    }
    else if (e.key === 'Enter') { if (hi >= 0 && shown[hi]) pick(shown[hi]); else commit(); }
    else if (e.key === 'Escape') list.hidden = true;
  };
  return [h('div', 'adder-wrap', inp, list)];
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
const catColor = id => { const i = Math.max(0, db.stock.cats.findIndex(c => c.id === id)); return db.stock.cats[i]?.color || PALETTE[i % PALETTE.length]; }; // 왼쪽 묶음 막대와 같은 색 (고르지 않았으면 순서대로)
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
    const head = h('div', 'place-head', placeIcon(p), h('div', 'place-name', h('b', null, p?.name ?? '위치 미정'),
      h('small', null, [p ? p.temp || k.temp : '', `${items.length}개`, need ? `살 것 ${need}` : ''].filter(Boolean).join(' · '))));
    const card = h('div', cls('place-card', !p && 'none', selPlace !== undefined && (selPlace === id ? 'on' : 'dim')),
      head, h('div', 'place-items', items.length ? items.map(chip) : h('span', 'hint', '비어 있어요')));
    card.style.setProperty('--pc', p ? k.color : '#8B93A1');
    card.onclick = e => { if (e.target.closest('.item-chip')) return; mapSel = selPlace === id && !selItem ? null : { place: id }; render(); };
    // 위치 순서: 이름 줄을 끌어 다른 위치 카드의 왼쪽·오른쪽 절반에 놓으면 그 앞·뒤로 (품목 칩 끌기는 위치 옮기기)
    if (p) {
      head.draggable = true;
      head.title = '끌어서 위치 순서 바꾸기';
      head.ondragstart = e => { e.dataTransfer.setData('text/x-place', p.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setDragImage(card, 20, 20); };
      head.append(touchHandle());
    }
    const side = e => (e.clientX - card.getBoundingClientRect().left > card.offsetWidth / 2 ? 'after' : 'before');
    const clear = () => card.classList.remove('drop', 'drop-before', 'drop-after');
    card.ondragover = e => {
      const placing = e.dataTransfer.types.includes('text/x-place');
      if (placing && !p) return; // 위치 미정 칸 앞뒤로는 못 놓음
      e.preventDefault();
      if (!placing) return card.classList.add('drop');
      card.classList.toggle('drop-before', side(e) === 'before');
      card.classList.toggle('drop-after', side(e) === 'after');
    };
    card.ondragleave = clear;
    card.ondrop = e => {
      e.preventDefault();
      clear();
      const from = e.dataTransfer.getData('text/x-place');
      if (from) {
        if (from === id) return;
        const ids = S.places.map(x => x.id).filter(x => x !== from);
        ids.splice(ids.indexOf(id) + (side(e) === 'after' ? 1 : 0), 0, from);
        S.places = byIds(S.places, ids);
        return save();
      }
      const it = stockItem(e.dataTransfer.getData('text/plain'));
      if (it) { it.place = id || undefined; mapSel = { item: it.id }; save(); }
    };
    return card;
  });
  const add = h('button', 'place-card add', '+ 위치');
  add.onclick = () => editPlace(null);
  const legend = h('div', 'map-legend', S.cats.map(c => h('span', null, h('span', 'dot'), c.name)).map((el, i) => { el.style.setProperty('--cc', catColor(S.cats[i].id)); return el; }),
    h('span', null, h('span', 'dot ring'), '살 것'));
  return h('div', 'panel', h('div', 'panel-head', h('h2', null, '보관 위치'), h('span', 'hint', '위치를 누르면 그곳만 · 품목을 누르면 아래에 자세히 · 품목을 끌어 다른 위치에 놓으면 옮겨져요 · 위치 이름 줄을 끌면 순서'), h('span', 'spacer'), legend),
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
  const people = [...new Set([me, ...(member ? [] : db.people.map(p => p.name)), ...db.orders.map(x => x.by)].filter(Boolean))];
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
    { key: 'color', label: '색', type: 'color', value: c ? catColor(c.id) : newColor(db.stock.cats.map(x => x.color)) },
  ], v => {
    const t = c || { id: uid() };
    t.name = v.name.trim();
    t.equip = !!v.equip;
    if (v.color) t.color = v.color;
    if (!c) db.stock.cats.push(t);
    save();
  }, del ? [h('p', null, del)] : []);
}
