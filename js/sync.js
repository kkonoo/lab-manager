// 구글 로그인 + 기기 간 동기화 (Firebase Auth + Firestore). 살림노트 sync.js와 같은 방식, 자리만 다름.
// firebase-config.js 가 null 이면 아무것도 하지 않음 → 이 브라우저에만 저장.
// 저장 위치 (문서마다 { j: JSON 글 } 하나 — Firestore 자료형 제약을 피하려고)
//   users/{uid}/admin/{칸}        PI 전용: 과제·인건비·세목·정보·출장·내 정보 등 db의 나머지 칸 (칸 하나 = 문서 하나)
//   users/{uid}/adminDocs/{id}    서류 한 건 = 문서 하나
//   labs/{PI uid}                 랩 문서 { owner, ownerEmail, ownerName, members: [학생 구글 이메일] } — 보안 규칙이 이 목록으로 멤버 확인
//   labs/{PI uid}/meta/stock      재고의 묶음·보관 위치·업체, 프로토콜·기기 묶음, 팁 링크, 기기 사진 Google Drive 연결
//   labs/{PI uid}/protocols/{id}  프로토콜 하나 = 문서 하나 (본문 노트를 여럿이 동시에 고쳐도 안 겹치게)
//   labs/{PI uid}/equips/{id}     기기(공동기기 handbook) 하나 = 문서 하나
//   labs/{PI uid}/photos/{id}     기기 사진(앱 안 저장) 하나 = 문서 하나 — 동기화 목록엔 없고 기기 페이지에서 직접 읽고 씀 (window.cloud.photo)
//   labs/{PI uid}/items/{id}      재고 품목 하나 = 문서 하나 (학생 여럿이 동시에 고쳐도 안 겹치게)
//   labs/{PI uid}/orders/{id}     주문 하나 = 문서 하나
//   calcPresets/{PI uid}          계산기 버퍼 프리셋 — 동기화 목록엔 없고 calc.js에 바로 넘김 (setPresets · setPresetOwner)
// 랩 멤버(학생)로 로그인하면 랩 쪽만 주고받고 db.member 를 켬 → app.js가 연구 모드(프로토콜·계산기·재고·기기·팁)만 보여 줌
// app.js 의 db, persist, render, withDocs, fresh, VERSION 을 그대로 씀
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
const LAB_META = ['cats', 'places', 'vendors', 'protoGroups', 'equipGroups', 'tips', 'photoDrive']; // db.stock 안에서 랩이 같이 쓰는 목록·설정 (프로토콜·기기·품목은 한 건씩 따로)
const NOT_ADMIN = new Set(['docs', 'stock', 'orders', 'owner', 'member']); // users/{uid}/admin 으로 안 가는 칸

if (firebaseConfig) start();

