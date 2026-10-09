'use strict';
// ---------- 팁 탭 (연구 모드): Google 문서(·슬라이드·시트·Drive PDF) 링크를 등록하면 탭 안에 띄워 봄. 내용은 PI가 Google 문서에서 고침 ----------
// db.stock.tips [{ id, name, emoji, url }] — 랩 메타(sync.js LAB_META)로 랩 멤버와 같이 봄. 넣기·고치기·지우기·순서는 PI만
// 문서는 '링크가 있는 모든 사용자: 뷰어'로 공유해야 학생 폰에서도 보임. 인쇄는 Google 문서에서 (이미 A4)
let selTip = null;
const tipOf = id => db.stock.tips.find(t => t.id === id);
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
  if (!tipOf(selTip)) selTip = tips[0]?.id ?? null;
  const rows = tips.map(t => {
    const b = h('button', cls('note-row', t.id === selTip && 'on'), h('span', 'note-emoji', t.emoji || '💡'), h('span', 'note-title', t.name));
    b.onclick = () => { selTip = t.id; render(); };
    if (pi) { // 끌어서 순서 (PI만)
      b.title = '끌어서 순서 바꾸기';
      dragReorder(b, t.id, tips.map(x => x.id), ids => { db.stock.tips = byIds(db.stock.tips, ids); save(); });
    }
    return b;
  });
  const add = pi ? h('button', 'cat-new', '+ 팁 문서') : null;
  if (add) add.onclick = () => editTip(null);
  $('tipList').replaceChildren(h('h2', 'note-list-title', '팁'), ...rows, ...(add ? [add] : []));
  const t = tipOf(selTip);
  $('tipMain').replaceChildren(t ? tipPage(t, pi) : h('div', 'panel', h('p', 'hint', pi
    ? 'Google 문서를 ‘링크가 있는 모든 사용자: 뷰어’로 공유하고, 그 링크를 ‘+ 팁 문서’로 넣어요. 내용은 Google 문서에서 고치면 여기에도 바로 보여요.'
    : '아직 팁이 없어요.')));
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
