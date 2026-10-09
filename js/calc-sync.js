// 실험 계산기의 버퍼 프리셋을 PI와 학생이 같이 봄 — Firestore calcPresets/{PI uid} = { j: 프리셋 목록 JSON }
// calc.html?lab={PI uid} 로 열 때만 Firebase를 불러옴. 누구나 읽고(학생은 로그인 없이), 고치기는 그 PI만 (firestore.rules)
// 계산기엔 로그인 버튼이 없음: 랩 매니저와 같은 주소라 로그인 상태를 같이 씀 → PI가 랩 매니저에 로그인한 브라우저에서 열면 고칠 수 있음
// 랩 매니저 위 🧮 버튼이 ?lab= 을 붙여 줌 (sync.js). calc.js 의 setPresets · setPresetOwner · presetError 를 씀
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
const lab = new URLSearchParams(location.search).get('lab');

if (firebaseConfig && lab) start();

async function start() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore-lite.js`), // 한 번 읽고 쓰기만 해서 lite
  ]);
  const app = initializeApp(firebaseConfig);
  const ref = F.doc(F.getFirestore(app), 'calcPresets', lab);
  let loaded = false;
  try {
    const snap = await F.getDoc(ref);
    if (snap.exists()) setPresets(JSON.parse(snap.data().j)); // 아직 없으면(PI가 고친 적 없음) 기본 프리셋 그대로
    loaded = true;
  } catch (e) { console.error('프리셋을 불러오지 못했어요', e); }
  const save = list => F.setDoc(ref, { j: JSON.stringify(list) })
    .catch(e => { console.error('프리셋 저장 실패', e); alert(`프리셋을 저장하지 못했어요 (${e.code}). 인터넷 연결을 확인해 주세요.`); });
  A.onAuthStateChanged(A.getAuth(app), u => {
    if (u?.uid !== lab) return setPresetOwner(null);
    if (loaded) setPresetOwner(save, lab);
    else presetError('버퍼 프리셋을 불러오지 못해서 지금은 고칠 수 없어요. 인터넷 연결과 Firestore 규칙(calcPresets)을 확인해 주세요.');
  });
}