async function start() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  // 같은 주소의 다른 앱(플래너·살림노트)과 기기 캐시를 같이 쓰므로 여러 탭 방식
  const fs = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });

  let user = null, lab = null, mode = null, unsubs = [], synced = new Map(), ready = false, timer = null;

  // ---------- 화면: 위 오른쪽 계정 버튼 + 설정의 계정 칸 (app.js accountPanel) ----------
  const login = () => A.signInWithPopup(auth, new A.GoogleAuthProvider()).catch(e => {
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') alert(`로그인하지 못했어요: ${e.code}`);
  });
  const logout = () => { flush(); A.signOut(auth); };
  window.cloud = { user: null, login, logout, lab: null }; // lab: 기기 사진을 이 랩에 넣고 읽을 때 (아래 photo, equip.js)
  // 기기 사진(앱 안에 저장): labs/{PI}/photos/{id} = { d: 줄인 JPEG base64 }. 기기 페이지를 볼 때만 한 장씩 읽음 (db·localStorage엔 안 넣음)
  const photoRef = id => { if (!lab) throw new Error('로그인해야 해요'); return F.doc(fs, 'labs', lab, 'photos', id); };
  window.cloud.photo = {
    put: async (id, d) => F.setDoc(photoRef(id), { d }),
    get: async id => (await F.getDoc(photoRef(id))).data()?.d,
    del: async id => F.deleteDoc(photoRef(id)),
  };
  const btn = $('accountBtn');
  btn.hidden = false;
  btn.onclick = () => (user ? $('settingsBtn').click() : login());
  function showAccount() {
    btn.textContent = user ? (user.displayName || user.email || '?').slice(0, 1) : '로그인';
    btn.className = user ? 'avatar' : 'btn';
    btn.title = user ? `${user.email}${mode === 'member' ? ` · ${db.member?.labName} 랩 멤버` : ''} · 자동 동기화` : 'Google 계정으로 로그인';
  }

  // ---------- 동기화 단위: 키 → JSON 글 ----------
  // a:칸 / d:서류 id / m (랩 메타) / p:프로토콜 id / e:기기 id / i:품목 id / o:주문 id / L (랩 문서의 멤버 목록)
  function units() {
    const out = new Map();
    if (mode === 'pi') {
      for (const k of Object.keys(db)) if (!NOT_ADMIN.has(k)) out.set(`a:${k}`, JSON.stringify(db[k]));
      for (const d of db.docs) out.set(`d:${d.id}`, JSON.stringify(d));
      out.set('L', JSON.stringify([...new Set((db.labMembers || []).map(e => e.toLowerCase()))].sort()));
    }
    out.set('m', JSON.stringify(Object.fromEntries(LAB_META.map(k => [k, db.stock[k]]))));
    for (const pr of db.stock.protocols) out.set(`p:${pr.id}`, JSON.stringify(pr));
    for (const e of db.stock.equips) out.set(`e:${e.id}`, JSON.stringify(e));
    for (const it of db.stock.items) out.set(`i:${it.id}`, JSON.stringify(it));
    for (const o of db.orders) out.set(`o:${o.id}`, JSON.stringify(o));
    return out;
  }
  function ref(key) {
    const id = key.slice(2);
    switch (key[0]) {
      case 'a': return F.doc(fs, 'users', user.uid, 'admin', id);
      case 'd': return F.doc(fs, 'users', user.uid, 'adminDocs', id);
      case 'm': return F.doc(fs, 'labs', lab, 'meta', 'stock');
      case 'p': return F.doc(fs, 'labs', lab, 'protocols', id);
      case 'e': return F.doc(fs, 'labs', lab, 'equips', id);
      case 'i': return F.doc(fs, 'labs', lab, 'items', id);
      case 'o': return F.doc(fs, 'labs', lab, 'orders', id);
      case 'L': return F.doc(fs, 'labs', lab);
    }
  }

  // ---------- 올리기: 마지막으로 맞춘 뒤 바뀐 것만 (저장할 때마다 조금 기다렸다가) ----------
  function flush() {
    clearTimeout(timer);
    if (!user || !ready) return;
    const now = units(), ops = [];
    for (const [k, j] of now) if (synced.get(k) !== j) { ops.push([k, j]); synced.set(k, j); }
    for (const k of [...synced.keys()]) if (!now.has(k)) { ops.push([k, null]); synced.delete(k); }
    for (let i = 0; i < ops.length; i += 400) { // 한 번에 최대 500개 제한
      const batch = F.writeBatch(fs);
      for (const [k, j] of ops.slice(i, i + 400)) {
        if (k === 'L') batch.set(ref(k), { owner: user.uid, ownerEmail: user.email, ownerName: db.profile?.name || user.displayName || '', members: JSON.parse(j) }, { merge: true });
        else if (j == null) batch.delete(ref(k));
        else batch.set(ref(k), { j });
      }
      batch.commit().catch(e => { console.error('동기화 실패', e); alert(`저장하지 못했어요 (${e.code}). 인터넷 연결을 확인해 주세요.`); });
    }
  }
  window.onSave = () => { clearTimeout(timer); timer = setTimeout(flush, 400); };
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  // ---------- 받기 ----------
  // 처음엔 서버 값을 따로(remote) 다 모은 뒤 한 번에 바꿈 — 기기에 있던 값(예시 데이터 등)을 서버에 섞어 올리지 않게
  let remote = null, loaded = {};
  const target = () => (ready ? db : remote);
  function upsert(list, rec) { // 화면(편집 창 등)이 같은 객체를 잡고 있을 수 있어서 바꿔 끼우지 않고 내용만 교체
    const old = list.find(x => x.id === rec.id);
    if (!old) { list.push(rec); return; }
    for (const k of Object.keys(old)) if (!(k in rec)) delete old[k];
    Object.assign(old, rec);
  }
  function apply(key, j) { // j == null 이면 지움
    const t = target(), id = key.slice(2), v = j == null ? null : JSON.parse(j);
    if (j == null) synced.delete(key); else synced.set(key, j);
    switch (key[0]) {
      case 'a': if (v != null) t[id] = v; break;
      case 'd': if (v) upsert(t.docs, v); else t.docs = t.docs.filter(x => x.id !== id); break;
      case 'm': if (v) Object.assign(t.stock, v); break;
      case 'p': if (v) upsert(t.stock.protocols, v); else t.stock.protocols = t.stock.protocols.filter(x => x.id !== id); break;
      case 'e': if (v) upsert(t.stock.equips, v); else t.stock.equips = t.stock.equips.filter(x => x.id !== id); break;
      case 'i': if (v) upsert(t.stock.items, v); else t.stock.items = t.stock.items.filter(x => x.id !== id); break;
      case 'o': if (v) upsert(t.orders, v); else t.orders = t.orders.filter(x => x.id !== id); break;
    }
  }
  function listen(name, q, keyOf) {
    // includeMetadataChanges: 기기 캐시에 이미 있는 값이 먼저 오고 서버 값이 같으면, 이게 없을 땐 '서버에서 받음'이 안 와서 whenLoaded가 영영 안 불림
    unsubs.push(F.onSnapshot(q, { includeMetadataChanges: true }, snap => {
      let changed = false;
      const changes = snap.docChanges ? snap.docChanges() : [{ type: snap.exists() ? 'modified' : 'removed', doc: snap }];
      for (const ch of changes) {
        if (ch.doc.metadata.hasPendingWrites) continue; // 내가 방금 올린 것
        const key = keyOf(ch.doc.id), j = ch.type === 'removed' ? null : ch.doc.data()?.j;
        if (j === undefined || synced.get(key) === j) continue;
        apply(key, j);
        changed = true;
      }
      if (!loaded[name] && !snap.metadata.fromCache) { loaded[name] = { any: snap.docs ? snap.docs.length > 0 : snap.exists() }; whenLoaded(); }
      if (changed && ready) { persistLocal(); render(); }
    }, e => console.error('동기화 실패', name, e)));
  }
  const persistLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 없음 */ } };

  function skeleton() { // 서버 값을 받아 채울 빈 틀 (예시 데이터 없이)
    return { version: VERSION, rates: structuredClone(db.rates), grants: [], people: [], pays: [], lines: [], info: { cats: [], notes: [] }, rows: [],
      docs: [], trips: [], profile: {}, buySeed: true, miscSeed: true, labMembers: [], orders: [],
      stock: { cats: [], places: [], vendors: { columns: [], rows: [] }, protoGroups: [], protocols: [], equipGroups: [], equips: [], tips: [], items: [] } };
  }
  function whenLoaded() {
    const names = mode === 'pi' ? ['admin', 'docs', 'meta', 'protocols', 'equips', 'items', 'orders'] : ['meta', 'protocols', 'equips', 'items', 'orders'];
    if (ready || !names.every(n => loaded[n])) return;
    const local = db;
    if (mode === 'pi' && !loaded.admin.any && !loaded.docs.any) {
      // 새 계정: 이 기기 데이터(예시 또는 로그인 전에 쓴 것)를 그대로 계정에 올림
      db = local;
      delete db.member;
      synced = new Map(); // 전부 새로 올림
    } else {
      db = withDocs(remote); // 새로 생긴 기본값(빈 칸)은 채워서 아래 flush가 올림
    }
    db.owner = user.uid;
    if (mode === 'member') db.member = { lab, labName: memberLab.ownerName || memberLab.ownerEmail || '' };
    remote = null;
    ready = true;
    persistLocal();
    render();
    flush();
  }

  // ---------- 로그인 / 로그아웃 ----------
  let memberLab = null;
  A.onAuthStateChanged(auth, async u => {
    unsubs.forEach(f => f());
    unsubs = []; synced = new Map(); ready = false; loaded = {}; remote = null; lab = null; mode = null; memberLab = null;
    user = u;
    window.cloud.user = u;
    window.currentUser = u ? { name: u.displayName || '', email: u.email } : null;
    if (!u) {
      // 로그아웃: 이 기기에 남은 계정 데이터는 지우고 예시로 (계정에는 그대로 있음)
      if (db.owner) { db = fresh(); persistLocal(); render(); }
      setPresetOwner(null);
      setPresets(structuredClone(BASE_PRESETS));
      window.cloud.lab = null;
      showAccount();
      return;
    }
    try {
      // 학생인지: 내 이메일이 멤버로 들어 있는 랩이 있고, 내 PI 데이터가 없으면 랩 멤버
      const email = (u.email || '').toLowerCase();
      const [labs, mine] = await Promise.all([
        F.getDocs(F.query(F.collection(fs, 'labs'), F.where('members', 'array-contains', email))),
        F.getDocs(F.query(F.collection(fs, 'users', u.uid, 'admin'), F.limit(1))),
      ]);
      const other = labs.docs.find(d => d.id !== u.uid);
      if (other && mine.empty) { mode = 'member'; lab = other.id; memberLab = other.data(); }
      else { mode = 'pi'; lab = u.uid; }
    } catch (e) {
      console.error('계정 확인 실패', e);
      mode = 'pi'; lab = u.uid;
    }
    window.cloud.lab = lab;
    showAccount();
    remote = skeleton();
    if (mode === 'pi') {
      listen('admin', F.collection(fs, 'users', u.uid, 'admin'), id => `a:${id}`);
      listen('docs', F.collection(fs, 'users', u.uid, 'adminDocs'), id => `d:${id}`);
    }
    listen('meta', F.doc(fs, 'labs', lab, 'meta', 'stock'), () => 'm');
    listen('protocols', F.collection(fs, 'labs', lab, 'protocols'), id => `p:${id}`);
    listen('equips', F.collection(fs, 'labs', lab, 'equips'), id => `e:${id}`);
    listen('items', F.collection(fs, 'labs', lab, 'items'), id => `i:${id}`);
    listen('orders', F.collection(fs, 'labs', lab, 'orders'), id => `o:${id}`);
    // 계산기 버퍼 프리셋: calcPresets/{PI uid} = { j: 목록 JSON } — 랩 멤버도 같이 봄, 고치기는 PI만 (calc.js · firestore.rules)
    // 서버에서 한 번 받은 뒤에만 PI가 고칠 수 있게 (기기 캐시만 보고 기본 프리셋으로 덮어쓰지 않게)
    const presetRef = F.doc(fs, 'calcPresets', lab), pi = mode === 'pi';
    const savePresets = list => F.setDoc(presetRef, { j: JSON.stringify(list) })
      .catch(e => { console.error('프리셋 저장 실패', e); alert(`프리셋을 저장하지 못했어요 (${e.code}). 인터넷 연결을 확인해 주세요.`); });
    unsubs.push(F.onSnapshot(presetRef, { includeMetadataChanges: true }, snap => {
      setPresets(snap.exists() ? JSON.parse(snap.data().j) : structuredClone(BASE_PRESETS)); // 아직 없으면(PI가 고친 적 없음) 기본 프리셋
      if (pi && !snap.metadata.fromCache) setPresetOwner(savePresets);
    }, e => {
      console.error('프리셋을 불러오지 못했어요', e);
      if (pi) presetError('버퍼 프리셋을 불러오지 못해서 지금은 고칠 수 없어요. 인터넷 연결과 Firestore 규칙(calcPresets)을 확인해 주세요.');
    }));
  });
}
