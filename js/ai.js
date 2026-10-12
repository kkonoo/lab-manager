'use strict';
// ---------- 서류 자동 채우기 (Claude API) ----------
// 서류 화면의 '✨ 자동 채우기' → 메모·붙여 넣은 글·첨부(PDF·사진)를 Claude에게 보내 빈 칸을 채우고, 메모가 바꾸라고 한 칸은 고침 (↶ 되돌리기)
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
let aiUndo = null; // 마지막 자동 채우기 전 값 { doc, prev: [[칸 이름, 문서 값, 출장 값]] } — ↶ 되돌리기 (새로고침하면 없어짐)

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

// 지금 화면의 양식 칸과 보이는 값 (자동 계산 칸은 빼고, 같은 이름이 여러 쪽에 있으면 한 번만)
// before = 보낼 때 저장돼 있던 값 → 답이 오기 전에 직접 고친 칸은 건드리지 않으려고
function aiFormFields(d) {
  const out = new Map(), trip = tripOf(d);
  for (const el of document.querySelectorAll('#docMain .paper [data-f]')) {
    const k = el.dataset.f;
    if (out.has(k) || el.dataset.auto) continue;
    const options = el.classList.contains('choice') ? el.dataset.options.split('|') : null;
    const shown = options ? [...el.querySelectorAll('.opt')].flatMap((o, i) => (o.classList.contains('on') ? [options[i]] : [])).join('|')
      : el.tagName === 'INPUT' ? el.value : el.innerText;
    out.set(k, { shown: shown.trim(), ph: el.dataset.ph || '', options, multi: el.hasAttribute('data-multi'),
      shared: el.hasAttribute('data-trip') && !!trip, before: JSON.stringify([d.fields[k], trip?.fields[k]]) });
  }
  return out;
}

function aiFill(f, d) {
  if (!aiKey()) {
    if (confirm('자동 채우기는 각자의 Claude API 키로 써요.\n설정 → AI 자동 채우기에 키를 먼저 넣을까요?')) $('settingsBtn').click();
    return;
  }
  const fields = aiFormFields(d), empty = [...fields.values()].filter(x => !x.shown).length;
  const files = h('input');
  files.type = 'file';
  files.multiple = true;
  files.accept = 'application/pdf,image/*';
  ask(`✨ 자동 채우기 — ${f.title}`, [
    { key: 'note', label: '자료 (메모 · 메일·안내문을 붙여 넣기 · 고칠 것)', type: 'textarea', rows: 7, placeholder: '예: 5/15 10시 세미나실 랩미팅, 참석 홍길동·박박사, scRNA 1차 분석 결과 공유\n예: 의학연구 기법 및 기기 50명으로 바뀜' },
  ], v => {
    const note = v.note.trim(), list = [...files.files];
    if (!note && !list.length) return alert('메모를 쓰거나 파일을 붙여야 채울 수 있어요.');
    runAiFill(f, d, fields, note, list);
  }, [h('label', 'field', '첨부 (PDF · 사진, 여러 개 가능)', files),
    h('p', 'hint', `빈 칸${empty ? ` ${empty}개` : ''}를 채우고, 메모에서 바꾸라고 한 칸은 그 부분만 고쳐요. 자료에 없는 숫자·날짜·이름은 지어내지 않아요. 바뀐 칸은 ↶ 되돌리기로 돌릴 수 있어요.`),
    h('p', 'hint', '환자 정보·미발표 데이터처럼 밖으로 보내면 안 되는 내용은 넣지 않아요.')]);
}
// 방금 자동 채우기로 바뀐 칸을 그 전 값으로 (서류 도구 줄, docs.js)
function aiUndoBtn(d) {
  if (aiUndo?.doc !== d.id) return null;
  const b = h('button', 'btn small', '↶ 되돌리기');
  b.title = '방금 자동 채우기로 채우거나 고친 칸을 그 전으로';
  b.onclick = () => {
    const trip = tripOf(d), put = (o, k, v) => { if (v === undefined) delete o[k]; else o[k] = v; };
    for (const [k, dv, tv] of aiUndo.prev) { put(d.fields, k, dv); if (trip) put(trip.fields, k, tv); }
    aiUndo = null;
    d.updatedAt = new Date().toISOString();
    save();
  };
  return b;
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

const AI_SYSTEM = `너는 한국 대학교 교수(연구책임자)의 행정 서류 작성을 돕는다. 사용자가 준 자료(메모·붙여 넣은 글·첨부 PDF·사진)를 보고 양식 칸에 넣을 값을 정한다.
- 빈 칸은 자료로 채운다.
- 이미 적힌 칸은 자료가 바꾸라고 하거나 자료와 다를 때만 고친다 (예: "○○ 과목 50명 됨" → 그 과목 줄의 인원만 50명으로). 고칠 땐 칸 전체의 새 값을 쓰되, 바뀌는 부분 말고는 한 글자도 바꾸지 않는다.
- 바꿀 것 없는 칸은 fields 에 넣지 않는다.
- 자료가 "○○ 칸 써 줘"처럼 부탁이면 그 부탁을 따른다.
- 숫자·날짜·이름·금액·모델명 같은 사실은 자료나 양식에 이미 적힌 것만 쓴다. 지어내지 않는다.
- 목적·내용·분석·본문 같은 서술 칸이 비어 있으면 자료와 양식에 이미 적힌 내용을 바탕으로 초안을 써 넣는다. 칸의 안내 글(예: "1) …", "- 구체적으로 5줄 이상", 300자 이상)이 있으면 그 형식·분량을 따른다.
- 새로 쓰는 한국어는 공문서 문체(개조식, "…함", "…임")로, 영문 레터 칸은 영어로 쓴다.
- 여러 줄은 줄바꿈(\\n)으로 나눈다.
- 고르기 칸은 보기 가운데 하나를 그대로 쓴다. 여러 개 고르는 칸은 보기를 |로 잇는다.
- fields 의 name 은 '양식 칸' 목록의 이름을 따옴표 없이 그대로 쓴다.
- note 에는 못 채운 칸과 그 까닭, 사용자가 확인할 점을 한두 문장으로 쓴다 (없으면 빈 글).`;
const AI_SCHEMA = { // 칸 이름은 문서마다 달라서 enum 대신 받은 뒤 걸러냄 (스키마가 같아야 컴파일 캐시를 씀)
  type: 'object', additionalProperties: false, required: ['fields', 'note'],
  properties: {
    fields: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'value'], properties: { name: { type: 'string' }, value: { type: 'string' } } } },
    note: { type: 'string' },
  },
};

