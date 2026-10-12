'use strict';
// ---------- 서류 자동 채우기 (Claude API) ----------
// 서류 화면의 '✨ 자동 채우기' → 메모·붙여 넣은 글·첨부(PDF·사진)를 Claude에게 보내 지금 비어 있는 칸만 채움 (쓴 칸은 그대로)
// API 키는 각자 자기 Anthropic 키를 설정에서 넣음. db.aiKey (내 계정 데이터 users/{uid}/admin/aiKey — 본인만 읽음) → 로그인한 PC·폰에서 같이 씀
// 내보내기 JSON엔 안 넣음 (app.js exportData). 지울 땐 ''로 둠 — 칸을 없애면 다른 기기에 지운 게 안 넘어감 (sync.js apply)
// 요청은 브라우저에서 api.anthropic.com 으로 바로 감 (SDK의 dangerouslyAllowBrowser — 키는 본인 계정·기기에만 있으니 괜찮음)
const AI_MODEL = 'claude-opus-5-5';
const AI_SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.127.0/+esm'; // 처음 누를 때만 불러옴
const OLD_AI_KEY = 'lab-manager-ai-key'; // 예전엔 이 브라우저에만 저장 → 계정 데이터에 키가 없으면 옮김. 옛 칸은 키를 고치면 지움
function aiKey() {
  if (db.aiKey == null) { try { const k = localStorage.getItem(OLD_AI_KEY); if (k) { db.aiKey = k; persist(); } } catch { /* 없음 */ } }
  return db.aiKey || '';
}
const setAiKey = k => { db.aiKey = k; try { localStorage.removeItem(OLD_AI_KEY); } catch { /* 없음 */ } persist(); };
let aiBusy = null; // 채우는 중인 문서 id (버튼을 '채우는 중…'으로)

// 설정의 'AI 자동 채우기' 칸: 키를 넣으면 바로 저장 (설정 창의 확인과 상관없이)
function aiKeyBox() {
  const box = h('div');
  const inp = h('input', 'member-input');
  inp.type = 'password';
  inp.autocomplete = 'off';
  inp.spellcheck = false;
  inp.placeholder = 'sk-ant-…';
  inp.value = aiKey();
  const sync = () => { const s = box.closest('details')?.querySelector('summary .hint'); if (s) s.textContent = aiKey() ? 'API 키 있음' : 'API 키 없음'; };
  inp.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); inp.blur(); } }; // 설정 창이 닫히지 않게
  inp.oninput = () => { setAiKey(inp.value.trim()); sync(); };
  const clear = h('button', 'link-btn', '지우기');
  clear.type = 'button';
  clear.onclick = () => { inp.value = ''; setAiKey(''); sync(); };
  box.append(h('div', 'member', inp, clear),
    h('p', 'hint', `서류 화면의 ✨ 자동 채우기에 써요 (Claude · ${AI_MODEL}). 키는 console.anthropic.com → API Keys에서 만들고, 쓴 만큼 그 계정에 요금이 나가요.`),
    h('p', 'hint', '키는 내 계정 데이터에 저장돼서 로그인한 PC·폰에서 같이 써요 (나만 읽을 수 있고, 랩 멤버는 못 봐요). 내보내기 JSON엔 안 들어가요. 로그인 전엔 이 브라우저에만 있어요.'));
  return box;
}

// 지금 화면의 양식에서 비어 있는 칸 (자동 계산 칸은 빼고, 같은 이름이 여러 쪽에 있으면 한 번만)
function aiEmptyFields() {
  const out = new Map();
  for (const el of document.querySelectorAll('#docMain .paper [data-f]')) {
    const k = el.dataset.f;
    if (out.has(k) || el.dataset.auto) continue;
    const choice = el.classList.contains('choice');
    const shown = choice ? (el.querySelector('.opt.on') ? 'x' : '') : el.tagName === 'INPUT' ? el.value : el.innerText;
    if (shown.trim()) continue;
    out.set(k, { el, ph: el.dataset.ph || '', options: choice ? el.dataset.options.split('|') : null, multi: el.hasAttribute('data-multi') });
  }
  return out;
}

