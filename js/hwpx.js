'use strict';
// ---------- 서류 → 한글 파일(hwpx): 화면에 그린 A4 종이를 그대로 옮김 ----------
// 표·테두리 상자는 칸 경계·크기·테두리·배경을 화면에서 재서 (1px = 75 HWPUNIT), 글은 문단마다 글자 크기·굵기·정렬·줄 간격만 옮김.
// 종이 한 장 = 한 쪽 (여백도 화면과 같게). 도장·서명 그림은 빠지고 '(인)'처럼 글로, 영문 레터(레터헤드 배경)는 버튼이 없음 (docs.js)
// 파일 = ZIP (mimetype을 맨 앞에 압축 없이) + Contents/header.xml(글자·문단·테두리 모양 목록) + Contents/section0.xml(본문).
// 틀은 한글이 만든 빈 문서와 같게, 줄 배치(linesegarray)는 안 넣음 → 한글이 열 때 다시 계산
const HU = 75; // CSS 1px = 1/96 inch, 1 inch = 7200 HWPUNIT. 글자 크기(1/100 pt)도 px × 75
const NS = 'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hp10="http://www.hancom.co.kr/hwpml/2016/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/history" xmlns:hm="http://www.hancom.co.kr/hwpml/2011/master-page" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:ooxmlchart="http://www.hancom.co.kr/hwpml/2016/ooxmlchart" xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar" xmlns:epub="http://www.idpf.org/2007/ops" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>';
const xmlText = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function saveHwpx(f, d) {
  try {
    const name = docFileName(f, d) || d.title;
    const blob = await zipFiles(f.hwpx ? await hwpxFromTemplate(f) : hwpxParts([...document.querySelectorAll('#docMain .paper')], d.title));
    const a = h('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.hwpx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch (e) {
    console.error(e);
    alert(`hwpx로 저장하지 못했어요: ${e.message}`);
  }
}

// ---------- 원본 hwpx를 틀로: forms/*.hwpx(빈 원본)의 칸에 화면의 값을 넣음 → 글꼴·선·칸 크기가 원본 그대로 ----------
// 양식의 hwpx = { src, fill(T, v, list) }. v(칸 이름) = 화면에 보이는 값(자동 계산·내 정보 포함, 칸이 없으면 null),
// list(i => [칸 이름…]) = 되풀이 줄의 값 목록, T = 틀 고치기 (hwpxTemplate). 값이 빈 칸은 원본 글(빈칸·'원' 등)을 그대로 둠
const HPNS = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
async function hwpxFromTemplate(f) {
  const res = await fetch(f.hwpx.src);
  if (!res.ok) throw new Error(`원본 양식(${f.hwpx.src})을 못 불러왔어요.`);
  const files = (await unzipFiles(await res.arrayBuffer())).filter(([n]) => n !== 'Preview/PrvImage.png'); // 미리보기 그림은 빈 양식이라 뺌
  const sec = files.find(([n]) => n === 'Contents/section0.xml');
  const doc = new DOMParser().parseFromString(new TextDecoder().decode(sec[1]), 'application/xml');
  f.hwpx.fill(hwpxTemplate(doc), docValue, docList);
  sec[1] = XML + new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>/, '');
  return files;
}
function docValue(k) {
  const el = document.querySelector(`#docMain .paper [data-f="${CSS.escape(k)}"]`);
  if (!el) return null;
  if (el.classList.contains('choice')) { const o = el.dataset.options.split('|'); return [...el.querySelectorAll('.opt')].flatMap((x, i) => (x.classList.contains('on') ? [o[i]] : [])).join('|'); }
  return (el.tagName === 'INPUT' ? el.value : el.innerText).trim();
}
function docList(keys) { // 칸이 없는 줄에서 끝, 끝의 빈 줄은 뺌
  const out = [];
  for (let i = 1; docValue(keys(i)[0]) != null; i++) out.push(keys(i).map(docValue));
  while (out.length && out.at(-1).every(x => !x)) out.pop();
  return out;
}
// 틀 고치기. 표 번호 ti = 문서 순서 (0부터), r·c = 원본 칸 주소 (병합 칸은 왼쪽 위). 고친 문단은 줄 배치(linesegarray)를 지워 한글이 다시 계산
function hwpxTemplate(doc) {
  const kids = (el, n) => [...el.children].filter(x => x.localName === n), kid = (el, n) => kids(el, n)[0];
  const tops = () => kids(doc.documentElement, 'p'), tbl = ti => doc.getElementsByTagNameNS(HPNS, 'tbl')[ti];
  const addr = tc => +kid(tc, 'cellAddr').getAttribute('rowAddr');
  const added = []; // 표마다 늘린 줄 [[원본 행, 줄 수]] → 원본 행 번호를 지금 행 번호로
  const now = (ti, r) => r + (added[ti] || []).reduce((a, [at, n]) => a + (r > at ? n : 0), 0);
  const cellNow = (ti, r, c) => kids(tbl(ti), 'tr').flatMap(tr => kids(tr, 'tc')).find(tc => addr(tc) === r && +kid(tc, 'cellAddr').getAttribute('colAddr') === c);
  const cell = (ti, r, c) => cellNow(ti, now(ti, r), c);
  const paras = tc => kids(kid(tc, 'subList'), 'p');
  const text = p => kids(p, 'run').flatMap(r => kids(r, 't')).map(t => [...t.childNodes].map(x => (x.nodeType === 3 ? x.data : x.localName === 'fwSpace' ? '\u3000' : ' ')).join('')).join('');
  const put = (p, s) => { // 문단 글을 s로 — 글이 가장 많던 run의 글자 모양으로 (앞의 빈칸 한 칸만 다른 글꼴인 경우가 있음)
    const runs = kids(p, 'run'), len = x => kids(x, 't').reduce((a, t) => a + t.textContent.length, 0), r = runs.reduce((a, x) => (len(x) > len(a) ? x : a), runs[0]);
    for (const x of runs) for (const t of kids(x, 't')) t.remove();
    for (const x of runs) if (x !== r && !x.children.length) x.remove();
    const t = doc.createElementNS(HPNS, 'hp:t');
    t.textContent = s;
    r.append(t);
    kid(p, 'linesegarray')?.remove();
  };
  const lines = (list, i, value) => { // list[i]부터 줄마다 한 문단 (모자라면 앞 문단을 복제)
    let p = list[Math.min(i, list.length - 1)];
    value.split('\n').forEach((s, k) => {
      if (k || i >= list.length) { const q = p.cloneNode(true); p.after(q); p = q; }
      put(p, s);
    });
  };
  const has = x => x != null && String(x).trim() !== '';
  const fill = (tc, value, at) => { if (has(value)) lines(paras(tc), at, String(value).replace(/\n+$/, '')); };
  const width = x => [...x].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0); // 한글은 빈칸 두 개 너비로
  const grow = (el, k, d) => el.setAttribute(k, +el.getAttribute(k) + d);
  const T = {
    set(ti, r, c, value, at = 0) { fill(cell(ti, r, c), value, at); }, // 칸의 at번째 문단부터
    edit(ti, r, c, fn) { for (const p of paras(cell(ti, r, c))) { const s = text(p), t = fn(s); if (t !== s) put(p, t); } },
    top(re, value, offset = 0) { // 본문 문단 (re에 맞는 문단 + offset). value가 함수면 그 문단 글을 고침
      const ps = tops(), i = ps.findIndex(p => re.test(text(p)));
      if (i < 0) return;
      if (typeof value === 'function') { const s = text(ps[i + offset]), t = value(s); if (t !== s) put(ps[i + offset], t); } else if (has(value)) lines(ps, i + offset, String(value).replace(/\n+$/, ''));
    },
    // '성 명 :          (인)' → '성 명 : 홍길동    (인)' — re = /(칸 이름)\s*/, 뒤 빈칸은 값 너비만큼만 줄임
    after: (...pairs) => s => pairs.reduce((s, [re, x]) => (has(x) ? s.replace(re, (m, label) => `${label} ${x}${' '.repeat(Math.max(1, m.length - label.length - 1 - width(x)))}`) : s), s),
    check(ti, r, c, picked) { const os = String(picked || '').split('|').filter(Boolean); T.edit(ti, r, c, s => os.reduce((s, o) => s.replace(`□ ${o}`, `☑ ${o}`).replace(`${o} □`, `${o} ☑`), s)); },
    rows(ti, tr, n) { // 원본 tr행을 n번 복제해 바로 뒤에 (아래 행 주소·위에서 걸친 칸·표 크기를 맞춤). 그 뒤 원본 행 번호는 알아서 밀림
      if (n <= 0) return;
      const r = now(ti, tr), t = tbl(ti), row = kids(t, 'tr').find(tr => addr(kid(tr, 'tc')) === r), h = +kid(kid(row, 'tc'), 'cellSz').getAttribute('height');
      for (const tc of kids(t, 'tr').flatMap(tr => kids(tr, 'tc'))) {
        const a = addr(tc), span = kid(tc, 'cellSpan');
        if (a > r) grow(kid(tc, 'cellAddr'), 'rowAddr', n);
        else if (a < r && a + +span.getAttribute('rowSpan') > r) { grow(span, 'rowSpan', n); grow(kid(tc, 'cellSz'), 'height', n * h); }
      }
      for (let k = n; k > 0; k--) {
        const q = row.cloneNode(true);
        for (const tc of kids(q, 'tc')) { kid(tc, 'cellAddr').setAttribute('rowAddr', r + k); for (const p of paras(tc)) put(p, ''); }
        row.after(q);
      }
      grow(t, 'rowCnt', n);
      grow(kid(t, 'sz'), 'height', n * h);
      (added[ti] ||= []).push([tr, n]);
    },
    grid(ti, first, last, items, cols) { // first~last행에 한 줄씩. 모자라면 끝에서 둘째 행을 복제 (마지막 행 아래 굵은 선은 그대로)
      T.rows(ti, last - 1, items.length - (last - first + 1));
      items.forEach((row, i) => row.forEach((x, j) => fill(cellNow(ti, now(ti, first) + i, cols[j]), x, 0)));
    },
    from(re) { // re에 맞는 문단 앞(앞쪽 안내 쪽 등)을 지움. 쪽 설정(첫 문단의 secPr run)은 그 문단으로 옮김
      const ps = tops(), i = ps.findIndex(p => re.test(text(p)));
      if (i <= 0) return;
      ps[i].prepend(kids(ps[0], 'run').find(x => kid(x, 'secPr')));
      ps[i].setAttribute('pageBreak', '0');
      for (const p of ps.slice(0, i)) p.remove();
    },
  };
  return T;
}