async function runAiFill(f, d, fields, note, files) {
  if (files.reduce((a, x) => a + x.size, 0) > 24 * 2 ** 20) return alert('첨부가 너무 커요 (모두 합쳐 24MB까지).');
  aiBusy = d.id;
  render();
  try {
    const ctl = [...document.querySelectorAll('#docMain .paper :is(.row-x, .f-ctl, .f-counter)')]; // 줄 빼기 ×·줄 추가·글자 수는 양식 글이 아니라서 잠깐 숨기고 읽음
    for (const el of ctl) el.style.display = 'none';
    const formText = [...document.querySelectorAll('#docMain .paper')].map(p => p.innerText).join('\n').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').slice(0, 20000);
    for (const el of ctl) el.style.display = '';
    const list = [...fields].map(([k, x]) => `- "${k}"${x.ph ? ` (안내: ${x.ph.replace(/\n/g, ' / ')})` : ''}${x.options ? ` (고르기: ${x.options.join(' | ')}${x.multi ? ', 여러 개 가능' : ''})` : ''}: ${x.shown ? JSON.stringify(x.shown) : '(비어 있음)'}`).join('\n');
    const prompt = `서류: ${f.title}${f.src ? ` (원본: ${f.src})` : ''}\n오늘: ${isoToday()} · 문서 연도: ${d.year ?? ''}\n\n[지금 양식에 보이는 글]\n${formText}\n\n[양식 칸 — 이름: 지금 값]\n${list}\n\n[자료]\n${note || '(첨부 파일을 봐요)'}`;
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
    // 다른 모델로 넘어갔으면(fallback) 앞 모델의 글이 남을 수 있어서 마지막 글 블록
    const { fields: out = [], note: why = '' } = JSON.parse(res.content.filter(b => b.type === 'text').at(-1)?.text || '{}');
    // 그대로인 값·답이 오기 전에 직접 고친 칸은 건너뜀. 고르기 칸은 보기에 있는 값만
    const trip = tripOf(d), unknown = [], prev = [];
    let filled = 0, fixed = 0;
    for (const { name: raw, value } of out) {
      const name = String(raw ?? '').trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim(); // 목록에 "이름"으로 보여 줘서 따옴표째 답할 때
      const x = fields.get(name);
      if (!x) { unknown.push(name); continue; }
      let v = String(value ?? '').trim();
      if (x.options) v = v.split('|').map(o => o.trim()).filter(o => x.options.includes(o)).slice(0, x.multi ? undefined : 1).join('|');
      if (!v || v === x.shown || JSON.stringify([d.fields[name], trip?.fields[name]]) !== x.before) continue;
      prev.push([name, d.fields[name], trip?.fields[name]]);
      if (x.shared && trip) { trip.fields[name] = v; delete d.fields[name]; } else d.fields[name] = v; // 출장 정보 칸은 출장에 (docs.js fillPaper write와 같이)
      if (x.shown) fixed++; else filled++;
    }
    if (unknown.length) console.warn('자동 채우기: 양식에 없는 칸 이름', unknown);
    if (!prev.length) throw new Error([unknown.length ? `Claude가 답한 칸 이름이 양식과 안 맞았어요 (${unknown.slice(0, 5).join(', ')})` : '자료에서 채우거나 고칠 내용을 찾지 못했어요.', why.trim()].filter(Boolean).join('\n\n'));
    aiUndo = { doc: d.id, prev };
    d.updatedAt = new Date().toISOString();
    aiBusy = null;
    save();
    const st = $('docStatus');
    if (st && selDoc === d.id) { st.textContent = `✨ ${[filled && `${filled}칸 채움`, fixed && `${fixed}칸 고침`].filter(Boolean).join(' · ')} — 내용을 꼭 확인해요`; st.title = why.trim(); } // 못 채운 칸 설명은 마우스를 올리면
  } catch (e) {
    aiBusy = null;
    render();
    alert(`자동 채우기를 못 했어요: ${e.message}`);
  }
}
