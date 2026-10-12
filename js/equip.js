'use strict';
// ---------- 기기 탭 (연구 모드 — 랩 멤버와 같이 씀): 공동기기 handbook. 묶음 → 기기 = 본문 노트(사용법·주의사항) + 담당자·위치 + 사진 ----------
// 틀은 프로토콜과 같음 (pages.js). sync.js가 기기를 한 건씩 따로 저장함 (labs/{PI}/equips/{id})
// db.stock.equips { id, group, name, memo, note, owner(담당자 글), place(보관 위치 id), photos: [{ id, store: 'fs' } 앱 안 | { id } Drive 파일], order, updatedAt }
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
  listExtra: () => (isMember() ? null : [sharedEquipButton()]), // PI만: 학교·병원 공동기기 목록을 묶음째 넣기
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
  onRemove: e => { for (const ph of e.photos || []) if (ph.store === 'fs') window.cloud?.photo?.del(ph.id).catch(() => {}); }, // 앱 안 사진도 같이 지움 (Drive 사진은 폴더에 남음)
  printBody: e => { // 앱 안 사진은 화면에서 이미 읽은 것만
    const srcs = (e.photos || []).map(ph => (ph.store === 'fs' ? photoLoaded.get(ph.id) : photoSrc(ph.id, 800))).filter(Boolean);
    return srcs.length ? [h('h2', null, `사진 ${srcs.length}`), h('div', 'pp-photos', srcs.map(src => Object.assign(h('img'), { src, alt: '' })))] : null;
  },
});
function renderEquip() { EQUIP.render(); }