function aiFill(f, d) {
  if (!aiKey()) {
    if (confirm('자동 채우기는 각자의 Claude API 키로 써요.\n설정 → AI 자동 채우기에 키를 먼저 넣을까요?')) $('settingsBtn').click();
    return;
  }
  const empty = aiEmptyFields();
  if (!empty.size) return alert('비어 있는 칸이 없어요. 다시 채우려면 칸을 비운 뒤 눌러요.');
  const files = h('input');
  files.type = 'file';
  files.multiple = true;
  files.accept = 'application/pdf,image/*';
  ask(`✨ 자동 채우기 — ${f.title}`, [
    { key: 'note', label: '자료 (메모 · 메일·안내문을 붙여 넣기)', type: 'textarea', rows: 7, placeholder: '예: 5/15 10시 세미나실 랩미팅, 참석 홍길동·박박사·김석사, scRNA 1차 분석 결과 공유, 다음 달 시료 8개 시퀀싱 의뢰' },
  ], v => {
    const note = v.note.trim(), list = [...files.files];
    if (!note && !list.length) return alert('메모를 쓰거나 파일을 붙여야 채울 수 있어요.');
    runAiFill(f, d, empty, note, list);
  }, [h('label', 'field', '첨부 (PDF · 사진, 여러 개 가능)', files),
    h('p', 'hint', `빈 칸 ${empty.size}개만 채우고 쓴 칸은 그대로 둬요. 자료에 없는 내용은 비워 둬요. 채운 뒤 꼭 확인해요.`),
    h('p', 'hint', '환자 정보·미발표 데이터처럼 밖으로 보내면 안 되는 내용은 넣지 않아요.')]);
}

// 첨부 → Claude 내용 블록. 사진은 긴 변 2000px JPEG로 줄임 (폰 사진·HEIC도 브라우저가 열 수 있으면 됨)
const asBase64 = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
async function aiBlock(file) {
  if (file.type === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await asBase64(file) }, title: file.name };
  const img = new Image(), url = URL.createObjectURL(file);
  try {
    await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error(`'${file.name}'을(를) 열지 못했어요`)); img.src = url; });
  } finally { URL.revokeObjectURL(url); }
  const k = Math.min(1, 2000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.9).split(',')[1] } };
}

const AI_SYSTEM = `너는 한국 대학교 교수(연구책임자)의 행정 서류 작성을 돕는다. 사용자가 준 자료(메모·붙여 넣은 글·첨부 PDF·사진)를 보고 양식의 빈 칸에 들어갈 값을 정한다.
- 자료에서 확인되는 내용만 쓴다. 자료에 없는 사실(숫자·날짜·이름·금액·모델명 등)은 지어내지 말고, 그런 칸은 답에서 뺀다.
- 목적·내용·분석·본문 같은 서술 칸은 자료를 바탕으로 양식에 맞게 다듬어 써도 된다. 칸의 안내 글(예: "1) …", "- 구체적으로 5줄 이상")이 있으면 그 형식을 따른다.
- 한국어 칸은 공문서 문체(개조식, "…함", "…임")로, 영문 레터 칸은 영어로 쓴다.
- 여러 줄은 줄바꿈(\\n)으로 나눈다.
- 고르기 칸은 보기 가운데 하나를 그대로 쓴다. 여러 개 고르는 칸은 보기를 |로 잇는다.
- fields 의 name 은 '채울 칸' 목록의 이름을 그대로 쓴다.`;
const AI_SCHEMA = { // 칸 이름은 문서마다 달라서 enum 대신 받은 뒤 걸러냄 (스키마가 같아야 컴파일 캐시를 씀)
  type: 'object', additionalProperties: false, required: ['fields'],
  properties: { fields: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'value'], properties: { name: { type: 'string' }, value: { type: 'string' } } } } },
};

