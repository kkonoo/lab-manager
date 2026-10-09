// 랩 매니저 — 기기 사진을 PI의 Google Drive에 저장하는 Apps Script 웹 앱
// 한 번만 설정 (README '기기 사진 저장'): script.google.com → 새 프로젝트 → 이 코드를 통째로 붙여 넣기
//   → 배포 > 새 배포 > 유형: 웹 앱, 실행: 나, 액세스: 모든 사용자 → 권한 허용 → 웹 앱 주소(…/exec)를 랩 매니저 설정에 붙여 넣기
// 누가 쓰는지: 앱이 보내는 Firebase 로그인 토큰으로 Firestore의 labs/{lab} 문서를 읽어 봄 → 읽히면 그 랩의 PI나 멤버 (firestore.rules가 판단)
// 사진은 아래 FOLDER_ID 폴더에 원본 그대로, '링크가 있는 모든 사용자: 보기'로 (앱에서 사진을 띄우려고)
// 이 웹 앱을 배포한 계정이 그 폴더를 편집할 수 있어야 해요
const PROJECT = 'lab-manager-knumed'; // js/firebase-config.js 의 projectId
const FOLDER_ID = '13NutXWzgi1OEY6NwdD_H3N49oJ5AnBG8'; // 사진 폴더 — 폴더 주소 drive.google.com/drive/folders/<이 부분>

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (!isLabPerson(req.idToken, req.lab)) return reply({ error: '이 랩의 PI나 멤버만 쓸 수 있어요. 다시 로그인해 보세요.' });
    if (req.action === 'upload') {
      const blob = Utilities.newBlob(Utilities.base64Decode(req.data), req.type || 'image/jpeg', req.name || 'photo.jpg');
      const file = folder().createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return reply({ ok: true, id: file.getId() });
    }
    if (req.action === 'delete') {
      const file = DriveApp.getFileById(req.id);
      if (!inFolder(file)) return reply({ error: '이 앱이 올린 사진만 지울 수 있어요.' });
      file.setTrashed(true); // 휴지통으로 (30일 안에는 Drive에서 되살릴 수 있음)
      return reply({ ok: true });
    }
    return reply({ error: '알 수 없는 요청이에요.' });
  } catch (err) {
    return reply({ error: String((err && err.message) || err) });
  }
}
// 앱 설정에서 주소를 넣으면 연결 확인용으로 부름
function doGet() {
  return reply({ ok: true, app: 'lab-manager-photos' });
}
function isLabPerson(idToken, lab) {
  if (!idToken || !/^[A-Za-z0-9_-]+$/.test(lab || '')) return false;
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/labs/' + lab;
  const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true });
  return res.getResponseCode() === 200;
}
function folder() {
  return DriveApp.getFolderById(FOLDER_ID);
}
function inFolder(file) {
  const id = folder().getId(), parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === id) return true;
  return false;
}
function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