// ---------- 공동기기 목록 넣기 (PI): 학교·병원 홈페이지의 공동기기 정보를 기기 탭에 묶음째 ----------
// 목록 하나 = 묶음 하나 { group: 묶음 이름, src: 출처, place·owner·kind: 기기마다 없을 때 쓸 위치·담당자·구분, items: [[이름, 모델, 제작사, 위치, 활용분야[], 구분]] }
// 홈페이지에 적힌 그대로 ('-'·빈 칸은 없음). 정보만 넣음 (사용 신청·예약은 홈페이지에서)
// 같은 묶음에 같은 이름이 있으면 건너뜀 → 목록을 늘린 뒤 다시 넣어도 새것만 들어감
//   의대 연구기기현황 https://med.knu.ac.kr/pages/sub.htm?nav_code=knu1670414710 (69개 중 1·2·6쪽 30개 — 이름 끝이 '-학정동'이면 학정동(이름에선 뺌), 나머지는 동인동.
//     구분: 홈페이지의 '공동기기실 장비' / '연구기기')
//   경북대병원 생명의학연구원 Core lab https://bmri.knuh.kr/content/06application/10_01.php (2026.10)
const SHARED_EQUIPS = [
  { group: '동인동 공동기기', src: '의대 연구기기현황', kind: '공동기기실 장비', items: [
    ['Nano Drop', 'Nano Drop Ultra', 'thermo', '신관 402호'],
    ['조직파쇄기', 'Tissue Lyser III', 'Qiagen', '신관 N469'],
    ['핵자기공명분석기', 'minispec LF50', 'Bruker', '실험동물자원관리센터 2층'],
    ['감마카운터기', 'Wizard2', 'PerkinElmer', '신관 138호'],
    ['화상분석시스템', 'Typhoon IP', 'cytiva', '신관 139호 동위원소 실험실 안'],
    ['분석용전자저울', 'ML104T', '', '신관 138호 동위원소실 안 N142호'],
    ['멀티스펙트럼 형광영상분석시스템', 'Nuance FX', 'Perkin Elmer', '신관 N469'],
    ['미량원심분리기', '(DE)5424', 'Eppendorf', '신관 기능학실습실 B·C (N371, N471)', [], '연구기기'],
    ['균질기', '(US)VC505, 500W', 'Sonics and Materials', '신관 4층 기능학실습실 C (N471)', [], '연구기기'],
    ['형광도립현미경', 'AX70 (JP)', 'Olympus', '350호', [], '연구기기'],
    ['혈류 측정기', 'ML192 & fiber optic needle probe', 'AD Instruments', '343호', [], '연구기기'],
    ['냉동조직박편절단기', 'MEV 3832', 'Sakura', '343호', [], '연구기기'],
    ['자외선 분광분석기', 'UV-1650PC', 'Shimadzu', '신관 107-2', [], '연구기기'],
    ['분액수집기', 'Frac-950', 'GE', '신관 공동기기실', [], '연구기기'],
    ['질량분석기', 'nanoUPLC Q-Tof Premier', 'Waters', '신관 107', [], '연구기기'],
    ['고속액체크로마토그라프', 'Delta 600', 'Waters', '사이클로트론실', [], '연구기기'],
  ] },
  { group: '학정동 공동기기', src: '의대 연구기기현황', kind: '공동기기실 장비', items: [
    ['PCR', '', '', '의생명1호관 606호'],
    ['고압멸균기', '', '', '의생명1호관 606호'],
    ['혈액냉동고 2', '', 'carrier', '의생명1호관 416호'],
    ['혈액냉동고 1', '', 'carrier', '의생명1호관 416호'],
    ['분광광도계(Nano Drop)', 'ND-1', 'thermo', '의생명1호관 606호'],
    ['화상분석시스템', 'Image Quant800', 'cytiva', '의생명1호관 606호'],
    ['역상현미경', 'DMi 1', 'Leica', '의생명1호관 606호'],
    ['형광현미경(Invert)', 'DMi 8', 'Leica', '의생명1호관 606호'],
    ['탁상형냉장원심분리기', '5810R', 'Eppendorf', '의생명1호관 606호'],
    ['덩어리얼음제조기', 'IT/GB1540', 'brema', '의생명1호관 606호'],
    ['Real time PCR', 'StepOnePlus', 'thermo', '의생명1호관 606호'],
    ['냉동조직박절기(Cryo cut microtome)', 'CM3050S', 'Leica', '의생명1호관 606호'],
    ['DNA 서열분석기', 'PyroMark Q48', 'QIAGEN', '의생명1호관 606호'],
    ['형광리더기', 'FlexStation 3', 'Molecular Devices/US', '의생명1호관 606호'],
  ] },
  { group: '생명의학연구원', src: '경북대병원 생명의학연구원 Core lab', place: '경북대병원 생명의학연구원', owner: '김효정 053-200-4603 knuhcorelab@knuh-ext.kr', items: [
    ['고감도 고해상력 공초점 현미경', 'LSM 800 with AiryScan', 'Carl Zeiss/독일', '', ['다중 형광 염색한 세포·조직의 2D 고해상도 고배율 이미징·정량분석', '3D 형광 이미징', '장시간 생세포 이미징', '칼슘 인디케이터로 세포 내 칼슘 이온 이미징', '레이저로 특정 단백질 자극 후 시간에 따른 변화 분석']],
    ['나노분광분석기', 'DS-11', 'DeNovix/USA', '', ['UV·가시광선 전 파장으로 핵산·단백질 정량']],
    ['등온 핵산 증폭기', 'MXM-100', '엠모니터/대한민국', '', ['소량의 핵산 검출·분석', '부대장비 없이 빠르게 표적 유전물질 검출']],
    ['레이저 미세절단 현미경', 'LMD7', 'Leica/독일', '', ['조직표본·배양세포에서 원하는 부위만 레이저로 미세 절단해 채취 (single cell 수준까지)', '정상 조직과 인접한 병리 세포 분리']],
    ['멀티 플레이트 리더', 'SPARK 10M', 'TECAN/Austria', '', ['흡광도 200–1000 nm (스캔 포함)', '형광 (filter·monochromator, 3D 스캔, PicoGreen 정량)', '발광 (장비 안에서 시약 분주)']],
    ['바이오 분자 이미징 시스템', 'LAS 4000', 'GE Healthcare/Japan', '', ['gel 염색(가시광·형광) 이미지 촬영', 'Western blot 검출 이미지']],
    ['발광형광영상장비', 'IVIS Lumina III', 'Perkin Elmer/USA', '', ['고감도 발광·형광 촬영과 정량', '소형동물 모델 in vivo 모니터링']],
    ['세포 형질주입 시스템', '4D Nucleofector', 'Lonza/스위스', '', ['세포 종류별 전기 자극으로 유전자 도입', 'Suspension·adherent, cell line·primary cell 모두']],
    ['소동물용 혈관 및 혈류 이미징 AOCT', '', '카이스트 Biomedical Photonic Imaging Lab/한국', '', ['mouse·rat 혈관 구조와 상대 혈류 속도 이미징', 'AOCT 단독 또는 수술현미경 통합']],
    ['수술용 현미경', 'M320 F12', 'Leica Microsystems/Germany', '', ['고해상도 입체현미경, 이미지·동영상 촬영(SD 카드)', '제브라피쉬·동물 실험']],
    ['실시간 유전자 증폭기 (QuantStudio 5)', 'QuantStudio 5', 'Applied Biosystems', '', ['384-well 전용 real-time PCR', '유전자 발현·병원체 검출·SNP·genotyping']],
    ['실시간 유전자 증폭기 (Bio-Rad)', 'CFX96 Touch', 'Bio-Rad/USA', '', ['96-well real-time PCR', '유전자 정량·발현 비교, SNP·mutation 검출']],
    ['전산화단층촬영장치 (micro-CT)', 'Skyscan 1275XL', 'Bruker/벨기에', '', ['X-ray로 시료 내부 구조를 비파괴 촬영', '3D 영상화·정량 분석 (뼈·치아 등)']],
    ['형광현미경', 'AXIO', 'Carl Zeiss/독일', '', ['미세구조 관찰', '형광 항체로 조직·세포 내 특정 부위 관찰']],
    ['화상분석시스템', 'Fusion FX', 'Vilber Lourmat/France', '', ['Western blot 이미지 촬영·분석', 'DNA·RNA gel 이미지 촬영·분석']],
  ] },
];
function sharedEquipButton() {
  const b = h('button', 'cat-new', '🏫 공동기기 목록 넣기');
  b.title = '학교·병원 홈페이지의 공동기기 정보를 이 탭에 묶음으로 넣어요';
  b.onclick = sharedEquipImport;
  return b;
}
function sharedEquipImport() {
  const boxes = SHARED_EQUIPS.map(L => {
    const cb = h('input');
    cb.type = 'checkbox';
    cb.checked = true;
    return [L, cb, h('label', 'step-check', cb, h('span', null, `${L.group} (${L.items.length}개)`, h('small', null, L.src)))];
  });
  ask('공동기기 목록 넣기', [], () => {
    let added = 0;
    for (const [L, cb] of boxes) {
      if (!cb.checked) continue;
      const groups = db.stock.equipGroups;
      let g = groups.find(x => x.name === L.group);
      if (!g) groups.push(g = { id: uid(), name: L.group, color: newColor(groups.map(x => x.color)) });
      let order = db.stock.equips.filter(e => e.group === g.id).length;
      for (const [name, model, maker, own, uses = [], kind = L.kind] of L.items) {
        if (db.stock.equips.some(e => e.group === g.id && e.name === name)) continue;
        const place = own || L.place || '';
        db.stock.equips.push({ id: uid(), group: g.id, name, owner: L.owner, order: order++, updatedAt: isoToday(),
          memo: [own, model, maker].filter(Boolean).join(' · ') || undefined, // 묶음 공통 위치는 메모에서 뺌
          note: ['## 정보', place && `- 위치: ${place}`, model && `- 모델: ${model}`, maker && `- 제작사: ${maker}`, L.owner && `- 담당: ${L.owner}`, kind && `- 구분: ${kind}`, `- 출처: ${L.src}`,
            uses.length ? '## 활용' : '', ...uses.map(u => `- ${u}`)].filter(Boolean).join('\n') });
        added++;
      }
    }
    save();
    if (!added) alert('고른 목록은 이미 다 들어 있어요.');
  }, [h('p', 'hint', '고른 목록을 묶음째 넣어요 (위치·모델·제작사·담당·활용분야). 같은 묶음에 같은 이름이 있으면 건너뛰어요.'),
    ...boxes.map(([, , el]) => el),
    h('p', 'hint', '사용 신청·예약은 각 홈페이지에서 해요. 랩 멤버도 같이 봐요.')]);
}