async function runAiFill(f, d, empty, note, files) {
  if (files.reduce((a, x) => a + x.size, 0) > 24 * 2 ** 20) return alert('첨부가 너무 커요 (모두 합쳐 24MB까지).');
  aiBusy = d.id;
  render();
  try {
    const ctl = [...document.querySelectorAll('#docMain .paper :is(.row-x, .f-ctl, .f-counter)')]; // 줄 빼기 ×·줄 추가·글자 수는 양식 글이 아니라서 잠깐 숨기고 읽음
    for (const el of ctl) el.style.display = 'none';
    const formText = [...document.querySelectorAll('#docMain .paper')].map(p => p.innerText).join('\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').slice(0, 20000);
    for (const el of ctl) el.style.display = '';
    const want = [...empty].map(([k, x]) => `- "${k}"${x.ph ? ` (안내: ${x.ph.replace(/\n/g, ' / ')})` : ''}${x.options ? ` (고르기: ${x.options.join(' | ')}${x.multi ? ', 여러 개 가능' : ''})` : ''}`).join('\n');
    const prompt = `서류: ${f.title}${f.src ? ` (원본: ${f.src})` : ''}\n오늘: ${isoToday()} · 문서 연도: ${d.year ?? ''}\n\n[지금 양식에 보이는 글]\n${formText}\n\n[채울 칸 — 지금 비어 있음]\n${want}\n\n[자료]\n${note || '(첨부 파일을 봐요)'}`;
    const blocks = await Promise.all(files.map(aiBlock));
    const { default: Anthropic } = await import(AI_SDK);
    const client = new Anthropic({ apiKey: aiKey(), dangerouslyAllowBrowser: true });
    let res;
    try {
      res = await client.beta.messages.create({
        model: AI_MODEL, max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', // 안전 분류기가 거절하면 서버가 다른 모델로 다시 돌림
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: AI_SCHEMA } },
        system: AI_SYSTEM,
        messages: [{ role: 'user', content: [...blocks, { type: 'text', text: prompt }] }],
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new Error('API 키가 맞지 않아요. 설정 → AI 자동 채우기에서 키를 확인해요.');
      if (e instanceof Anthropic.PermissionDeniedError) throw new Error('이 API 키로는 쓸 수 없어요 (권한 없음).');
      if (e instanceof Anthropic.RateLimitError) throw new Error('요청이 많아요. 잠시 뒤에 다시 눌러요.');
      if (e instanceof Anthropic.APIConnectionError) throw new Error('Claude 서버에 닿지 못했어요. 인터넷 연결을 확인해요.');
      if (e instanceof Anthropic.APIError) throw new Error(`Claude가 답하지 못했어요 (${e.status ?? '?'}): ${e.error?.error?.message || e.message}`); // 400 크레딧 부족 등
      throw e;
    }
    if (res.stop_reason === 'refusal') throw new Error('Claude가 이 요청을 거절했어요. 자료를 바꿔서 다시 해 봐요.');
    if (res.stop_reason === 'max_tokens') throw new Error('답이 너무 길어 중간에 끊겼어요. 자료를 줄여서 다시 해 봐요.');
    const out = JSON.parse(res.content.find(b => b.type === 'text')?.text || '{}').fields || [];
    // 기다리는 동안 직접 쓴 칸은 건드리지 않음. 고르기 칸은 보기에 있는 값만
    const trip = tripOf(d);
    let n = 0;
    for (const { name, value } of out) {
      const x = empty.get(name), shared = x?.el.hasAttribute('data-trip') && trip;
      let v = String(value ?? '').trim();
      if (!x || !v || String((shared ? trip.fields[name] : d.fields[name]) ?? '').trim()) continue;
      if (x.options) {
        const picked = v.split('|').map(s => s.trim()).filter(o => x.options.includes(o));
        if (!picked.length) continue;
        v = (x.multi ? picked : picked.slice(0, 1)).join('|');
      }
      if (shared) trip.fields[name] = v; else d.fields[name] = v;
      n++;
    }
    if (!n) throw new Error('자료에서 채울 내용을 찾지 못했어요.');
    d.updatedAt = new Date().toISOString();
    aiBusy = null;
    save();
    const st = $('docStatus');
    if (st && selDoc === d.id) st.textContent = `✨ ${n}칸 채웠어요 — 내용을 꼭 확인해요`;
  } catch (e) {
    aiBusy = null;
    render();
    alert(`자동 채우기를 못 했어요: ${e.message}`);
  }
}