// 종이들 → hwpx 안 파일 [이름, 내용]
function hwpxParts(papers, title) {
  // 모양 목록: 같은 모양은 한 번만 (번호 = 목록 자리). 테두리는 1번부터 (1 = 없음, 2 = 없음 + 빈 채우기 — 글자·문단 모양이 가리킴)
  const chars = [], paras = [], fills = ['', 'none'].map(bg => `NONE 0.1|NONE 0.1|NONE 0.1|NONE 0.1|${bg}`), texts = [];
  const idOf = (list, key) => { const i = list.indexOf(key); return i < 0 ? list.push(key) - 1 : i; };
  const css = el => getComputedStyle(el);
  const ALIGN = { center: 'CENTER', right: 'RIGHT', end: 'RIGHT', justify: 'JUSTIFY' };
  const FLEX = { center: 'CENTER', 'flex-end': 'RIGHT', end: 'RIGHT', right: 'RIGHT' };
  const VALIGN = { middle: 'CENTER', bottom: 'BOTTOM' };
  const charId = s => idOf(chars, `${Math.round(parseFloat(s.fontSize) * HU)}|${+s.fontWeight >= 600 ? 1 : 0}`);
  const paraId = (s, align) => idOf(paras, `${align || ALIGN[s.textAlign] || 'LEFT'}|${Math.round((parseFloat(s.lineHeight) / parseFloat(s.fontSize) || 1.6) * 100)}`);
  const base = css(papers[0]);
  charId(base); paraId(base); // 0번 = 종이 기본 글자·문단 (바탕글)
  const color = c => { const m = c.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0]; return m[3] === 0 || m.slice(0, 3).every(x => x === 255) ? '' : `#${m.slice(0, 3).map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`; };
  // 양식 선은 모두 1.4px(≈ 0.4mm). 계산된 굵기는 화면 배율에 따라 1px 안팎으로 반올림돼서 있다·없다만 봄
  const SIDES = ['Left', 'Right', 'Top', 'Bottom'];
  const side = (s, k) => (/^(none|hidden)$/.test(s[`border${k}Style`]) || !parseFloat(s[`border${k}Width`]) ? 'NONE 0.1' : 'SOLID 0.4');
  const isBox = s => SIDES.every(k => side(s, k) !== 'NONE 0.1'); // 네 변에 다 테두리 → 1칸 표로
  const isBlock = el => !/^(inline|none|contents)/.test(css(el).display);
  let n = 0; // 문단·표 번호

  const run = (cr, t) => `<hp:run charPrIDRef="${cr}">${t ? `<hp:t>${xmlText(t)}</hp:t>` : '<hp:t/>'}</hp:run>`;
  const P = (pr, cr, runs) => `<hp:p id="${n++}" paraPrIDRef="${pr}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">${runs}</hp:p>`;
  const lines = (el, text, align) => {
    const s = css(el), pr = paraId(s, align), cr = charId(s);
    return text.replace(/\n$/, '').split('\n').map(t => { texts.push(t); return P(pr, cr, run(cr, t)); });
  };
  // el 안의 내용 → 문단 목록. 표·테두리 상자는 표 문단 하나, 블록은 따로, 블록 사이 글은 el 모양으로
  function content(el) {
    const s = css(el), kids = [...el.children].filter(k => css(k).display !== 'none');
    if (/flex/.test(s.display) && !s.flexDirection.startsWith('column') && kids.length) // 가로로 늘어놓은 것(서명 줄 등)은 한 줄로
      return lines(el, kids.map(k => k.innerText.trim()).join('    '), FLEX[s.justifyContent]);
    if (!kids.some(isBlock)) {
      const li = el.tagName === 'LI' ? `${el.parentElement.tagName === 'OL' ? `${[...el.parentElement.children].indexOf(el) + 1}.` : '•'} ` : '';
      return lines(el, li + el.innerText);
    }
    const out = [];
    let buf = [], prev = null; // prev = 바로 앞 블록(또는 'text' = 글) → 사이 간격만큼 빈 줄
    const flush = () => {
      const t = buf.map(x => (x.nodeType === 3 ? x.data : x.innerText)).join('').replace(/\s+/g, ' ').trim();
      if (t) { out.push(...lines(el, t)); prev = 'text'; }
      buf = [];
    };
    for (const x of el.childNodes) {
      if (x.nodeType === 1 && css(x).display === 'none') continue;
      if (x.nodeType === 1 && isBlock(x)) {
        flush();
        const gap = prev === 'text' ? parseFloat(css(x).marginTop) : prev ? rect(x).top - rect(prev).bottom : 0;
        if (gap >= 3) { const cr = idOf(chars, `${Math.round(gap * HU)}|0`); out.push(P(idOf(paras, 'LEFT|100'), cr, run(cr, ''))); }
        if (x.tagName === 'TABLE') out.push(table(x, grid(x)));
        else if (isBox(css(x))) out.push(table(x, [{ el: x, r: 0, c: 0, rs: 1, cs: 1 }]));
        else out.push(...content(x));
        prev = x;
      } else if (x.nodeType === 1 || x.nodeType === 3) buf.push(x);
    }
    flush();
    return out;
  }
  // HTML 표의 칸 자리 (rowspan·colspan 반영)
  function grid(t) {
    const taken = [], cells = [], nr = t.rows.length;
    [...t.rows].forEach((tr, r) => {
      let c = 0;
      for (const td of tr.cells) {
        while (taken[r]?.[c]) c++;
        const rs = Math.min(td.rowSpan || 1, nr - r), cs = td.colSpan || 1;
        for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) (taken[i] ||= [])[j] = true;
        cells.push({ el: td, r, c, rs, cs });
        c += cs;
      }
    });
    return cells;
  }
  // 칸 경계를 화면에서 재서 (병합 칸도 같은 경계를 쓰니 줄마다 너비 합이 맞음). 잴 칸이 없는 경계는 앞뒤 사이로
  function table(box, cells) {
    const o = rect(box), X = [], Y = [];
    for (const { el, r, c, rs, cs } of cells) {
      const b = rect(el);
      X[c] ??= b.left - o.left; X[c + cs] ??= b.right - o.left;
      Y[r] ??= b.top - o.top; Y[r + rs] ??= b.bottom - o.top;
    }
    const hu = A => {
      for (let i = 1; i < A.length; i++) if (A[i] == null) { let j = i; while (A[j] == null) j++; A[i] = A[i - 1] + (A[j] - A[i - 1]) / (j - i + 1); }
      return A.map(v => Math.round((v - A[0]) * HU));
    };
    const x = hu(X), y = hu(Y), nc = x.length - 1, nr = y.length - 1, rows = Array.from({ length: nr }, () => []);
    for (const { el, r, c, rs, cs } of cells) {
      const s = css(el), pad = k => Math.round(parseFloat(s[`padding${k}`]) * HU);
      const fill = idOf(fills, `${SIDES.map(k => side(s, k)).join('|')}|${el.dataset.f == null ? color(s.backgroundColor) : ''}`) + 1; // 노란 입력 칸 배경은 화면용
      const body = content(el);
      rows[r].push(`<hp:tc name="" header="0" hasMargin="1" protect="0" editable="0" dirty="0" borderFillIDRef="${fill}">`
        + `<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="${el.tagName === 'TD' ? VALIGN[s.verticalAlign] || 'TOP' : 'TOP'}" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">${body.join('') || P(0, 0, run(0, ''))}</hp:subList>`
        + `<hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="${cs}" rowSpan="${rs}"/><hp:cellSz width="${x[c + cs] - x[c]}" height="${y[r + rs] - y[r]}"/>`
        + `<hp:cellMargin left="${pad('Left')}" right="${pad('Right')}" top="${pad('Top')}" bottom="${pad('Bottom')}"/></hp:tc>`);
    }
    const id = n++;
    // 글자처럼 취급하지 않음 → 쪽을 넘으면 나뉨. 표를 단 문단은 표 아래 빈 줄이 되니 1pt로
    const pr = idOf(paras, 'LEFT|100'), cr = idOf(chars, '100|0');
    return P(pr, cr, `<hp:run charPrIDRef="${cr}"><hp:tbl id="${id}" zOrder="${id}" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="0" rowCnt="${nr}" colCnt="${nc}" cellSpacing="0" borderFillIDRef="1" noAdjust="0">`
      + `<hp:sz width="${x[nc]}" widthRelTo="ABSOLUTE" height="${y[nr]}" heightRelTo="ABSOLUTE" protect="0"/>`
      + '<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
      + `<hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>${rows.map(r => `<hp:tr>${r.join('')}</hp:tr>`).join('')}</hp:tbl><hp:t/></hp:run>`);
  }

  // 화면 전용(줄 빼기 ×·줄 추가·글자 수)은 잠깐 숨기고 (인쇄와 같은 모양) 칸 크기·위치를 먼저 잼.
  // 그다음 글로 안 읽히는 것(입력 칸 값·도장 그림·고르기 보기 사이)에 잠깐 글을 붙여 읽음 — 붙인 글로 칸이 늘어나도 잰 크기는 그대로
  const hidden = papers.flatMap(p => [...p.querySelectorAll('.row-x, .f-ctl, .f-counter')]);
  for (const el of hidden) el.style.display = 'none';
  const rects = new Map(), rect = el => rects.get(el);
  let added = [], body;
  try {
    for (const p of papers) for (const el of p.querySelectorAll('*')) rects.set(el, el.getBoundingClientRect());
    added = papers.flatMap(p => [
      ...[...p.querySelectorAll('input, img')].map(el => [el, el.tagName === 'IMG' ? el.alt : el.value]),
      ...[...p.querySelectorAll('.choice:not([data-paren]) .opt + .opt')].map(el => [el.previousElementSibling, ' ']),
    ]).map(([el, t]) => { const tn = document.createTextNode(t); el.after(tn); return tn; });
    body = papers.map(p => content(p.querySelector('.paper-in') || p));
  } finally {
    for (const el of hidden) el.style.display = '';
    for (const tn of added) tn.remove();
  }
  // 첫 문단에 쪽 설정(A4·여백 = 종이 여백), 다음 종이는 새 쪽에서
  const mg = k => Math.round(parseFloat(base[`padding${k}`]) * HU);
  const sec = `<hp:run charPrIDRef="0"><hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>`
    + `<hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY"><hp:margin header="0" footer="0" gutter="0" left="${mg('Left')}" right="${mg('Right')}" top="${mg('Top')}" bottom="${mg('Bottom')}"/></hp:pagePr>`
    + '<hp:footNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="EACH_COLUMN" beneathText="0"/></hp:footNotePr>'
    + '<hp:endNotePr><hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/><hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/><hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/><hp:numbering type="CONTINUOUS" newNum="1"/><hp:placement place="END_OF_DOCUMENT" beneathText="0"/></hp:endNotePr>'
    + ['BOTH', 'EVEN', 'ODD'].map(t => `<hp:pageBorderFill type="${t}" borderFillIDRef="1" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER"><hp:offset left="1417" right="1417" top="1417" bottom="1417"/></hp:pageBorderFill>`).join('')
    + '</hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl></hp:run>';
  const section = `${XML}<hs:sec ${NS}>${body.map((list, i) => {
    if (!list.length) list = [P(0, 0, run(0, ''))];
    list[0] = i ? list[0].replace('pageBreak="0"', 'pageBreak="1"') : list[0].replace(/^<hp:p [^>]*>/, m => m + sec);
    return list.join('');
  }).join('')}</hs:sec>`;

  const L7 = v => ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'].map(k => `${k}="${v}"`).join(' ');
  const font = '<hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"><hh:typeInfo familyType="FCAT_GOTHIC" weight="6" proportion="4" contrast="0" strokeVariation="1" armStyle="1" letterform="1" midline="1" xHeight="1"/></hh:font>';
  const lineSet = ls => `<hh:margin>${['intent', 'left', 'right', 'prev', 'next'].map(k => `<hc:${k} value="0" unit="HWPUNIT"/>`).join('')}</hh:margin><hh:lineSpacing type="PERCENT" value="${ls}" unit="HWPUNIT"/>`;
  const levels = [['DIGIT', '^1.'], ['HANGUL_SYLLABLE', '^2.'], ['DIGIT', '^3)'], ['HANGUL_SYLLABLE', '^4)'], ['DIGIT', '(^5)'], ['HANGUL_SYLLABLE', '(^6)'], ['CIRCLED_DIGIT', '^7', 1], ['CIRCLED_HANGUL_SYLLABLE', '^8', 1], ['HANGUL_JAMO', ''], ['ROMAN_SMALL', '', 1]]; // 한글 기본 개요 번호 (쪽 설정이 가리킴)
  const header = `${XML}<hh:head ${NS} version="1.5" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList>`
    + `<hh:fontfaces itemCnt="7">${['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER'].map(l => `<hh:fontface lang="${l}" fontCnt="1">${font}</hh:fontface>`).join('')}</hh:fontfaces>`
    + `<hh:borderFills itemCnt="${fills.length}">${fills.map((key, i) => {
      const v = key.split('|'), bg = v.pop();
      return `<hh:borderFill id="${i + 1}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>`
        + v.map((x, j) => { const [t, w] = x.split(' '); return `<hh:${SIDES[j].toLowerCase()}Border type="${t}" width="${w} mm" color="#000000"/>`; }).join('')
        + `<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/>${bg ? `<hc:fillBrush><hc:winBrush faceColor="${bg}" hatchColor="#999999" alpha="0"/></hc:fillBrush>` : ''}</hh:borderFill>`;
    }).join('')}</hh:borderFills>`
    + `<hh:charProperties itemCnt="${chars.length}">${chars.map((key, i) => {
      const [ht, bold] = key.split('|');
      return `<hh:charPr id="${i}" height="${ht}" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="2"><hh:fontRef ${L7(0)}/><hh:ratio ${L7(100)}/><hh:spacing ${L7(0)}/><hh:relSz ${L7(100)}/><hh:offset ${L7(0)}/>`
        + `${+bold ? '<hh:bold/>' : ''}<hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/><hh:outline type="NONE"/><hh:shadow type="NONE" color="#C0C0C0" offsetX="10" offsetY="10"/></hh:charPr>`;
    }).join('')}</hh:charProperties>`
    + '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>'
    + `<hh:numberings itemCnt="1"><hh:numbering id="1" start="0">${levels.map(([fmt, txt, chk], i) => `<hh:paraHead start="1" level="${i + 1}" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="${fmt}" charPrIDRef="4294967295" checkable="${chk ? 1 : 0}"${txt ? `>${txt}</hh:paraHead>` : '/>'}`).join('')}</hh:numbering></hh:numberings>`
    + `<hh:paraProperties itemCnt="${paras.length}">${paras.map((key, i) => {
      const [al, ls] = key.split('|');
      return `<hh:paraPr id="${i}" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0" textDir="LTR"><hh:align horizontal="${al}" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/>`
        + '<hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="BREAK_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/>'
        + `<hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar">${lineSet(ls)}</hp:case><hp:default>${lineSet(ls)}</hp:default></hp:switch>`
        + '<hh:border borderFillIDRef="2" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr>';
    }).join('')}</hh:paraProperties>`
    + '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles></hh:refList>'
    + '<hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument><hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption><hh:trackchageConfig flags="56"/></hh:head>';

  const now = `${new Date().toISOString().slice(0, 19)}Z`;
  const meta = [['creator', ''], ['subject', ''], ['description', ''], ['lastsaveby', ''], ['CreatedDate', now], ['ModifiedDate', now], ['date', ''], ['keyword', '']];
  return [
    ['mimetype', 'application/hwp+zip'],
    ['version.xml', `${XML}<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" os="1" xmlVersion="1.5" application="Hancom Office Hangul" appVersion="13, 0, 0, 1408 WIN32LEWindows_10"/>`],
    ['Contents/header.xml', header],
    ['Contents/section0.xml', section],
    ['Preview/PrvText.txt', texts.join('\r\n').slice(0, 1024)],
    ['settings.xml', `${XML}<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>`],
    ['META-INF/container.rdf', `${XML}<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">${[['header.xml', 'HeaderFile'], ['section0.xml', 'SectionFile']].map(([p, t]) => `<rdf:Description rdf:about=""><ns0:hasPart xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#" rdf:resource="Contents/${p}"/></rdf:Description><rdf:Description rdf:about="Contents/${p}"><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#${t}"/></rdf:Description>`).join('')}<rdf:Description rdf:about=""><rdf:type rdf:resource="http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document"/></rdf:Description></rdf:RDF>`],
    ['Contents/content.hpf', `${XML}<opf:package ${NS} version="" unique-identifier="" id=""><opf:metadata><opf:title>${xmlText(title)}</opf:title><opf:language>ko</opf:language>${meta.map(([k, v]) => `<opf:meta name="${k}" content="text">${v}</opf:meta>`).join('')}</opf:metadata>`
      + '<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>'
      + '<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>'],
    ['META-INF/container.xml', `${XML}<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/><ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/></ocf:rootfiles></ocf:container>`],
    ['META-INF/manifest.xml', `${XML}<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`],
  ];
}

