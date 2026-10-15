'use strict';
// ---------- 기기 탭 (연구 모드 — 랩 멤버와 같이 씀): 공동기기 handbook. 묶음 → 기기 = 본문 노트(사용법·주의사항) + 담당자·위치 + 사진 ----------
// 틀은 프로토콜과 같음 (pages.js). sync.js가 기기를 한 건씩 따로 저장함 (labs/{PI}/equips/{id})
// db.stock.equips { id, group, name, memo(모델·제작사 등 한 줄), note, where(위치 글), owner(담당자 글), photos: [{ id, store: 'fs' } 앱 안 | { id } Drive 파일], order, updatedAt }
// 새 기기 본문에 미리 채우는 틀 (예: …)를 바꿔 쓰면 됨. 맨 위 한 줄 = 뭐 하는 기기인지
const EQUIP_TEMPLATE = [
  '뭐 하는 기기인지 한 줄 (예: 시료를 빠르게 돌려 무게에 따라 성분을 나누는 장비)',
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
  '- 같은 종류 다른 기기와 무엇이 다른지 한 줄씩 (예: QuantStudio 3 — 96-well 기본형 · N469)',
].join('\n');
const EQUIP = pageBook({
  key: 'equip', noun: '기기', emoji: '🔧', groups: 'equipGroups', items: 'equips', list: 'equipList', main: 'equipMain', fold: 'equipFold', editKey: 'en',
  template: EQUIP_TEMPLATE,
  groupPh: '예: 공동기기, 이미징, 분석 장비', namePh: '예: 원심분리기 (Eppendorf 5424R)', memoPh: '예: QuantStudio 3 · Thermo (모델 · 제작사)',
  emptyStart: '‘+ 묶음’으로 시작해요 (예: 공동기기, 이미징). 묶음 안에 기기를 만들고, 사용법·주의사항·담당자·사진을 넣어요.',
  bodyPh: '## 사용법\n1. …\n## 주의사항\n> 주의: …', bodyEmpty: '아직 비어 있어요. ‘본문 편집’을 눌러 사용법·주의사항을 적어요.',
  printHint: '기기 옆에 붙여 둘 수 있게 A4로 인쇄해요',
  listExtra: () => (isMember() ? null : [sharedEquipButton()]), // PI만: 학교·병원 공동기기 목록을 묶음째 넣기
  rowMeta: e => [e.where || '', [e.where && `위치 ${e.where}`, e.owner && `담당 ${e.owner}`].filter(Boolean).join(' · ')], // 목록엔 위치
  // 제목 줄: 위치·담당자 (둘 다 그냥 글 — 재고의 보관 위치와는 상관없음)
  head: (e, touched, enterBlur) => {
    const text = (key, label, tip) => {
      const i = h('input', `proto-memo equip-${key}`);
      i.value = e[key] || '';
      i.placeholder = label === '담당' ? '담당자' : label;
      i.title = tip;
      i.onkeydown = enterBlur;
      i.onchange = () => { e[key] = i.value.trim() || undefined; touched(); };
      return h('label', 'equip-field', label, i);
    };
    return [text('where', '위치', '눌러서 위치 고치기 (예: N469 — 신관은 N+방 번호)'), text('owner', '담당', '눌러서 담당자 고치기 (예: 홍길동 010-0000-0000)')];
  },
  printMeta: e => [e.where ? `위치 ${e.where}` : null, e.owner ? `담당 ${e.owner}` : null],
  // 묶음 안은 늘 이름 abc순 (끌어서 바꾸기 없음). 영어 이름이 먼저, 한글 이름은 뒤에. 숫자는 크기대로 (freezer 1 < 2)
  sort: (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }),
  below: e => [equipPhotos(e)],
  onRemove: e => { for (const ph of e.photos || []) if (ph.store === 'fs') window.cloud?.photo?.del(ph.id).catch(() => {}); }, // 앱 안 사진도 같이 지움 (Drive 사진은 폴더에 남음)
  printBody: e => { // 앱 안 사진은 화면에서 이미 읽은 것만
    const srcs = (e.photos || []).map(ph => (ph.store === 'fs' ? photoLoaded.get(ph.id) : photoSrc(ph.id, 800))).filter(Boolean);
    return srcs.length ? [h('h2', null, `사진 ${srcs.length}`), h('div', 'pp-photos', srcs.map(src => Object.assign(h('img'), { src, alt: '' })))] : null;
  },
});
function renderEquip() { EQUIP.render(); }

