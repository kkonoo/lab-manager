'use strict';
// ---------- 팁 탭 (연구 모드): 앱에 들어 있는 팁(tips/*.md) + PI가 넣는 Google 문서(·슬라이드·시트·Drive PDF) 링크 ----------
// 앱에 들어 있는 팁: tips/ 폴더의 md 파일을 앱 안에서 보기 좋게 그리고 A4로 인쇄. 모든 랩에 같이 보임 (새 팁은 md 파일을 넣고 아래 TIP_FILES에 한 줄)
// 링크 팁: db.stock.tips [{ id, name, emoji, url }] — 랩 메타(sync.js LAB_META)로 랩 멤버와 같이 봄. 넣기·고치기·지우기·순서는 PI만
// 문서는 '링크가 있는 모든 사용자: 뷰어'로 공유해야 학생 폰에서도 보임. 인쇄는 Google 문서에서 (이미 A4)
const TIP_FILES = [ // [tips/파일 이름, 아이콘, 목록에 보일 이름]
  ['slides', '🎤', '발표 · PPT 만들기'],
  ['writing', '✍️', '논문 쓰기'],
  ['phrases', '📝', '논문 표현 (영어)'],
  ['stats', '📊', '통계 검정 · plot 매칭표'],
  ['study-ai', '🤖', '공부 · AI 활용'],
  ['figures', '🎨', '그림 만들기'],
].map(([file, emoji, name]) => ({ id: `md:${file}`, file, emoji, name }));
let selTip = null;
const tipOf = id => TIP_FILES.find(t => t.id === id) || db.stock.tips.find(t => t.id === id);
const tipTexts = new Map(); // 파일 → 받는 중(Promise) / 받은 글 (한 번만 받음)
function tipText(file) {
  if (!tipTexts.has(file)) {
    tipTexts.set(file, fetch(`tips/${file}.md`).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(text => { tipTexts.set(file, text); return text; }, err => { tipTexts.delete(file); throw err; }));
  }
  return Promise.resolve(tipTexts.get(file));
}
// md → 화면 (글 노트와 같은 모양 + 표). 쓰는 것: ## ### 소제목 · - 목록 · 1. 순서 · - [ ] 체크 · > 메모 · | 표 | · **굵게** · `코드`. 맨 위 # 제목은 패널 제목으로
function tipDoc(md) {
  const lines = md.split('\n'), out = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    let m;
    if (t.startsWith('|')) { // 표: 머리 줄 → |---| → 내용 줄들
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
      i--;
      out.push(tipTable(rows));
    } else if ((m = t.match(/^(#{1,3}) (.*)$/))) { if (m[1].length > 1) out.push(h(`h${m[1].length + 1}`, cls('d-h', m[1].length === 3 && 'tip-sub'), tipInline(m[2]))); }
    else if ((m = t.match(/^- \[[ x]\] (.*)$/))) out.push(h('div', 'd-check', h('span', 'tip-box'), h('span', null, tipInline(m[1])))); // 종이에 펜으로 체크
    else if ((m = t.match(/^- (.*)$/))) out.push(h('div', 'd-li', tipInline(m[1])));
    else if ((m = t.match(/^(\d+)\. (.*)$/))) out.push(h('div', 'd-ol', h('span', 'd-num', `${m[1]}.`), h('span', null, tipInline(m[2]))));
    else if ((m = t.match(/^> (.*)$/))) out.push(h('div', 'd-note', tipInline(m[1])));
    else if (t) out.push(h('p', 'd-p', tipInline(t)));
    else if (out.length) out.push(h('div', 'd-gap'));
  }
  return h('div', 'doc tip-md', out);
}
// 칸이 셋 이상인 표는 폰에서 줄마다 카드로 (칸 이름을 위에 작게)
function tipTable(rows) {
  const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const head = cells(rows[0]), body = rows.slice(/^\|[\s:|-]+\|$/.test(rows[1] || '') ? 2 : 1).map(cells);
  return h('div', 'tip-table-wrap', h('table', cls('tip-table', head.length > 2 && 'tip-cards'),
    h('thead', null, h('tr', null, head.map(c => h('th', null, tipInline(c))))),
    h('tbody', null, body.map(r => h('tr', null, r.map((c, j) => tipCell(c, head[j])))))));
}
function tipCell(text, label) {
  const td = h('td', null, tipInline(text));
  td.dataset.label = (label || '').replace(/\*\*/g, '');
  return td;
}
const tipInline = s => s.split(/(`[^`]+`)/g).filter(Boolean).map(x => (/^`.+`$/.test(x) ? h('code', null, x.slice(1, -1)) : inline(x)));
// 공유 링크 → 앱 안에 띄울 주소. 문서·슬라이드·시트·Drive 파일은 /preview, '웹에 게시' 링크는 게시용 보기. 못 띄우는 링크는 null
function tipEmbed(url) {
  const u = (url || '').trim();
  let m;
  if ((m = u.match(/^https:\/\/docs\.google\.com\/document\/d\/e\/([\w-]+)\/pub/))) return `https://docs.google.com/document/d/e/${m[1]}/pub?embedded=true`;
  if ((m = u.match(/^https:\/\/docs\.google\.com\/presentation\/d\/e\/([\w-]+)\/(pub|embed)/))) return `https://docs.google.com/presentation/d/e/${m[1]}/embed`;
  if ((m = u.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/([\w-]+)\/pubhtml/))) return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pubhtml?widget=true&headers=false`;
  if ((m = u.match(/^https:\/\/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]{20,})/))) return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`;
  if ((m = u.match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]{20,})/))) return `https://drive.google.com/file/d/${m[1]}/preview`;
  return null;
}
function renderTips() {
  const tips = db.stock.tips, pi = !isMember();
  if (!tipOf(selTip)) selTip = TIP_FILES[0].id;
  const row = t => {
    const b = h('button', cls('note-row', t.id === selTip && 'on'), h('span', 'note-emoji', t.emoji || '💡'), h('span', 'note-title', t.name));
    b.onclick = () => { selTip = t.id; render(); };
    return b;
  };
  const links = tips.map(t => {
    const b = row(t);
    if (pi) { // 끌어서 순서 (PI만)
      b.title = '끌어서 순서 바꾸기';
      dragReorder(b, t.id, tips.map(x => x.id), ids => { db.stock.tips = byIds(db.stock.tips, ids); save(); });
    }
    return b;
  });
  const add = pi ? h('button', 'cat-new', '+ 팁 문서') : null;
  if (add) {
    add.title = 'Google 문서·PDF 링크를 이 랩의 팁으로 넣어요';
    add.onclick = () => editTip(null);
  }
  $('tipList').replaceChildren(h('h2', 'note-list-title', '팁'), ...TIP_FILES.map(row), ...links, ...(add ? [add] : []));
  const t = tipOf(selTip);
  $('tipMain').replaceChildren(t.file ? mdTipPage(t) : tipPage(t, pi));
}
// 앱에 들어 있는 팁 (md)
function mdTipPage(t) {
  const name = t.name.replace(/\s*·\s*/g, ' '); // PDF 파일 이름엔 · 빼고
  const print = h('button', 'btn small', '🖨 인쇄 / PDF');
  print.title = 'A4로 인쇄해요 (인쇄 창에서 PDF로 저장도 돼요)';
  print.onclick = () => tipText(t.file).then(text => printSheet(h('div', 'pp-sheet', h('h1', null, t.name),
    h('div', 'pp-meta', `랩 매니저 팁 · 인쇄 ${isoToday().slice(2).replaceAll('-', '.')}`), tipDoc(text)), `팁_${name}`), () => alert('팁을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
  const got = tipTexts.get(t.file);
  let body;
  if (typeof got === 'string') body = tipDoc(got);
  else {
    body = h('p', 'hint', '불러오는 중…');
    tipText(t.file).then(text => body.replaceWith(tipDoc(text)), () => { body.textContent = '팁을 불러오지 못했어요. 인터넷에 연결되면 다시 열어 봐요.'; });
  }
  return h('div', 'panel tip-doc', h('div', 'panel-head', h('h2', null, `${t.emoji} ${t.name}`), h('span', 'spacer'), print), body);
}
function tipPage(t, pi) {
  const embed = tipEmbed(t.url), open = h('a', 'btn small', 'Google 문서에서 열기 ↗');
  open.href = t.url;
  open.target = '_blank';
  open.rel = 'noopener';
  open.title = pi ? '고치기·인쇄는 Google 문서에서' : '인쇄·PDF 저장은 Google 문서에서 (파일 › 인쇄)';
  let tools = [open];
  if (pi) {
    const edit = h('button', 'btn small', '고치기');
    edit.onclick = () => editTip(t);
    const del = h('button', 'btn danger small', '지우기');
    del.onclick = () => {
      if (!confirm(`'${t.name}'을(를) 팁에서 뺄까요? Google 문서는 그대로예요.`)) return;
      db.stock.tips = db.stock.tips.filter(x => x !== t);
      selTip = null;
      save();
    };
    tools = [open, edit, del];
  }
  let body;
  if (embed) {
    body = h('iframe', 'tip-frame');
    body.src = embed;
    body.title = t.name;
    body.loading = 'lazy';
  } else body = h('p', 'hint', '이 링크는 앱 안에 띄울 수 없어요. ‘Google 문서에서 열기’로 새 창에서 봐요.');
  return h('div', 'panel tip-doc', h('div', 'panel-head', h('h2', null, `${t.emoji || '💡'} ${t.name}`), h('span', 'spacer'), tools), body,
    embed ? h('p', 'hint tip-note', '안 보이면 Google 문서 공유가 ‘링크가 있는 모든 사용자’인지 확인해요. 인쇄·PDF는 ‘Google 문서에서 열기’ → 파일 › 인쇄.') : null);
}
function editTip(t) {
  ask(t ? '팁 문서 고치기' : '팁 문서 넣기', [
    { key: 'name', label: '이름', value: t?.name ?? '', required: true, placeholder: '예: 논문 표현' },
    [{ key: 'emoji', label: '아이콘 (이모지)', value: t?.emoji ?? '', placeholder: '💡' }],
    { key: 'url', label: 'Google 문서 링크 (공유 › 링크 복사)', value: t?.url ?? '', required: true, placeholder: 'https://docs.google.com/document/d/…' },
  ], v => {
    const url = v.url.trim();
    if (!tipEmbed(url) && !confirm('Google 문서·슬라이드·시트나 Drive 파일 링크가 아니라서 앱 안에 띄울 수는 없어요 (새 창으로만 열려요). 그래도 넣을까요?')) return;
    const x = t || { id: uid() };
    x.name = v.name.trim();
    x.emoji = v.emoji.trim() || undefined;
    x.url = url;
    if (!t) { db.stock.tips.push(x); selTip = x.id; }
    save();
  });
}