// ZIP 만들기·풀기 (라이브러리 없이, 브라우저 CompressionStream·DecompressionStream). 만들 때 첫 파일(mimetype)은 압축 없이
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = b => { let c = ~0; for (const x of b) c = CRC_TABLE[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
const le = parts => { // [[값, 바이트 수]] → 리틀 엔디언 바이트
  const b = new Uint8Array(parts.reduce((a, [, k]) => a + k, 0)), v = new DataView(b.buffer);
  let o = 0;
  for (const [x, k] of parts) { if (k === 4) v.setUint32(o, x, true); else v.setUint16(o, x, true); o += k; }
  return b;
};
async function zipFiles(files) {
  const enc = new TextEncoder(), t = new Date(), out = [], dir = [];
  const time = (t.getHours() << 11) | (t.getMinutes() << 5) | (t.getSeconds() >> 1), date = ((t.getFullYear() - 1980) << 9) | ((t.getMonth() + 1) << 5) | t.getDate();
  let at = 0;
  for (const [i, [name, body]] of files.entries()) { // body = 글 또는 바이트
    const raw = typeof body === 'string' ? enc.encode(body) : body, nm = enc.encode(name), method = i ? 8 : 0;
    const data = method ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : raw;
    const common = [[method, 2], [time, 2], [date, 2], [crc32(raw), 4], [data.length, 4], [raw.length, 4], [nm.length, 2]];
    out.push(le([[0x04034b50, 4], [20, 2], [0, 2], ...common, [0, 2]]), nm, data);
    dir.push(le([[0x02014b50, 4], [20, 2], [20, 2], [0, 2], ...common, [0, 2], [0, 2], [0, 2], [0, 2], [0, 4], [at, 4]]), nm);
    at += 30 + nm.length + data.length;
  }
  const size = dir.reduce((a, b) => a + b.length, 0);
  return new Blob([...out, ...dir, le([[0x06054b50, 4], [0, 2], [0, 2], [files.length, 2], [files.length, 2], [size, 4], [at, 4], [0, 2]])], { type: 'application/hwp+zip' });
}
async function unzipFiles(buf, keep = () => true) { // → [[이름, 바이트]] (ZIP 안 순서대로, keep(이름)인 것만)
  const b = new Uint8Array(buf), v = new DataView(b.buffer), utf8 = new TextDecoder(), out = [];
  let e = b.length - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--; // ZIP 끝 (중앙 디렉터리 위치)
  if (e < 0) throw new Error('ZIP 파일이 아니에요.');
  for (let i = 0, p = v.getUint32(e + 16, true); i < v.getUint16(e + 10, true); i++) {
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true), n = v.getUint16(p + 28, true), at = v.getUint32(p + 42, true);
    const name = utf8.decode(b.subarray(p + 46, p + 46 + n));
    p += 46 + n + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    if (!keep(name)) continue;
    const from = at + 30 + v.getUint16(at + 26, true) + v.getUint16(at + 28, true), raw = b.subarray(from, from + size);
    out.push([name, method ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : raw]);
  }
  return out;
}