// ---------- 공동기기 목록 넣기 (PI): 학교·병원 홈페이지의 공동기기 정보를 기기 탭에 묶음째 ----------
// 목록 하나 = 묶음 하나 { group: 묶음 이름, src: 출처, kind·owner: 기기마다 없을 때 쓸 구분·담당자,
//   items: [{ name, desc: 뭐 하는 기기인지 한 줄, model, maker, place: 방 (목록에 보임), spot: 세부 위치 (본문 정보에), owner, kind, how: 이용 방법, uses: [활용분야] }] }
// 홈페이지에 적힌 그대로 (빈 값은 뺌). 정보만 넣음 (사용 신청·예약은 홈페이지에서)
// 이름은 '영어 (홈페이지 한글 이름)' — 좁은 목록에서도 영어가 먼저 보이게. 같은 영어 이름이 여럿이면 모델(또는 구입 연도)을 붙임
// 같은 묶음에 같은 이름이 있으면 건너뜀 → 목록을 늘린 뒤 다시 넣어도 새것만 들어감
//   의대 연구기기현황 https://med.knu.ac.kr/pages/sub.htm?nav_code=knu1670414710 (2026.10, 69개 — 목록에 두 번 올라간 3개는 하나로 = 66개)
//     기기 상세 페이지(mode=view, idx)의 예약방법까지. 이름 끝이 '-학정동'이면 학정동 묶음(이름에선 뺌), 나머지는 동인동.
//     담당자는 동인동·학정동 모두 한 사람 (홈페이지엔 교실 교수 메일 등이 섞여 있음). 구분은 '공동기기실 장비'(기본) / '연구기기'(kind)
//     학정동은 다 의생명1호관이라 묶음 이름에 건물을 쓰고 위치는 호수만
//   경북대병원 생명의학연구원 Core lab https://bmri.knuh.kr/content/06application/10_01.php (2026.10) — 다 연구원 안이라 위치는 비움 (묶음 이름으로)
const SHARED_EQUIPS = [
  { group: '동인동 공동기기', src: '의대 연구기기현황', kind: '공동기기실 장비', owner: '정지연 053-420-4989 jiyean98@knu.ac.kr', items: [
    { name: 'NanoDrop (분광광도계)', desc: '1–2 µL만으로 핵산·단백질 농도와 순도(흡광도)를 재는 분광광도계', model: 'Nano Drop Ultra', maker: 'thermo', place: 'N402' },
    { name: 'TissueLyser (조직파쇄기)', desc: '비드로 조직·세포 여러 시료를 한 번에 갈아 균질화 (RNA·DNA·단백질 추출 전 처리)', model: 'Tissue Lyser III', maker: 'Qiagen', place: 'N469' },
    { name: 'Body composition NMR (핵자기공명분석기)', desc: '살아 있는 마우스의 체지방·제지방·체액량을 재는 NMR 체성분 분석기', model: 'minispec LF50', maker: 'Bruker', place: '실험동물자원관리센터', spot: '2층' },
    { name: 'Gamma counter (감마카운터기)', desc: '튜브 시료의 감마선 방사능(¹²⁵I 등)을 세는 감마 카운터', model: 'Wizard2', maker: 'PerkinElmer', place: 'N138' },
    { name: 'Phosphor imager Typhoon (화상분석시스템)', desc: '방사성 동위원소로 감광한 이미징 플레이트(IP)를 읽는 phosphor imager', model: 'Typhoon IP', maker: 'cytiva', place: 'N139', spot: '동위원소 실험실' },
    { name: 'Analytical balance (분석용전자저울)', desc: '0.1 mg 단위까지 재는 분석용 저울', model: 'ML104T', place: 'N138', spot: '동위원소실 안 N142호' },
    { name: 'Refrigerated microcentrifuge (탁상형냉장원심분리기)', desc: '1.5·2 mL 튜브용 냉장 마이크로원심분리기', model: 'CN/FC5515R', maker: 'Ohaus', place: 'N138', spot: '동위원소실' },
    { name: 'X-ray film processor (필름현상기)', desc: '웨스턴·방사선 X-ray 필름을 자동으로 현상', model: 'SRX 101A', maker: 'kodak', place: 'N139' },
    { name: 'Ultracentrifuge 2023 (초고속원심분리기)', desc: '최대 100,000 rpm으로 돌려 엑소좀·바이러스·세포소기관 등을 분리하는 초고속 원심분리기', model: 'Optima XE-100', maker: 'beckman', place: 'N139' },
    { name: 'Freeze dryer (동결건조기)', desc: '시료를 얼린 뒤 진공에서 수분을 날려 말리는 동결건조기', model: 'FD8518', maker: '일신', place: 'N408' },
    { name: 'Holotomography Tomocube (홀로그램현미경)', desc: '염색 없이 살아 있는 세포를 3D로 보는 홀로토모그래피 현미경 (형광도 같이)', model: 'HT-2H', maker: 'TOMOCUBE', place: 'N408' },
    { name: 'Single-cell analyzer BD Rhapsody (DNA 서열 분석기)', desc: '단일세포 분석(scRNA-seq 등)용 세포 포획·바코딩 시스템 — 홈페이지 이름은 ‘DNA 서열 분석기’', model: 'Rhapsody-HT', maker: 'BD', place: 'N402' },
    { name: 'Clinical chemistry analyzer (임상화학자동분석장치)', desc: '혈청·혈장의 생화학 수치(간·신장 기능 등)를 자동으로 재는 분석기', model: 'Vitros XT3400', maker: 'Johnson & Johnson', place: 'N402' },
    { name: 'Flow cytometer CytoFLEX (유세포분석기)', desc: '형광 표지한 세포를 하나씩 재는 다색 유세포분석기 (분석 전용)', model: 'CytoFLEX', maker: 'Beckman', place: 'N469' },
    { name: 'Holotomography Nanolive (세포단층촬영 현미경)', desc: '염색 없이 살아 있는 세포의 3D 구조를 보는 홀로토모그래피 현미경', model: '3D cell explorer', maker: 'Nanolive', place: 'N469' },
    { name: 'Live-cell imager IncuCyte (실시간세포분석기)', desc: '인큐베이터 안에서 세포를 자동으로 계속 찍어 증식·이동(wound healing) 등을 보는 장비', model: 'Incucyte zoom', maker: 'essen bioscience', place: 'N469' },
    { name: 'Cryostat CM3050S (냉동조직박절기)', desc: '냉동 조직을 얇게 잘라 절편을 만드는 크라이오스탯', model: 'CM3050S', maker: 'Leica', place: 'N469' },
    { name: 'Plate reader FlexStation 3 (형광리더기)', desc: '96·384-well 플레이트의 흡광·형광·발광을 재는 리더 (피펫 내장 — 시약을 넣으며 바로 측정)', model: 'FlexStation 3', maker: 'Molecular Device/US', place: 'N469' },
    { name: 'qPCR QuantStudio 3 (실시간 유전자 증폭기)', desc: '증폭되는 양을 실시간으로 재는 qPCR (96-well)', model: 'QuantStudio3', maker: 'Thermo', place: 'N469', how: '장비 앞 예약대장에 예약 후 사용, 처음이면 사용자 교육 후 사용' },
    { name: 'Inverted fluorescence microscope THUNDER (형광현미경)', desc: '배양 세포를 아래에서 보는 도립 형광현미경 (THUNDER로 흐림을 걷어 선명)', model: 'DMi 8 - THUNDER', maker: 'Leica', place: 'N469', how: '담당자 교육 후 사용, 장비 앞 예약대장에 예약 후 사용, 사용 후 사용대장 기입' },
    { name: 'Cell sorter FACSAria Fusion (유세포분석기)', desc: '형광으로 원하는 세포를 골라 따로 모으는 세포 분리기(sorter)', model: 'FACS Aria Fusion', maker: 'Becton Dickinson', place: 'N401', how: '오퍼레이터 예약 후 사용' },
    { name: 'Flow cytometer FACSCalibur (유세포분석기)', desc: '형광 표지한 세포를 재는 구형 4색 유세포분석기', model: 'FACS Calibur', maker: 'Becton Dickinson', place: 'N401', how: '오퍼레이터 예약 후 이용, 사용 시간 09:00–17:00' },
    { name: 'Plate reader SpectraMax M2e (형광리더기)', desc: '플레이트·큐벳의 흡광·형광·발광을 파장을 바꿔 가며 재는 리더', model: 'Spectramax M2e', maker: 'Molecular Device/US', place: 'N469', how: '사용자가 직접 사용, 처음이면 장비 교육 후 사용' },
    { name: 'Ultrapure water system (초순수제조장치)', desc: '실험용 초순수(Type 1)를 바로 받아 쓰는 장치 (UV 살균)', model: 'Direct-Q5UV', maker: 'Millipore', place: 'N139', how: '사용자가 직접 사용' },
    { name: 'Confocal microscope STELLARIS 5 (공초점현미경)', desc: '형광 시료를 층층이 선명하게 찍는 공초점 현미경', model: 'STELLARIS5', maker: 'Leica', place: 'N408', how: '오퍼레이터 예약 후 이용 (직접 사용 불가, 쓰기 전 장비 사양 확인), 09:00–17:00, 주말·공휴일 불가' },
    { name: 'Nanoparticle tracking analyzer (입자측정장치)', desc: '엑소좀 같은 나노입자를 하나씩 추적해 크기·농도를 재는 장비 (NTA)', model: 'NTA Pro', maker: 'Malvern', place: 'N402', how: '담당 오퍼레이터에게 전화 예약, 교육 받은 사람만 직접 사용, 의과대학 안에서만, 평일 09:00–18:00' },
    { name: 'Multispectral imaging system (멀티스펙트럼 형광영상분석시스템)', desc: '파장별로 찍어 겹치는 형광·자가형광을 분리(unmixing)하는 이미징 시스템', model: 'Nuance FX', maker: 'Perkin Elmer', place: 'N469', how: '예약대장에 예약 후 사용, 사용 후 기기 사용대장 기입' },
    { name: 'Ultracentrifuge 2015 (초고속원심분리기)', desc: '최대 100,000 rpm으로 돌려 엑소좀·바이러스·세포소기관 등을 분리하는 초고속 원심분리기', model: 'Optima XE-100', maker: 'Beckman Coulter', place: 'N139', how: '담당자에게 전화로 예약 후 이용, 처음이면 담당자에게 교육 후 사용' },
    { name: 'High-speed centrifuge (고속원심분리기)', desc: '큰 부피 시료를 최대 26,000 rpm으로 돌리는 바닥형 고속 원심분리기', model: 'Avanti JXN-26', maker: 'Beckman Coulter', place: 'N139', how: '담당자에게 전화로 예약 후 이용, 사용 후 기기 사용대장 기입, 처음이면 담당자에게 교육 후 사용' },
    { name: 'qPCR QuantStudio 5 (실시간 유전자 증폭기)', desc: '증폭되는 양을 실시간으로 재는 qPCR (96/384-well 블록 교체)', model: 'QuantStudio5', maker: 'thermo science', place: 'N469', how: '예약대장에 예약 후 사용, 사용 후 기기 사용대장 기입' },
    { name: 'Veterinary hematology analyzer (동물 혈구 분석기)', desc: '동물 혈액의 혈구 수(적혈구·백혈구·혈소판 등, CBC)를 재는 분석기', model: 'SCI-VET', maker: 'Scil', place: 'N402', how: '사용 전 예약, 사용 후 기기 사용대장 기입, 처음이면 담당자에게 교육 후 사용' },
    { name: 'Chemi imager FUSION (케미닥)', desc: '웨스턴 블롯(화학발광)·겔을 카메라로 찍는 이미저', model: 'FUSION', maker: 'Vilber', place: 'N408', how: '사용 후 기기 사용대장 기입, 처음이면 담당자에게 교육 후 사용' },
    { name: 'Telemetry blood pressure monitor (소동물혈압계)', desc: '쥐에 넣은 무선 송신기로 혈압 등을 계속 재는 텔레메트리 장치', model: 'TRM54PB', maker: 'Kaha Sciences (New Zealand)', place: '실험동물자원관리센터' },
    { name: 'Confocal microscope LSM 5 Exciter (공초점현미경)', desc: '형광 시료를 층층이 선명하게 찍는 공초점 현미경 (2008년 도입)', model: 'LSM5 Exciter', maker: 'Zeiss', place: 'N469', how: 'operator 분석 장비 — 담당자에게 예약 후 사용, 예약대장에 예약, 사용 후 기기 사용대장 기입' },
    { name: 'Upright fluorescence microscope (형광현미경)', desc: '슬라이드 표본을 위에서 보는 정립 형광현미경', model: 'Axio Imager A1', maker: 'Zeiss', place: 'N469', how: '교육 후 사용, 문 앞 예약대장에 예약, 사용대장 꼭 기입' },
    { name: 'Dose calibrator (선량 측정계)', desc: '방사성 시료의 방사능 양을 재는 측정기 (dose calibrator)', model: 'CRC-712m', maker: 'Capintec', place: '신관 동위원소실', kind: '연구기기' },
    { name: 'Autoclave (고압멸균기)', desc: '고온·고압 증기로 기구·배지·폐기물을 멸균 (65 L)', model: 'ST-65G, 65L', maker: '제이오텍', place: 'N371', spot: '기능학실습실B', how: '학생 실습이 없는 기간에 예약 후 사용', kind: '연구기기' },
    { name: 'Plate reader SpectraMax i3x (마이크로플레이트리더)', desc: '플레이트의 흡광·형광·발광을 재는 멀티모드 리더', model: 'Spectramax i3x (US)', maker: 'Molecular Devices', place: 'N371', spot: '기능학실습실B', how: '학생 실습이 없는 기간에 예약 후 사용', kind: '연구기기' },
    { name: 'Phase contrast microscope (위상차현미경)', desc: '염색하지 않은 표본도 명암 차로 보는 위상차 현미경', model: 'ECLIPSE Ci-S (JP)', maker: 'Nikon', place: 'N327', spot: '형태학실습실', how: '학생 실습이 없는 기간에 예약 후 사용', kind: '연구기기' },
    { name: 'Stereo microscope (실체현미경)', desc: '표본을 낮은 배율에서 입체로 보는 현미경', model: 'E-400 (5각, JP)', maker: 'Nikon', place: 'N327', spot: '형태학실습실', how: '학생 실습이 없는 기간에 예약 후 사용', kind: '연구기기' },
    { name: 'Gel imager Gel Doc XR (겔다큐멘테이션시스템)', desc: 'UV로 DNA·단백질 겔을 비춰 찍는 겔 이미징 장치', model: 'Gel Doc XR system (170-8170, US)', maker: 'Bio-Rad', place: 'N371', spot: '기능학실습실B', how: '학생 실습이 없는 기간에 예약 후 사용', kind: '연구기기' },
    { name: 'Refrigerated microcentrifuge (미량냉장원심분리기)', desc: '1.5·2 mL 튜브용 냉장 마이크로원심분리기', model: 'Smart R17, 1.5mL×18/24', maker: '한일과학산업', place: 'N371·N471', spot: '기능학실습실 B·C', how: '학생 실습이 없는 기간에 예약 후 사용', kind: '연구기기' },
    { name: 'Microcentrifuge (미량원심분리기)', desc: '1.5·2 mL 튜브용 마이크로원심분리기 (상온)', model: '5424 (DE)', maker: 'Eppendorf', place: 'N371·N471', spot: '기능학실습실 B·C', how: '학생 실습이 없는 기간에 예약 후 사용', kind: '연구기기' },
    { name: 'Probe sonicator (균질기)', desc: '초음파로 세포를 깨거나 DNA를 자르는 초음파 균질기 (probe sonicator)', model: 'VC505, 500W (US)', maker: 'Sonics and Materials', place: 'N471', spot: '기능학실습실C', how: '학생 실습이 없는 기간에 예약 후 사용', kind: '연구기기' },
    { name: 'Fluorescence microscope AX70 (형광도립현미경)', desc: '형광 표지한 표본을 보는 형광현미경', model: 'AX70 (JP)', maker: 'Olympus', place: '350호', kind: '연구기기' },
    { name: 'Laser Doppler flowmeter (혈류 측정기)', desc: '레이저 도플러로 조직의 혈류를 재는 장치 (광섬유 바늘 프로브)', model: 'ML192 & fiber optic needle probe', maker: 'AD Instruments', place: '343호', kind: '연구기기' },
    { name: 'Cryostat MEV (냉동조직박편절단기)', desc: '냉동 조직을 얇게 잘라 절편을 만드는 크라이오스탯', model: 'MEV 3832', maker: 'Sakura', place: '343호', kind: '연구기기' },
    { name: 'UV-Vis spectrophotometer (자외선 분광분석기)', desc: '큐벳에 담은 시료의 자외선·가시광 흡광도를 재는 분광광도계', model: 'UV-1650PC', maker: 'Shimadzu', place: 'N107-2', kind: '연구기기' },
    { name: 'Fraction collector (분액수집기)', desc: '크로마토그래피(FPLC)에서 나오는 용출액을 튜브에 나눠 받는 장치', model: 'Frac-950', maker: 'GE', place: '신관 공동기기실', kind: '연구기기' },
    { name: 'Mass spectrometer (질량분석기)', desc: '나노 LC로 분리한 펩타이드 등의 질량을 재는 LC-MS/MS (단백체 분석)', model: 'nanoUPLC Q-Tof Premier', maker: 'Waters', place: 'N107', kind: '연구기기' },
    { name: 'HPLC (고속액체크로마토그라프)', desc: '물질을 분리·정제하는 HPLC', model: 'Delta 600', maker: 'Waters', place: '사이클로트론실', kind: '연구기기' },
    { name: 'Cryostat CM1850 (냉동조직박절기)', desc: '냉동 조직을 얇게 잘라 절편을 만드는 기본형 크라이오스탯', model: 'CM1850', maker: 'Leica', place: 'N147', kind: '연구기기' },
  ] },
  { group: '학정동 공동기기 (의생명1호관)', src: '의대 연구기기현황', kind: '공동기기실 장비', owner: '정지연 053-420-4989 jiyean98@knu.ac.kr', items: [
    { name: 'Thermal cycler (PCR 기기)', desc: '유전자를 증폭하는 PCR 기기 (thermal cycler)', place: '606호' },
    { name: 'Autoclave (고압멸균기)', desc: '고온·고압 증기로 기구·배지·폐기물을 멸균', place: '606호' },
    { name: 'Blood freezer 2 (혈액냉동고)', desc: '혈액·검체를 얼려 보관하는 냉동고', maker: 'carrier', place: '416호' },
    { name: 'Blood freezer 1 (혈액냉동고)', desc: '혈액·검체를 얼려 보관하는 냉동고', maker: 'carrier', place: '416호' },
    { name: 'NanoDrop (분광광도계)', desc: '1–2 µL만으로 핵산·단백질 농도와 순도(흡광도)를 재는 분광광도계', model: 'ND-1', maker: 'thermo', place: '606호' },
    { name: 'Chemi imager ImageQuant 800 (화상분석시스템)', desc: '웨스턴 블롯(화학발광·형광)·겔을 찍는 이미저', model: 'Image Quant800', maker: 'cytiva', place: '606호' },
    { name: 'Inverted microscope (역상현미경)', desc: '배양 중인 세포를 아래에서 보는 도립 현미경 (형광 없음)', model: 'DMi 1', maker: 'Leica', place: '606호' },
    { name: 'Inverted fluorescence microscope (형광현미경)', desc: '배양 세포를 아래에서 보는 도립 형광현미경', model: 'DMi 8', maker: 'Leica', place: '606호' },
    { name: 'Refrigerated centrifuge 5810R (탁상형냉장원심분리기)', desc: '15·50 mL 튜브와 플레이트를 돌리는 냉장 탁상 원심분리기', model: '5810R', maker: 'Eppendorf', place: '606호' },
    { name: 'Ice maker (덩어리얼음제조기)', desc: '실험에 쓸 얼음을 만드는 제빙기', model: 'IT/GB1540', maker: 'brema', place: '606호' },
    { name: 'qPCR StepOnePlus (실시간 유전자 증폭기)', desc: '증폭되는 양을 실시간으로 재는 qPCR (96-well)', model: 'StepOnePlus', maker: 'thermo', place: '606호' },
    { name: 'Cryostat CM3050S (냉동조직박절기)', desc: '냉동 조직을 얇게 잘라 절편을 만드는 크라이오스탯', model: 'CM3050S', maker: 'Leica', place: '606호' },
    { name: 'Pyrosequencer PyroMark (DNA 서열분석기)', desc: '짧은 DNA 서열을 읽어 메틸화·SNP·돌연변이를 정량하는 파이로시퀀서', model: 'PyroMark Q48', maker: 'QIAGEN', place: '606호' },
    { name: 'Plate reader FlexStation 3 (형광리더기)', desc: '96·384-well 플레이트의 흡광·형광·발광을 재는 리더 (피펫 내장 — 시약을 넣으며 바로 측정)', model: 'FlexStation 3', maker: 'Molecular Device/US', place: '606호' },
  ] },
  { group: '생명의학연구원', src: '경북대병원 생명의학연구원 Core lab', owner: '김효정 053-200-4603 knuhcorelab@knuh-ext.kr', items: [
    { name: 'Confocal microscope LSM 800 Airyscan (고감도 고해상력 공초점 현미경)', desc: '형광 시료를 층층이 고해상도로 찍는 공초점 현미경 (Airyscan 초해상)', model: 'LSM 800 with AiryScan', maker: 'Carl Zeiss/독일', uses: ['다중 형광 염색한 세포·조직의 2D 고해상도 고배율 이미징·정량분석', '3D 형광 이미징', '장시간 생세포 이미징', '칼슘 인디케이터로 세포 내 칼슘 이온 이미징', '레이저로 특정 단백질 자극 후 시간에 따른 변화 분석'] },
    { name: 'Spectrophotometer DS-11 (나노분광분석기)', desc: '소량으로 핵산·단백질을 정량하는 분광광도계 (NanoDrop과 같은 용도)', model: 'DS-11', maker: 'DeNovix/USA', uses: ['UV·가시광선 전 파장으로 핵산·단백질 정량'] },
    { name: 'Isothermal amplifier (등온 핵산 증폭기)', desc: '온도를 오르내리지 않고 한 온도에서 핵산을 증폭·검출하는 장치', model: 'MXM-100', maker: '엠모니터/대한민국', uses: ['소량의 핵산 검출·분석', '부대장비 없이 빠르게 표적 유전물질 검출'] },
    { name: 'Laser microdissection microscope (레이저 미세절단 현미경)', desc: '조직 절편에서 원하는 세포·부위만 레이저로 잘라 모으는 현미경', model: 'LMD7', maker: 'Leica/독일', uses: ['조직표본·배양세포에서 원하는 부위만 레이저로 미세 절단해 채취 (single cell 수준까지)', '정상 조직과 인접한 병리 세포 분리'] },
    { name: 'Plate reader SPARK (멀티 플레이트 리더)', desc: '플레이트의 흡광·형광·발광을 재는 멀티모드 리더', model: 'SPARK 10M', maker: 'TECAN/Austria', uses: ['흡광도 200–1000 nm (스캔 포함)', '형광 (filter·monochromator, 3D 스캔, PicoGreen 정량)', '발광 (장비 안에서 시약 분주)'] },
    { name: 'Chemi imager LAS 4000 (바이오 분자 이미징 시스템)', desc: '겔·웨스턴 블롯을 찍는 화학발광·형광 이미저', model: 'LAS 4000', maker: 'GE Healthcare/Japan', uses: ['gel 염색(가시광·형광) 이미지 촬영', 'Western blot 검출 이미지'] },
    { name: 'In vivo imager IVIS (발광형광영상장비)', desc: '살아 있는 소동물 몸속의 발광·형광 신호를 찍는 in vivo 이미징 장비', model: 'IVIS Lumina III', maker: 'Perkin Elmer/USA', uses: ['고감도 발광·형광 촬영과 정량', '소형동물 모델 in vivo 모니터링'] },
    { name: 'Electroporator Nucleofector (세포 형질주입 시스템)', desc: '전기 자극으로 세포에 유전자를 넣는 형질주입(electroporation) 장비', model: '4D Nucleofector', maker: 'Lonza/스위스', uses: ['세포 종류별 전기 자극으로 유전자 도입', 'Suspension·adherent, cell line·primary cell 모두'] },
    { name: 'OCT angiography AOCT (소동물용 혈관 및 혈류 이미징)', desc: '마우스·랫드의 혈관 구조와 혈류를 보는 광간섭단층(OCT) 이미징 장비', maker: '카이스트 Biomedical Photonic Imaging Lab/한국', uses: ['mouse·rat 혈관 구조와 상대 혈류 속도 이미징', 'AOCT 단독 또는 수술현미경 통합'] },
    { name: 'Surgical microscope (수술용 현미경)', desc: '소동물 수술·미세 작업용 입체 현미경 (사진·동영상 촬영)', model: 'M320 F12', maker: 'Leica Microsystems/Germany', uses: ['고해상도 입체현미경, 이미지·동영상 촬영(SD 카드)', '제브라피쉬·동물 실험'] },
    { name: 'qPCR QuantStudio 5 (실시간 유전자 증폭기)', desc: '증폭되는 양을 실시간으로 재는 qPCR (384-well)', model: 'QuantStudio 5', maker: 'Applied Biosystems', uses: ['384-well 전용 real-time PCR', '유전자 발현·병원체 검출·SNP·genotyping'] },
    { name: 'qPCR CFX96 (실시간 유전자 증폭기)', desc: '증폭되는 양을 실시간으로 재는 qPCR (96-well)', model: 'CFX96 Touch', maker: 'Bio-Rad/USA', uses: ['96-well real-time PCR', '유전자 정량·발현 비교, SNP·mutation 검출'] },
    { name: 'Micro-CT (전산화단층촬영장치)', desc: 'X선으로 뼈·시료 내부를 3D로 찍는 micro-CT', model: 'Skyscan 1275XL', maker: 'Bruker/벨기에', uses: ['X-ray로 시료 내부 구조를 비파괴 촬영', '3D 영상화·정량 분석 (뼈·치아 등)'] },
    { name: 'Fluorescence microscope (형광현미경)', desc: '형광 표지한 조직·세포를 보는 형광현미경', model: 'AXIO', maker: 'Carl Zeiss/독일', uses: ['미세구조 관찰', '형광 항체로 조직·세포 내 특정 부위 관찰'] },
    { name: 'Chemi imager Fusion FX (화상분석시스템)', desc: '웨스턴 블롯·겔을 찍는 화학발광 이미저', model: 'Fusion FX', maker: 'Vilber Lourmat/France', uses: ['Western blot 이미지 촬영·분석', 'DNA·RNA gel 이미지 촬영·분석'] },
  ] },
];
// 같은 종류 기기 — 기기 페이지 '## 참고'에 나머지를 한 줄씩: [묶음, 이름, 무엇이 다른지 · 어디]
const SHARED_FAMILIES = [
  [['동인동 공동기기', 'qPCR QuantStudio 5 (실시간 유전자 증폭기)', '96/384-well 블록을 바꿔 끼움, 형광 채널이 많음 · N469'],
   ['동인동 공동기기', 'qPCR QuantStudio 3 (실시간 유전자 증폭기)', '96-well 고정 기본형 · N469'],
   ['학정동 공동기기 (의생명1호관)', 'qPCR StepOnePlus (실시간 유전자 증폭기)', 'StepOnePlus, 96-well 구형 · 의생명1호관 606호'],
   ['생명의학연구원', 'qPCR QuantStudio 5 (실시간 유전자 증폭기)', '384-well 전용 · 생명의학연구원'],
   ['생명의학연구원', 'qPCR CFX96 (실시간 유전자 증폭기)', 'CFX96 Touch, 96-well · 생명의학연구원']],
  [['동인동 공동기기', 'Cell sorter FACSAria Fusion (유세포분석기)', '세포를 골라 모으는 분리(sorting)까지 · 오퍼레이터 · N401'],
   ['동인동 공동기기', 'Flow cytometer FACSCalibur (유세포분석기)', '구형 4색 분석기 · 오퍼레이터 · N401'],
   ['동인동 공동기기', 'Flow cytometer CytoFLEX (유세포분석기)', '최신 다색 분석기 (분리는 안 됨) · N469']],
  [['동인동 공동기기', 'Confocal microscope STELLARIS 5 (공초점현미경)', 'Leica 최신형 (2021) · 오퍼레이터 · N408'],
   ['동인동 공동기기', 'Confocal microscope LSM 5 Exciter (공초점현미경)', 'Zeiss 구형 (2008) · 오퍼레이터 · N469'],
   ['생명의학연구원', 'Confocal microscope LSM 800 Airyscan (고감도 고해상력 공초점 현미경)', 'Zeiss LSM 800, Airyscan 초해상 · 생명의학연구원']],
  [['동인동 공동기기', 'NanoDrop (분광광도계)', 'NanoDrop Ultra, 2025년 도입한 최신 모델 · N402'],
   ['학정동 공동기기 (의생명1호관)', 'NanoDrop (분광광도계)', 'ND-1 · 의생명1호관 606호'],
   ['생명의학연구원', 'Spectrophotometer DS-11 (나노분광분석기)', 'DeNovix DS-11, 같은 용도의 다른 회사 제품 · 생명의학연구원'],
   ['동인동 공동기기', 'UV-Vis spectrophotometer (자외선 분광분석기)', '큐벳용 UV-Vis (소량 측정은 안 됨) · N107-2']],
  [['동인동 공동기기', 'Plate reader FlexStation 3 (형광리더기)', '피펫 내장 — 시약을 넣으며 바로 측정 (칼슘 등) · N469'],
   ['학정동 공동기기 (의생명1호관)', 'Plate reader FlexStation 3 (형광리더기)', 'FlexStation 3 같은 모델 · 의생명1호관 606호'],
   ['동인동 공동기기', 'Plate reader SpectraMax M2e (형광리더기)', '흡광·형광·발광, 큐벳도 · N469'],
   ['동인동 공동기기', 'Plate reader SpectraMax i3x (마이크로플레이트리더)', 'Spectramax i3x 멀티모드 · N371 기능학실습실B (실습 없는 기간에)'],
   ['생명의학연구원', 'Plate reader SPARK (멀티 플레이트 리더)', 'Tecan SPARK 10M · 생명의학연구원']],
  [['동인동 공동기기', 'Ultracentrifuge 2023 (초고속원심분리기)', 'Optima XE-100, 2023년 도입 · N139'],
   ['동인동 공동기기', 'Ultracentrifuge 2015 (초고속원심분리기)', 'Optima XE-100 같은 모델, 2015년 도입 · N139'],
   ['동인동 공동기기', 'High-speed centrifuge (고속원심분리기)', 'Avanti JXN-26, 최대 26,000 rpm · 큰 부피 · N139']],
  [['동인동 공동기기', 'Refrigerated microcentrifuge (탁상형냉장원심분리기)', '1.5·2 mL 튜브 · 냉장 · N138 동위원소실'],
   ['학정동 공동기기 (의생명1호관)', 'Refrigerated centrifuge 5810R (탁상형냉장원심분리기)', 'Eppendorf 5810R, 15·50 mL 튜브·플레이트 · 냉장 · 의생명1호관 606호'],
   ['동인동 공동기기', 'Refrigerated microcentrifuge (미량냉장원심분리기)', '1.5·2 mL 튜브 · 냉장 · N371·N471 기능학실습실 (실습 없는 기간에)'],
   ['동인동 공동기기', 'Microcentrifuge (미량원심분리기)', '1.5·2 mL 튜브 · 상온 · N371·N471 기능학실습실 (실습 없는 기간에)']],
  [['동인동 공동기기', 'Cryostat CM3050S (냉동조직박절기)', 'Leica CM3050S 연구용 · N469'],
   ['학정동 공동기기 (의생명1호관)', 'Cryostat CM3050S (냉동조직박절기)', 'Leica CM3050S 같은 모델 · 의생명1호관 606호'],
   ['동인동 공동기기', 'Cryostat CM1850 (냉동조직박절기)', 'Leica CM1850 기본형 · N147'],
   ['동인동 공동기기', 'Cryostat MEV (냉동조직박편절단기)', 'Sakura MEV 3832 · 343호']],
  [['동인동 공동기기', 'Inverted fluorescence microscope THUNDER (형광현미경)', 'Leica DMi8 도립 형광, THUNDER로 더 선명 · N469'],
   ['학정동 공동기기 (의생명1호관)', 'Inverted fluorescence microscope (형광현미경)', 'Leica DMi8 도립 형광 기본형 · 의생명1호관 606호'],
   ['학정동 공동기기 (의생명1호관)', 'Inverted microscope (역상현미경)', 'Leica DMi1 도립, 형광 없음 (배양 확인용) · 의생명1호관 606호'],
   ['동인동 공동기기', 'Upright fluorescence microscope (형광현미경)', 'Zeiss Axio Imager A1 정립 형광 (슬라이드) · N469'],
   ['생명의학연구원', 'Fluorescence microscope (형광현미경)', 'Zeiss AXIO · 생명의학연구원']],
  [['동인동 공동기기', 'Holotomography Tomocube (홀로그램현미경)', 'Tomocube HT-2H, 형광도 같이 · N408'],
   ['동인동 공동기기', 'Holotomography Nanolive (세포단층촬영 현미경)', 'Nanolive 3D Cell Explorer · N469']],
  [['동인동 공동기기', 'Chemi imager FUSION (케미닥)', 'Vilber FUSION, 화학발광 · N408'],
   ['학정동 공동기기 (의생명1호관)', 'Chemi imager ImageQuant 800 (화상분석시스템)', 'Cytiva ImageQuant 800, 화학발광·형광 · 의생명1호관 606호'],
   ['생명의학연구원', 'Chemi imager Fusion FX (화상분석시스템)', 'Vilber Fusion FX, 화학발광 · 생명의학연구원'],
   ['생명의학연구원', 'Chemi imager LAS 4000 (바이오 분자 이미징 시스템)', 'LAS 4000, 화학발광·형광 · 생명의학연구원'],
   ['동인동 공동기기', 'Gel imager Gel Doc XR (겔다큐멘테이션시스템)', 'Bio-Rad Gel Doc XR, UV 겔 촬영 · N371 기능학실습실B'],
   ['동인동 공동기기', 'Phosphor imager Typhoon (화상분석시스템)', 'Typhoon IP, 방사성 이미징 플레이트 전용 · N139']],
  [['학정동 공동기기 (의생명1호관)', 'Autoclave (고압멸균기)', '의생명1호관 606호'],
   ['동인동 공동기기', 'Autoclave (고압멸균기)', '제이오텍 65 L · N371 기능학실습실B (실습 없는 기간에)']],
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
      for (const { name, desc = '', model = '', maker = '', place: own = '', spot = '', owner = L.owner, kind = L.kind, how = '', uses = [] } of L.items) {
        if (db.stock.equips.some(e => e.group === g.id && e.name === name)) continue;
        const fam = SHARED_FAMILIES.find(f => f.some(([g, n]) => g === L.group && n === name)) || [];
        const refs = fam.filter(([g, n]) => g !== L.group || n !== name).map(([, n, line]) => `- ${n} — ${line}`);
        db.stock.equips.push({ id: uid(), group: g.id, name, where: own || undefined, owner, updatedAt: isoToday(),
          memo: [model, maker].filter(Boolean).join(' · ') || undefined,
          // 위치(방)·담당은 제목 줄 칸, 모델·제작사는 한 줄 메모에 있어서 본문 정보엔 세부 위치·구분만
          note: [desc, (spot || kind) && '## 정보', spot && `- 위치: ${own} ${spot}`, kind && `- 구분: ${kind}`,
            how ? '## 이용' : '', ...how.split(', ').filter(Boolean).map(x => `- ${x}`),
            uses.length ? '## 활용' : '', ...uses.map(u => `- ${u}`),
            refs.length ? '## 참고 — 같은 종류' : '', ...refs].filter(Boolean).join('\n') });
        added++;
      }
    }
    save();
    if (!added) alert('고른 목록은 이미 다 들어 있어요.');
  }, [h('p', 'hint', '고른 목록을 묶음째 넣어요 (위치·모델·제작사·담당·이용 방법·활용분야). 같은 묶음에 같은 이름이 있으면 건너뛰어요.'),
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
