'use strict';
// ---------- 기기 탭 (연구 모드 — 랩 멤버와 같이 씀): 공동기기 handbook. 묶음 → 기기 = 본문 노트(사용법·주의사항) + 담당자·위치 + 사진 ----------
// 틀은 프로토콜과 같음 (pages.js). sync.js가 기기를 한 건씩 따로 저장함 (labs/{PI}/equips/{id})
// db.stock.equips { id, group, name, memo, note, owner(담당자 글), place(보관 위치 id), photos: [{ id(Drive 파일) }], order, updatedAt }
// 새 기기 본문에 미리 채우는 틀 (예: …)를 바꿔 쓰면 됨
const EQUIP_TEMPLATE = [
  '## 사용법',
  '1. 켜기 (예: 본체 → 컴퓨터 → 프로그램 순서, 램프는 20분 예열)',
  '2. 시료 넣기·설정 (예: 로터 균형 맞추기, 온도 4°C)',
  '3. 측정·실행',
  '4. 끄기·정리 (예: 프로그램 → 컴퓨터 → 본체, 로터 꺼내 말리기)',
  '## 주의사항',
  '> 주의: 꼭 지킬 것 (예: 로터 최대 속도 넘기지 않기)',
  '- 하면 안 되는 것 (예: 뚜껑 안 닫힌 튜브 넣지 않기)',
  '- [ ] 쓰고 나서 확인할 것 (예: 사용 기록 적기, 전원 끄기)',
  '## 예약·기록',
  '- 예약 (예: 공용 캘린더에 이름·시간)',
  '- 사용 기록 (예: 옆 노트에 날짜·이름·사용 시간)',
  '## 고장·문의',
  '- 고장 나면 (예: 담당자에게 바로 연락, 업체 A/S 02-000-0000)',
  '## 참고',
  '- 매뉴얼·교육 영상 링크는 그대로 붙여 넣어요',
].join('\n');
const EQUIP = pageBook({
  key: 'equip', noun: '기기', emoji: '🔧', groups: 'equipGroups', items: 'equips', list: 'equipList', main: 'equipMain', fold: 'equipFold', editKey: 'en',
  template: EQUIP_TEMPLATE,
  groupPh: '예: 공동기기, 이미징, 분석 장비', namePh: '예: 원심분리기 (Eppendorf 5424R)', memoPh: '예: 예약 필수, 교육 받은 사람만',
  emptyStart: '‘+ 묶음’으로 시작해요 (예: 공동기기, 이미징). 묶음 안에 기기를 만들고, 사용법·주의사항·담당자·사진을 넣어요.',
  bodyPh: '## 사용법\n1. …\n## 주의사항\n> 주의: …', bodyEmpty: '아직 비어 있어요. ‘본문 편집’을 눌러 사용법·주의사항을 적어요.',
  printHint: '기기 옆에 붙여 둘 수 있게 A4로 인쇄해요',
  rowMeta: e => [(e.owner || '').split(/\s/)[0], e.owner ? `담당 ${e.owner}` : ''], // 목록엔 담당자 이름만
  // 제목 줄: 담당자(이름·연락처 글) · 위치(재고의 보관 위치에서 고름)
  head: (e, touched, enterBlur) => {
    const owner = h('input', 'proto-memo equip-owner');
    owner.value = e.owner || '';
    owner.placeholder = '담당자';
    owner.title = '눌러서 담당자 고치기 (예: 홍길동 010-0000-0000)';
    owner.onkeydown = enterBlur;
    owner.onchange = () => { e.owner = owner.value.trim() || undefined; touched(); };
    const place = h('select', 'note-cat', [Object.assign(h('option', null, '위치 없음'), { value: '' }),
      ...db.stock.places.map(x => Object.assign(h('option', null, x.name), { value: x.id, selected: x.id === e.place }))]);
    place.title = '위치 (재고 탭의 보관 위치에서 고르고, 새 위치는 거기서 만들어요)';
    place.onchange = () => { e.place = place.value || undefined; touched(); };
    return [h('label', 'equip-field', '담당', owner), place];
  },
  printMeta: e => [e.owner ? `담당 ${e.owner}` : null, placeOf(e.place)?.name],
  below: e => [equipPhotos(e)],
  printBody: e => (e.photos?.length ? [h('h2', null, `사진 ${e.photos.length}`), h('div', 'pp-photos', e.photos.map(ph => Object.assign(h('img'), { src: photoSrc(ph.id, 800), alt: '' })))] : null),
});
function renderEquip() { EQUIP.render(); }