// ---------- 기기 사진: PI가 교재처럼 넣어 두고 랩 학생은 봐요 ----------
// 기본은 앱 안에 저장: 긴 변 1600px JPEG로 줄여 labs/{PI}/photos/{id} (설정할 것 없음 — sync.js window.cloud.photo)
// PI가 설정에서 'Google Drive 연결'을 하면(db.stock.photoDrive { folder, email }) 원본을 PI의 Drive 폴더에 — 구글 로그인 창으로 drive.file 권한만 받음 (앱이 만든 파일만 다룸)
// e.photos [{ id, store: 'fs' }] = 앱 안 · [{ id }] = Drive 파일 id ('링크가 있는 모든 사용자: 보기'라 학생 폰에서도 썸네일이 보임)
const DRIVE_CLIENT_ID = '973126235173-2v90sa0juds48o2ol742jue4r4074ot3.apps.googleusercontent.com'; // Google Cloud 콘솔 > Google 인증 플랫폼 > 클라이언트 (공개돼도 괜찮음 — kkonoo.github.io에서만 작동)
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const photoSrc = (id, w) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
const photoView = id => `https://drive.google.com/file/d/${id}/view`;
const uploading = {}; // 기기 id → 올리는 중인 사진 수
const photoLoading = new Map(), photoLoaded = new Map(); // 앱 안 사진: id → 읽는 중(Promise) / 다 읽은 data: 주소 (한 번만 읽음)
function fsPhoto(id) {
  if (photoLoaded.has(id)) return Promise.resolve(photoLoaded.get(id));
  if (!photoLoading.has(id)) {
    photoLoading.set(id, window.cloud.photo.get(id).then(d => {
      const src = d ? `data:image/jpeg;base64,${d}` : null;
      if (src) photoLoaded.set(id, src);
      return src;
    }).finally(() => photoLoading.delete(id)));
  }
  return photoLoading.get(id);
}
// 폰 사진을 긴 변 1600px JPEG로 줄임 (Firestore 문서 하나 1 MB 안에 — 넘으면 더 줄임)
async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('사진 파일을 읽지 못했어요')); i.src = url; });
    for (let side = 1600; ; side = Math.round(side * 0.75)) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.82, 0.7]) { const d = c.toDataURL('image/jpeg', q).split(',')[1]; if (d.length < 900e3) return d; }
    }
  } finally { URL.revokeObjectURL(url); }
}
// Google Drive: 구글 로그인 창(Google Identity Services)으로 1시간짜리 권한을 받아 Drive API를 바로 부름. 권한은 메모리에만
let gisLoad = null, driveTok = null, driveJustOk = false;
function gis() { // 처음 필요할 때 한 번 불러옴 (버튼이 보일 때 미리)
  return gisLoad ||= new Promise((ok, no) => {
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client';
    sc.onload = ok;
    sc.onerror = () => { gisLoad = null; no(new Error('구글 로그인 창을 불러오지 못했어요 (인터넷 확인)')); };
    document.head.append(sc);
  });
}
const driveToken = () => (driveTok && Date.now() < driveTok.until ? driveTok.token : null);
// 구글 창(팝업)을 띄워 권한을 받음 — 버튼을 누른 바로 그때 불러야 팝업이 안 막혀요. 한 번 허용했으면 창이 잠깐 떴다 닫힘
function driveAuth() {
  return gis().then(() => new Promise((ok, no) => {
    const o = google.accounts.oauth2;
    o.initTokenClient({
      client_id: DRIVE_CLIENT_ID, scope: DRIVE_SCOPE, prompt: '', login_hint: db.stock.photoDrive?.email || window.cloud?.user?.email,
      callback: r => {
        if (r.error) return no(new Error(r.error_description || r.error));
        if (!o.hasGrantedAllScopes(r, DRIVE_SCOPE)) return no(new Error('Google Drive 권한에 체크하지 않았어요'));
        driveTok = { token: r.access_token, until: Date.now() + (r.expires_in - 60) * 1000 };
        ok();
      },
      error_callback: err => no(new Error(err.type === 'popup_closed' ? '구글 창을 닫았어요' : err.type === 'popup_failed_to_open' ? '팝업이 막혔어요. 이 사이트의 팝업을 허용해 주세요' : err.message || err.type)),
    }).requestAccessToken();
  }));
}
async function driveApi(path, opt = {}) {
  const res = await fetch(`https://www.googleapis.com/${path}`, { ...opt, headers: { Authorization: `Bearer ${driveToken()}`, ...(typeof opt.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...opt.headers } });
  const j = await res.json().catch(() => ({}));
  if (res.status === 404) throw new Error('이 앱이 올린 파일이 아니거나 이미 지워졌어요');
  if (!res.ok) throw new Error(j.error?.message || `Google Drive 오류 ${res.status}`);
  return j;
}
// 설정 › 기기 사진 저장: 연결하면 내 Drive에 '랩 매니저 기기 사진' 폴더를 만들고 그 뒤 넣는 사진 원본이 거기로
function photoDriveBox() {
  const d = db.stock.photoDrive, box = h('div', 'photo-drive');
  const btn = (label, cl, fn) => { const b = h('button', cl, label); b.type = 'button'; b.onclick = fn; return b; };
  const redraw = () => { // 접은 칸 제목 옆 글도 같이 (app.js 설정의 fold)
    const hint = box.closest('details')?.querySelector('summary .hint');
    if (hint) hint.textContent = db.stock.photoDrive ? 'Google Drive (원본)' : '앱 안 (줄여서)';
    box.replaceWith(photoDriveBox());
  };
  if (!d) {
    gis().catch(() => {});
    box.append(h('p', 'hint', '지금은 사진을 앱 안에 줄여서(긴 변 1600px) 저장해요 — 따로 할 것 없어요. 원본을 내 Google Drive에 두려면 연결해요: 내 Drive에 ‘랩 매니저 기기 사진’ 폴더가 생기고, 그 뒤 넣는 사진이 거기로 가요. 앱은 자기가 만든 파일만 다뤄요.'),
      btn('Google Drive 연결', 'btn small', async () => {
        try {
          await driveAuth();
          const { user } = await driveApi('drive/v3/about?fields=user(emailAddress)');
          const f = await driveApi('drive/v3/files?fields=id', { method: 'POST', body: JSON.stringify({ name: '랩 매니저 기기 사진', mimeType: 'application/vnd.google-apps.folder' }) });
          db.stock.photoDrive = { folder: f.id, email: user.emailAddress };
          save();
          redraw();
        } catch (err) { alert(`Google Drive에 연결하지 못했어요: ${err.message}`); }
      }));
    return box;
  }
  const open = h('a', 'btn small', '폴더 열기 ↗');
  open.href = `https://drive.google.com/drive/folders/${d.folder}`;
  open.target = '_blank';
  open.rel = 'noopener';
  box.append(h('p', 'hint', `${d.email}의 Google Drive ‘랩 매니저 기기 사진’ 폴더에 원본으로 저장해요.`), h('div', 'photo-drive-tools', open,
    btn('연결 끊기', 'btn small', () => {
      if (!confirm('Google Drive 연결을 끊을까요? 이미 올린 사진은 Drive에 그대로 있고 앱에서도 계속 보여요. 앞으로 넣는 사진은 앱 안에 저장돼요.')) return;
      db.stock.photoDrive = null; // null로 랩 메타에 올라가야 다른 기기에서도 꺼짐
      driveTok = null;
      save();
      redraw();
    })));
  return box;
}
async function uploadPhoto(e, file) {
  uploading[e.id] = (uploading[e.id] || 0) + 1;
  render();
  try {
    const d = db.stock.photoDrive;
    if (d) { // Google Drive에 원본
      const b = `lab${uid()}`, meta = { name: `${e.name}_${file.name}`, parents: [d.folder] };
      const { id } = await driveApi('upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` },
        body: new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`, file, `\r\n--${b}--\r\n`]) });
      await driveApi(`drive/v3/files/${id}/permissions`, { method: 'POST', body: JSON.stringify({ role: 'reader', type: 'anyone' }) }); // 학생 폰에서도 보이게
      e.photos = [...(e.photos || []), { id }];
    } else { // 앱 안에 줄여서
      const d64 = await shrinkPhoto(file), id = uid();
      await window.cloud.photo.put(id, d64);
      photoLoaded.set(id, `data:image/jpeg;base64,${d64}`);
      e.photos = [...(e.photos || []), { id, store: 'fs' }];
    }
    e.updatedAt = isoToday();
  } catch (err) { alert(`사진을 올리지 못했어요: ${err.message}`); }
  uploading[e.id]--;
  save();
}
async function deletePhoto(e, ph) {
  const fs = ph.store === 'fs', drive = !fs && !!db.stock.photoDrive;
  if (drive && !driveToken()) { // 구글 창은 누른 바로 그때 (물어보기 전에)
    try { await driveAuth(); } catch (err) { alert(`Google Drive 확인을 못 했어요: ${err.message}`); return; }
  }
  if (!confirm(fs ? '이 사진을 지울까요?' : drive ? '이 사진을 지울까요? Google Drive에서는 휴지통으로 가요 (30일 안에는 되살릴 수 있어요).' : '이 사진을 목록에서 뺄까요? Google Drive의 파일은 Drive에서 직접 지워요.')) return;
  try { if (fs) await window.cloud.photo.del(ph.id); else if (drive) await driveApi(`drive/v3/files/${ph.id}`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) }); } catch (err) {
    if (!confirm(`${fs ? '' : 'Drive에서 '}지우지 못했어요 (${err.message}).\n목록에서만 뺄까요?`)) return;
  }
  e.photos = (e.photos || []).filter(x => x.id !== ph.id);
  e.updatedAt = isoToday();
  save();
}
// 앱 안 사진은 화면 위에 크게 (누르면 닫힘)
function zoomPhoto(src) {
  const box = h('div', 'photo-zoom', Object.assign(h('img'), { src, alt: '' }));
  box.title = '누르면 닫혀요';
  box.onclick = () => box.remove();
  document.body.append(box);
}
function photoTile(ph) {
  const img = h('img');
  img.alt = '';
  if (ph.store !== 'fs') { // Drive: 썸네일, 누르면 Drive 원본
    img.src = photoSrc(ph.id, 600);
    img.loading = 'lazy';
    const a = h('a', 'photo-tile', img);
    a.href = photoView(ph.id);
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = '누르면 원본 (Google Drive)';
    img.onerror = () => a.replaceChildren(h('span', 'hint', '사진을 못 불러왔어요 (Drive 공유 확인)'));
    return a;
  }
  const b = h('button', 'photo-tile', img);
  b.type = 'button';
  b.title = '누르면 크게';
  const fail = t => b.replaceChildren(h('span', 'hint', t));
  if (!window.cloud?.lab) fail('로그인하면 보여요');
  else fsPhoto(ph.id).then(src => { if (!src) return fail('사진이 지워졌어요'); img.src = src; b.onclick = () => zoomPhoto(src); }, () => fail('사진을 못 불러왔어요 (인터넷 확인)'));
  return b;
}
function equipPhotos(e) {
  const photos = e.photos || [], busy = uploading[e.id] || 0, c = window.cloud;
  const canEdit = !isMember() && !!(c?.user && c.lab); // 사진은 PI가 넣고 지움 (랩 학생은 보기만)
  const pick = h('input');
  pick.type = 'file';
  pick.accept = 'image/*';
  pick.multiple = true;
  pick.hidden = true;
  pick.onchange = () => { for (const f of pick.files) uploadPhoto(e, f); pick.value = ''; };
  const drive = !!db.stock.photoDrive, add = h('button', 'btn small', '+ 사진');
  if (canEdit && drive) gis().catch(() => {}); // 구글 창을 바로 띄울 수 있게 미리
  // Drive 권한(1시간)이 없으면 구글 창부터 → 한 번 더 눌러 사진 고르기 (팝업과 사진 고르기 창을 한 번에 못 띄움)
  add.onclick = () => {
    if (!drive || driveToken()) { if (driveJustOk) { driveJustOk = false; noteP?.remove(); } pick.click(); return; }
    driveAuth().then(() => { driveJustOk = true; render(); }, err => alert(`Google Drive 확인을 못 했어요: ${err.message}`));
  };
  const tiles = photos.map(ph => {
    const t = photoTile(ph);
    if (!canEdit) return t;
    const x = h('button', 'photo-x', '×');
    x.type = 'button';
    x.title = '사진 지우기';
    x.onclick = () => deletePhoto(e, ph);
    return h('div', 'photo-cell', t, x);
  });
  for (let i = 0; i < busy; i++) tiles.push(h('div', 'photo-tile busy', h('span', 'hint', '올리는 중…')));
  const where = drive ? '원본은 PI의 Google Drive에 저장돼요.' : '앱 안에 줄여서(긴 변 1600px) 저장돼요.';
  const note = isMember() ? (tiles.length ? null : '아직 사진이 없어요.')
    : !c?.user ? '로그인하면 사진을 넣을 수 있어요.'
    : drive && driveJustOk && driveToken() ? 'Google Drive 확인이 끝났어요. ‘+ 사진’을 한 번 더 눌러 골라요.'
    : tiles.length ? null : `기기 전체·조작부·주의 표시 사진을 넣어 두면 좋아요. 랩 학생은 보기만 해요. ${where}`;
  const noteP = note ? h('p', 'hint', note) : null;
  return h('div', 'panel equip-photos', h('div', 'panel-head', h('h2', null, '사진'), h('span', 'hint', photos.length ? `${photos.length}장 · 누르면 크게` : ''), h('span', 'spacer'), canEdit ? add : null, pick),
    tiles.length ? h('div', 'photo-grid', tiles) : null, noteP);
}