// ---------- 기기 사진: 원본은 PI의 Google Drive (tools/photo-upload.gs 를 PI가 웹 앱으로 배포 → 설정에 그 주소 = db.stock.photoScript) ----------
// 올리기·지우기는 그 웹 앱에 로그인 토큰과 함께 보냄 (웹 앱이 Firestore 규칙으로 이 랩의 PI·멤버인지 확인). 보기는 Drive 썸네일 주소로
const photoSrc = (id, w) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
const photoView = id => `https://drive.google.com/file/d/${id}/view`;
const uploading = {}; // 기기 id → 올리는 중인 사진 수
async function photoCall(body) {
  const c = window.cloud;
  const res = await fetch(db.stock.photoScript, { method: 'POST', body: JSON.stringify({ ...body, lab: c.lab, idToken: await c.token() }) }); // 글(text/plain)로 보내야 브라우저가 미리 묻지 않음
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || '알 수 없는 오류');
  return j;
}
async function uploadPhoto(e, file) {
  uploading[e.id] = (uploading[e.id] || 0) + 1;
  render();
  try {
    const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(file); });
    const { id } = await photoCall({ action: 'upload', name: file.name, type: file.type, data });
    e.photos = [...(e.photos || []), { id }];
    e.updatedAt = isoToday();
  } catch (err) { alert(`사진을 올리지 못했어요: ${err.message}`); }
  uploading[e.id]--;
  save();
}
async function deletePhoto(e, ph) {
  if (!confirm('이 사진을 지울까요? Drive에서도 휴지통으로 가요 (30일 안에는 Drive에서 되살릴 수 있어요).')) return;
  try { await photoCall({ action: 'delete', id: ph.id }); } catch (err) {
    if (!confirm(`Drive에서 지우지 못했어요 (${err.message}).\n목록에서만 뺄까요?`)) return;
  }
  e.photos = (e.photos || []).filter(x => x.id !== ph.id);
  e.updatedAt = isoToday();
  save();
}
// 설정에서 주소를 넣으면 웹 앱이 응답하는지 확인 (doGet)
function checkPhotoScript(url) {
  fetch(url).then(r => r.json()).then(j => alert(j.app === 'lab-manager-photos' ? '기기 사진 저장이 연결됐어요.' : '응답은 왔는데 랩 매니저 사진 저장 웹 앱이 아니에요. 주소를 확인해 주세요.'))
    .catch(() => alert('기기 사진 저장에 연결하지 못했어요. 웹 앱 주소와 배포 설정(액세스: 모든 사용자)을 확인해 주세요.'));
}
function equipPhotos(e) {
  const photos = e.photos || [], busy = uploading[e.id] || 0, c = window.cloud;
  const canUse = !!(db.stock.photoScript && c?.user && c.lab);
  const why = !c?.user ? '로그인하면 사진을 올릴 수 있어요.' : !db.stock.photoScript
    ? (isMember() ? 'PI가 설정에서 기기 사진 저장을 연결하면 올릴 수 있어요.' : '설정 › 기기 사진 저장에 Apps Script 주소를 넣으면 올릴 수 있어요.') : null;
  const pick = h('input');
  pick.type = 'file';
  pick.accept = 'image/*';
  pick.multiple = true;
  pick.hidden = true;
  pick.onchange = () => { for (const f of pick.files) uploadPhoto(e, f); pick.value = ''; };
  const add = h('button', 'btn small', '+ 사진');
  add.onclick = () => pick.click();
  const tiles = photos.map(ph => {
    const img = h('img');
    img.src = photoSrc(ph.id, 600);
    img.alt = '';
    img.loading = 'lazy';
    const a = h('a', 'photo-tile', img);
    a.href = photoView(ph.id);
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = '누르면 원본 (Google Drive)';
    img.onerror = () => a.replaceChildren(h('span', 'hint', '사진을 못 불러왔어요 (Drive 공유 확인)'));
    if (!canUse) return a;
    const x = h('button', 'photo-x', '×');
    x.type = 'button';
    x.title = '사진 지우기';
    x.onclick = () => deletePhoto(e, ph);
    return h('div', 'photo-cell', a, x);
  });
  for (let i = 0; i < busy; i++) tiles.push(h('div', 'photo-tile busy', h('span', 'hint', '올리는 중…')));
  return h('div', 'panel equip-photos', h('div', 'panel-head', h('h2', null, '사진'), h('span', 'hint', photos.length ? `${photos.length}장 · 누르면 원본` : ''), h('span', 'spacer'), canUse ? add : null, pick),
    tiles.length ? h('div', 'photo-grid', tiles) : null,
    why ? h('p', 'hint', why) : tiles.length ? null : h('p', 'hint', '기기 전체·조작부·주의 표시 사진을 올려 두면 좋아요. 원본은 PI의 Google Drive에 저장돼요.'));
}
