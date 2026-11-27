/**
 * FAIRY: the phone page. One self-contained HTML file that works as an app: the chat with the character that runs on
 * the PC, the list of her chats, her character card, and controls for her modes. The PC serves it on the Tailscale
 * network only (see ./index.ts). The Android app in `apps/fairy-phone` shows the same page.
 *
 * The pairing key comes in the first link (`?key=...`) and stays in the phone's localStorage.
 */
export const PHONE_PAGE_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="theme-color" content="#120f1b">
<meta name="mobile-web-app-capable" content="yes">
<link rel="manifest" href="./manifest.webmanifest">
<title>AIRI</title>
<style>
  :root {
    color-scheme: dark;
    --bg:#120f1b; --bg2:#1a1626; --card:#211c31; --card2:#2a2440; --line:rgba(255,255,255,.07);
    --text:#f1ecff; --muted:#9d94bb; --accent:#8b6cf6; --accent2:#e47ad0; --good:#5fd3a6; --bad:#ff7a90;
    --grad:linear-gradient(135deg, var(--accent), var(--accent2));
  }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html, body { margin:0; height:100%; background:var(--bg); color:var(--text); font:16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { display:flex; flex-direction:column; overflow:hidden; }
  button { font:inherit; color:inherit; background:none; border:0; cursor:pointer; }
  textarea, input { font:inherit; color:inherit; }
  .view { display:none; flex:1; flex-direction:column; min-height:0; }
  body[data-view="chat"] #chat, body[data-view="chats"] #chats, body[data-view="character"] #character,
  body[data-view="controls"] #controls, body[data-view="pair"] #pair { display:flex; }
  body[data-view="chat"] nav, body[data-view="pair"] nav { display:none; }

  /* Top bars */
  .bar { display:flex; align-items:center; gap:12px; padding:12px 16px; padding-top:calc(12px + env(safe-area-inset-top)); background:linear-gradient(180deg, var(--bg2), rgba(26,22,38,.85)); border-bottom:1px solid var(--line); backdrop-filter:blur(12px); }
  .bar h1 { margin:0; font-size:24px; font-weight:750; letter-spacing:-.02em; flex:1; }
  .icon-btn { width:40px; height:40px; border-radius:50%; display:grid; place-items:center; font-size:19px; background:var(--card); transition:transform .12s, background .2s; }
  .icon-btn:active { transform:scale(.92); }
  .icon-btn.plain { background:none; font-size:26px; width:32px; }
  .avatar { width:42px; height:42px; border-radius:50%; background:var(--grad); display:grid; place-items:center; font-weight:750; font-size:18px; color:#fff; flex:none; box-shadow:0 4px 18px rgba(139,108,246,.35); }
  .avatar.big { width:96px; height:96px; font-size:40px; margin:8px auto 10px; }
  .who { flex:1; min-width:0; }
  .who b { display:block; font-size:17px; }
  .who small { color:var(--muted); font-size:13px; display:flex; align-items:center; gap:6px; }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--muted); }
  .dot.on { background:var(--good); box-shadow:0 0 8px var(--good); }

  /* Chat */
  #log { flex:1; overflow-y:auto; padding:16px 12px 8px; display:flex; flex-direction:column; gap:6px; scroll-behavior:smooth; }
  .msg { max-width:82%; padding:9px 14px; border-radius:20px; white-space:pre-wrap; word-wrap:break-word; animation:pop .18s ease-out; }
  .me { align-self:flex-end; background:var(--grad); color:#fff; border-bottom-right-radius:6px; }
  .her { align-self:flex-start; background:var(--card2); border-bottom-left-radius:6px; }
  .msg img { display:block; max-width:100%; border-radius:14px; margin:2px 0 6px; }
  .note { align-self:center; color:var(--muted); font-size:13px; text-align:center; padding:4px 10px; }
  .note a { color:#cbb8ff; display:block; margin:6px 0; }
  .typing { align-self:flex-start; background:var(--card2); border-radius:20px; border-bottom-left-radius:6px; padding:12px 16px; display:none; gap:5px; }
  .typing.on { display:flex; }
  .typing i { width:7px; height:7px; border-radius:50%; background:var(--muted); animation:blink 1.2s infinite; }
  .typing i:nth-child(2) { animation-delay:.2s } .typing i:nth-child(3) { animation-delay:.4s }
  @keyframes blink { 0%, 60%, 100% { opacity:.25; transform:translateY(0) } 30% { opacity:1; transform:translateY(-3px) } }
  @keyframes pop { from { opacity:0; transform:translateY(6px) scale(.98) } to { opacity:1; transform:none } }
  #preview { display:none; padding:8px 14px 0; }
  #preview img { height:70px; border-radius:12px; vertical-align:middle; }
  #preview button { margin-left:8px; }
  .composer { display:flex; gap:8px; padding:10px 10px; padding-bottom:calc(10px + env(safe-area-inset-bottom)); align-items:flex-end; background:var(--bg2); border-top:1px solid var(--line); }
  .composer textarea { flex:1; resize:none; max-height:130px; border:1px solid var(--line); border-radius:22px; padding:10px 16px; background:var(--card); outline:none; }
  .composer textarea:focus { border-color:rgba(139,108,246,.6); }
  .round { width:44px; height:44px; border-radius:50%; flex:none; display:grid; place-items:center; font-size:19px; background:var(--card); transition:transform .12s; }
  .round:active { transform:scale(.9); }
  .round.primary { background:var(--grad); box-shadow:0 4px 16px rgba(139,108,246,.4); }
  .round:disabled { opacity:.4; }
  #send { display:none; }
  .composer.typed #send { display:grid; } .composer.typed #mic { display:none; }
  #mic { touch-action:none; user-select:none; -webkit-user-select:none; }
  #mic.on { background:var(--bad); animation:pulse 1s infinite; }
  @keyframes pulse { 0% { box-shadow:0 0 0 0 rgba(255,122,144,.6) } 100% { box-shadow:0 0 0 16px rgba(255,122,144,0) } }
  input[type=file] { display:none; }

  /* Lists and cards */
  .scroll { flex:1; overflow-y:auto; padding:14px 14px 24px; }
  .row { width:100%; display:flex; gap:12px; align-items:center; padding:12px; border-radius:18px; text-align:left; transition:background .15s; }
  .row:active { background:var(--card); }
  .row.active { background:var(--card); }
  .row-main { flex:1; min-width:0; }
  .row-top { display:flex; justify-content:space-between; gap:8px; }
  .row-top b { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .row-top time { color:var(--muted); font-size:12px; flex:none; }
  .preview { color:var(--muted); font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .empty { color:var(--muted); text-align:center; margin-top:40px; }
  .section { margin:18px 4px 8px; color:var(--muted); font-size:13px; font-weight:650; text-transform:uppercase; letter-spacing:.06em; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:20px; overflow:hidden; }
  .setting { display:flex; align-items:center; gap:14px; padding:14px 16px; border-bottom:1px solid var(--line); width:100%; text-align:left; }
  .setting:last-child { border-bottom:0; }
  .setting .emoji { width:38px; height:38px; border-radius:12px; background:var(--card2); display:grid; place-items:center; font-size:19px; flex:none; }
  .setting .label { flex:1; min-width:0; }
  .setting .label b { display:block; font-weight:600; }
  .setting .label small { color:var(--muted); font-size:13px; }
  .switch { position:relative; width:50px; height:30px; flex:none; }
  .switch input { opacity:0; width:0; height:0; position:absolute; }
  .switch span { position:absolute; inset:0; border-radius:30px; background:#3a3352; transition:background .2s; }
  .switch span::after { content:''; position:absolute; left:3px; top:3px; width:24px; height:24px; border-radius:50%; background:#fff; transition:transform .2s; box-shadow:0 2px 6px rgba(0,0,0,.3); }
  .switch input:checked + span { background:var(--grad); }
  .switch input:checked + span::after { transform:translateX(20px); }
  .switch input:disabled + span { opacity:.4; }
  .hero { text-align:center; padding:6px 0 4px; }
  .hero h2 { margin:0; font-size:24px; }
  .hero p { margin:4px 0 0; color:var(--muted); font-size:14px; }
  .chips { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin:14px 0 4px; }
  .chip { padding:7px 14px; border-radius:20px; background:var(--card); border:1px solid var(--line); font-size:14px; }
  .chip.on { background:var(--grad); border-color:transparent; }
  .field { padding:14px 16px; border-bottom:1px solid var(--line); }
  .field:last-child { border-bottom:0; }
  .field b { display:block; margin-bottom:2px; }
  .field small { color:var(--muted); font-size:13px; display:block; margin-bottom:8px; }
  .field textarea { width:100%; min-height:110px; resize:vertical; border:1px solid var(--line); border-radius:14px; padding:10px 12px; background:var(--bg2); outline:none; font-size:15px; }
  .field textarea:focus { border-color:rgba(139,108,246,.6); }
  .save { position:sticky; bottom:0; margin-top:14px; width:100%; padding:14px; border-radius:18px; background:var(--grad); font-weight:700; box-shadow:0 6px 24px rgba(139,108,246,.4); }
  .save:disabled { opacity:.45; box-shadow:none; }

  /* Tab bar */
  nav { display:flex; background:var(--bg2); border-top:1px solid var(--line); padding-bottom:env(safe-area-inset-bottom); }
  .tab { flex:1; padding:9px 0 10px; display:flex; flex-direction:column; align-items:center; gap:2px; font-size:12px; color:var(--muted); transition:color .2s; }
  .tab span { font-size:22px; filter:grayscale(1); opacity:.6; transition:all .2s; }
  .tab.on { color:var(--text); }
  .tab.on span { filter:none; opacity:1; transform:translateY(-1px); }

  /* Toast */
  #toast { position:fixed; left:50%; bottom:calc(90px + env(safe-area-inset-bottom)); transform:translateX(-50%) translateY(20px); background:var(--card2); border:1px solid var(--line); padding:10px 18px; border-radius:20px; font-size:14px; opacity:0; pointer-events:none; transition:all .25s; box-shadow:0 8px 30px rgba(0,0,0,.4); max-width:90%; text-align:center; }
  #toast.on { opacity:1; transform:translateX(-50%); }

  /* Pairing */
  #pair { align-items:center; justify-content:center; text-align:center; padding:32px; gap:12px; }
  #pair .avatar { width:84px; height:84px; font-size:38px; }
  #pair p { color:var(--muted); max-width:320px; }
</style>
</head>
<body data-view="chat">

<section class="view" id="chat">
  <header class="bar">
    <button class="icon-btn plain" id="back" aria-label="Chats">‹</button>
    <div class="avatar letter">A</div>
    <div class="who"><b class="name">AIRI</b><small><i class="dot" id="dot"></i><span id="status">connecting…</span></small></div>
    <button class="icon-btn" id="voice" aria-label="Spoken replies">🔊</button>
  </header>
  <div id="log"><div class="typing" id="typing"><i></i><i></i><i></i></div></div>
  <div id="preview"><img id="previewImg" alt=""><button class="icon-btn" type="button" id="clearImg" aria-label="Remove photo">✕</button></div>
  <form class="composer" id="form">
    <button type="button" class="round" id="cam" aria-label="Take a photo">📷</button>
    <button type="button" class="round" id="gal" aria-label="Pick a photo">🖼️</button>
    <textarea id="text" rows="1" placeholder="Message…"></textarea>
    <button type="button" class="round primary" id="mic" aria-label="Hold to talk">🎤</button>
    <button class="round primary" id="send" aria-label="Send">➤</button>
    <input id="camInput" type="file" accept="image/*" capture="environment">
    <input id="galInput" type="file" accept="image/*">
  </form>
</section>

<section class="view" id="chats">
  <header class="bar"><h1>Chats</h1><button class="icon-btn" id="newChat" aria-label="New chat">＋</button></header>
  <div class="scroll" id="chatList"></div>
</section>

<section class="view" id="character">
  <header class="bar"><h1>Character</h1></header>
  <div class="scroll">
    <div class="hero"><div class="avatar big letter">A</div><h2 class="name">AIRI</h2><p>Her personality, in her card</p></div>
    <div class="chips" id="people"></div>
    <div class="section">Personality</div>
    <div class="card">
      <div class="field"><b>Description</b><small>Who she is: looks, background, what she does.</small><textarea id="fDescription"></textarea></div>
      <div class="field"><b>Personality</b><small>How she acts and talks: her traits, humor, and opinions.</small><textarea id="fPersonality"></textarea></div>
      <div class="field"><b>Scenario</b><small>The situation: where she lives and how she knows you.</small><textarea id="fScenario"></textarea></div>
    </div>
    <button class="save" id="saveCard" disabled>Save changes</button>
  </div>
</section>

<section class="view" id="controls">
  <header class="bar"><h1>Controls</h1></header>
  <div class="scroll">
    <div class="section">Her modes</div>
    <div class="card" id="modes"></div>
    <div class="section">This phone</div>
    <div class="card" id="phone"></div>
  </div>
</section>

<section class="view" id="pair">
  <div class="avatar">🧚</div>
  <h2>Not paired yet</h2>
  <p>Open this page from the QR code in Settings, Phone, in the app on your PC.</p>
</section>

<nav>
  <button class="tab" data-view="chat"><span>💬</span>Chat</button>
  <button class="tab" data-view="chats"><span>🗂️</span>Chats</button>
  <button class="tab" data-view="character"><span>✨</span><em class="name" style="font-style:normal">AIRI</em></button>
  <button class="tab" data-view="controls"><span>🎛️</span>Controls</button>
</nav>
<div id="toast"></div>

<script>
(() => {
  const params = new URLSearchParams(location.search)
  if (params.get('key')) localStorage.setItem('fairy-key', params.get('key'))
  if (params.toString()) history.replaceState(null, '', location.pathname)
  const key = localStorage.getItem('fairy-key') || ''
  const $ = id => document.getElementById(id)
  const log = $('log'), text = $('text'), send = $('send'), mic = $('mic'), typingEl = $('typing')
  const inApp = navigator.userAgent.includes('FairyCompanionApp')
  const android = /Android/.test(navigator.userAgent)
  let image = null
  let name = 'AIRI'

  // -- Small helpers --
  function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e }
  let toastTimer = 0
  function toast(message) { const t = $('toast'); t.textContent = message; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600) }
  function ago(ms) {
    if (!ms) return ''
    const s = (Date.now() - ms) / 1000
    if (s < 60) return 'now'
    if (s < 3600) return Math.floor(s / 60) + 'm'
    if (s < 86400) return Math.floor(s / 3600) + 'h'
    if (s < 604800) return Math.floor(s / 86400) + 'd'
    return new Date(ms).toLocaleDateString()
  }
  function setStatus(online, label) { $('dot').classList.toggle('on', online); $('status').textContent = label }

  async function api(path, body) {
    const res = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Fairy-Key': key }, body: body ? JSON.stringify(body) : undefined })
    if (res.status === 401) throw new Error('This phone is not paired. Scan the QR code in the app on your PC again.')
    const data = await res.json().catch(() => ({}))
    if (data.character) showName(data.character)
    if (!res.ok || data.ok === false) throw new Error(data.error || ('Error ' + res.status))
    return data
  }

  // The name of the character in the active chat on the PC. Every answer brings it, so a switch shows at once.
  function showName(value) {
    name = value
    for (const e of document.querySelectorAll('.name')) e.textContent = value
    for (const e of document.querySelectorAll('.letter')) e.textContent = (value.trim()[0] || '?').toUpperCase()
    document.title = value
    text.placeholder = 'Message ' + value + '…'
  }

  // -- Views --
  function show(view) {
    document.body.dataset.view = view
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.view === view)
    if (view === 'chats') loadChats()
    if (view === 'character') loadCard()
    if (view === 'controls') loadControls()
    if (view === 'chat') log.scrollTop = log.scrollHeight
  }
  for (const t of document.querySelectorAll('.tab')) t.onclick = () => show(t.dataset.view)
  $('back').onclick = () => show('chats')

  // -- Chat --
  function add(role, body, img) {
    const e = el('div', 'msg ' + (role === 'user' ? 'me' : 'her'))
    if (img) { const i = el('img'); i.src = img; e.appendChild(i) }
    if (body) e.appendChild(document.createTextNode(body))
    log.insertBefore(e, typingEl)
    log.scrollTop = log.scrollHeight
    return e
  }
  function note(t) { const e = el('div', 'note', t); log.insertBefore(e, typingEl); log.scrollTop = log.scrollHeight; return e }

  async function loadHistory() {
    try {
      const data = await api('./api/history')
      for (const m of [...log.querySelectorAll('.msg, .note')]) m.remove()
      if (!data.messages.length) note('Say hi to ' + name + '!')
      for (const m of data.messages) add(m.role, m.text)
      setStatus(true, 'online')
    } catch (e) { setStatus(false, 'offline'); note(e.message || name + ' is not reachable. Is your PC on and the app running?') }
  }

  // Photos are shrunk on the phone, so they upload fast over mobile data.
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const max = 1280, s = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', 0.85))
        URL.revokeObjectURL(img.src)
      }
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }
  async function pick(input) {
    const file = input.files && input.files[0]; input.value = ''
    if (!file) return
    image = await shrink(file)
    $('previewImg').src = image; $('preview').style.display = 'block'
    $('form').classList.add('typed')
  }
  $('cam').onclick = () => $('camInput').click()
  $('gal').onclick = () => $('galInput').click()
  $('camInput').onchange = e => pick(e.target)
  $('galInput').onchange = e => pick(e.target)
  $('clearImg').onclick = () => { image = null; $('preview').style.display = 'none'; typed() }
  function typed() { $('form').classList.toggle('typed', !!text.value.trim() || !!image) }
  text.addEventListener('input', () => { text.style.height = 'auto'; text.style.height = text.scrollHeight + 'px'; typed() })

  // -- Spoken replies: the PC voice when speech is set up there, else the voice of the phone --
  let voiceOn = localStorage.getItem('fairy-voice') !== 'off'
  function showVoice() { $('voice').textContent = voiceOn ? '🔊' : '🔇'; $('voice').setAttribute('aria-pressed', String(voiceOn)) }
  function setVoice(on) { voiceOn = on; localStorage.setItem('fairy-voice', on ? 'on' : 'off'); if (!on) stopTalking(); showVoice() }
  $('voice').onclick = () => { setVoice(!voiceOn); toast(voiceOn ? 'Spoken replies on' : 'Spoken replies off') }
  showVoice()
  const player = new Audio()
  function stopTalking() { player.pause(); if (window.speechSynthesis) speechSynthesis.cancel() }
  function talk(data) {
    if (!voiceOn) return
    if (data.speech) { player.src = data.speech; player.play().catch(() => {}); return }
    const words = (data.reply || '').replace(/[\\p{Extended_Pictographic}\\uFE0F\\u200D]/gu, '').trim()
    if (words && window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance(words))
  }

  async function ask(body, onReply) {
    send.disabled = true; mic.disabled = true
    typingEl.classList.add('on'); log.scrollTop = log.scrollHeight
    setStatus(true, 'typing…')
    try {
      const data = await api('./api/send', { ...body, speak: voiceOn })
      onReply(data)
      add('assistant', data.reply || '…')
      talk(data)
      setStatus(true, 'online')
    } catch (err) { note(err.message); setStatus(false, 'offline') }
    finally { typingEl.classList.remove('on'); send.disabled = false; mic.disabled = false }
  }

  $('form').onsubmit = async (e) => {
    e.preventDefault()
    const body = text.value.trim()
    if (!body && !image) return
    const sentImage = image
    add('user', body, sentImage)
    text.value = ''; text.style.height = 'auto'; image = null; $('preview').style.display = 'none'; typed()
    await ask({ text: body || 'What do you see in this photo?', image: sentImage }, () => {})
  }
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); $('form').requestSubmit() } })

  // -- Voice messages: hold the mic, or hands-free from the app's assistant button. 16 kHz mono, the PC transcribes. --
  // Hands-free stops after a short silence once the owner spoke.
  const HANDS_FREE = { loud: 0.03, quietMs: 1200, waitMs: 7000, maxMs: 20000 }
  let rec = null
  async function startRec(handsFree) {
    if (rec || mic.disabled) return
    stopTalking()
    const state = { chunks: [], stopped: false }
    rec = state
    mic.classList.add('on')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      const ctx = new AudioContext({ sampleRate: 16000 })
      const source = ctx.createMediaStreamSource(stream)
      const proc = ctx.createScriptProcessor(4096, 1, 1)
      const started = Date.now()
      let lastLoud = 0
      proc.onaudioprocess = ev => {
        if (state.stopped) return
        const samples = ev.inputBuffer.getChannelData(0)
        state.chunks.push(new Float32Array(samples))
        if (!handsFree) return
        let sum = 0
        for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
        const now = Date.now()
        if (Math.sqrt(sum / samples.length) > HANDS_FREE.loud) lastLoud = now
        if (!lastLoud && now - started > HANDS_FREE.waitMs) { state.chunks = []; toast('I did not hear anything.'); stopRec() }
        else if ((lastLoud && now - lastLoud > HANDS_FREE.quietMs) || now - started > HANDS_FREE.maxMs) stopRec()
      }
      source.connect(proc); proc.connect(ctx.destination)
      state.close = () => { proc.disconnect(); source.disconnect(); stream.getTracks().forEach(t => t.stop()); ctx.close() }
      state.rate = ctx.sampleRate
      if (state.stopped) finishRec(state)
    } catch (err) {
      rec = null; mic.classList.remove('on')
      note('The mic did not start: ' + (err.message || err))
    }
  }
  function stopRec() {
    const state = rec
    if (!state) return
    state.stopped = true
    mic.classList.remove('on')
    if (state.close) finishRec(state)
  }
  function finishRec(state) {
    rec = null
    state.close()
    const total = state.chunks.reduce((n, c) => n + c.length, 0)
    if (!total) return
    if (total < state.rate * 0.4) { toast('Hold the 🎤 button while you talk.'); return }
    // Resample to 16 kHz in case the phone ignored the asked rate.
    const step = state.rate / 16000, length = Math.floor(total / step)
    const all = new Float32Array(total); let at = 0
    for (const c of state.chunks) { all.set(c, at); at += c.length }
    const pcm = new DataView(new ArrayBuffer(length * 2))
    for (let i = 0; i < length; i++) { const s = Math.max(-1, Math.min(1, all[Math.floor(i * step)])); pcm.setInt16(i * 2, s < 0 ? s * 32768 : s * 32767, true) }
    const bytes = new Uint8Array(pcm.buffer); let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    const bubble = add('user', '🎤 …')
    ask({ audio: btoa(bin) }, data => { bubble.textContent = data.heard ? '🎤 ' + data.heard : '🎤' })
  }
  mic.addEventListener('pointerdown', e => { e.preventDefault(); mic.setPointerCapture(e.pointerId); startRec(false) })
  mic.addEventListener('pointerup', stopRec)
  mic.addEventListener('pointercancel', stopRec)
  mic.addEventListener('contextmenu', e => e.preventDefault())
  // The phone app calls this when the owner presses its assistant button.
  window.fairyListen = () => { if (key) { show('chat'); toast('Listening…'); startRec(true) } }

  // -- Share to her from another app: the phone app passes { text, image }, the home screen app passes the query --
  window.fairyShare = (share) => {
    if (!key || !share || (!share.text && !share.image)) return
    show('chat')
    const said = share.text ? share.text.slice(0, 3000) : ''
    add('user', said ? '📤 ' + said : '📤', share.image)
    ask({
      text: said ? '(I shared this with you from another app) ' + said : '(I shared this picture with you from another app)',
      image: share.image,
    }, () => {})
  }
  const shared = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean)

  // -- Chats --
  async function loadChats() {
    const list = $('chatList')
    try {
      const data = await api('./api/chats')
      list.innerHTML = ''
      if (!data.chats.length) list.appendChild(el('p', 'empty', 'No chats yet. Tap ＋ to start one.'))
      for (const c of data.chats) {
        const row = el('button', 'row' + (c.active ? ' active' : ''))
        const avatar = el('div', 'avatar', (name.trim()[0] || '?').toUpperCase())
        const main = el('div', 'row-main')
        const top = el('div', 'row-top')
        top.appendChild(el('b', '', c.title))
        top.appendChild(el('time', '', ago(c.lastAt)))
        main.appendChild(top)
        main.appendChild(el('div', 'preview', c.lastText ? (c.lastFromUser ? 'You: ' : '') + c.lastText : ''))
        row.appendChild(avatar); row.appendChild(main)
        row.onclick = () => openChat(c.id)
        list.appendChild(row)
      }
    } catch (e) { list.innerHTML = ''; list.appendChild(el('p', 'empty', e.message)) }
  }
  async function openChat(id) {
    try { await api('./api/open-chat', { id }); show('chat'); await loadHistory() } catch (e) { toast(e.message) }
  }
  $('newChat').onclick = async () => {
    try { await api('./api/new-chat', {}); show('chat'); await loadHistory() } catch (e) { toast(e.message) }
  }

  // -- Character: switch characters, and edit the card text that makes her personality --
  const fields = { description: $('fDescription'), personality: $('fPersonality'), scenario: $('fScenario') }
  let savedCard = null
  function cardChanged() { return !!savedCard && Object.keys(fields).some(f => fields[f].value !== savedCard[f]) }
  for (const f of Object.values(fields)) f.addEventListener('input', () => { $('saveCard').disabled = !cardChanged() })
  async function loadCard() {
    try {
      const [data, people] = await Promise.all([api('./api/card'), api('./api/characters')])
      savedCard = data.card
      for (const f of Object.keys(fields)) fields[f].value = data.card[f] || ''
      $('saveCard').disabled = true
      const chips = $('people')
      chips.innerHTML = ''
      if (people.characters.length > 1) {
        for (const c of people.characters) {
          const chip = el('button', 'chip' + (c.id === people.characterId ? ' on' : ''), c.name)
          chip.onclick = () => switchTo(c.id)
          chips.appendChild(chip)
        }
      }
    } catch (e) { toast(e.message) }
  }
  async function switchTo(id) {
    if (cardChanged() && !confirm('Leave without saving the changes?')) return
    try { await api('./api/switch', { id }); await loadCard(); await loadHistory(); toast('Switched to ' + name) } catch (e) { toast(e.message) }
  }
  $('saveCard').onclick = async () => {
    const body = {}
    for (const f of Object.keys(fields)) body[f] = fields[f].value
    $('saveCard').disabled = true
    try { const data = await api('./api/card', body); savedCard = data.card; toast('Saved. ' + name + ' uses it from her next answer.') }
    catch (e) { $('saveCard').disabled = false; toast(e.message) }
  }

  // -- Controls --
  const MODES = [
    ['wander', '🧚', 'Wander around', 'She floats around your screen.'],
    ['mischief', '😈', 'Mischief', 'Small, harmless pranks now and then.'],
    ['sprite', '🖼️', 'Sprite avatar', 'Her pictures instead of the Live2D model.'],
    ['gameBuddy', '🎮', 'Game buddy', 'Reacts to your League matches.'],
    ['gameComments', '🗣️', 'Talk during games', 'Spoken comments on big moments.'],
    ['smartSpot', '🪟', 'Move off game menus', 'Sits where game menus are not.'],
  ]
  function switchRow(emoji, title, hint, checked, onChange, disabled) {
    const row = el('label', 'setting')
    const icon = el('div', 'emoji', emoji)
    const label = el('div', 'label')
    label.appendChild(el('b', '', title)); label.appendChild(el('small', '', hint))
    const sw = el('span', 'switch')
    const input = el('input'); input.type = 'checkbox'; input.checked = !!checked; input.disabled = !!disabled
    input.onchange = () => onChange(input.checked, input)
    sw.appendChild(input); sw.appendChild(el('span'))
    row.appendChild(icon); row.appendChild(label); row.appendChild(sw)
    return row
  }
  function linkRow(emoji, title, hint, onClick) {
    const row = el('button', 'setting')
    const label = el('div', 'label')
    label.appendChild(el('b', '', title)); label.appendChild(el('small', '', hint))
    row.appendChild(el('div', 'emoji', emoji)); row.appendChild(label); row.appendChild(el('span', '', '›'))
    row.onclick = onClick
    return row
  }
  function renderModes(data) {
    const box = $('modes')
    box.innerHTML = ''
    for (const [mode, emoji, title, hint] of MODES) {
      const value = mode === 'sprite' ? data.sprite : data.modes[mode]
      const off = value === undefined || (mode === 'gameComments' && !data.modes.gameBuddy)
      box.appendChild(switchRow(emoji, title, hint, value, async (on, input) => {
        input.disabled = true
        try { renderModes(await api('./api/controls', { mode, on })); toast(title + (on ? ' on' : ' off')) }
        catch (e) { input.checked = !on; input.disabled = false; toast(e.message) }
      }, off))
    }
  }
  async function loadControls() {
    try { renderModes(await api('./api/controls')) } catch (e) { $('modes').innerHTML = ''; $('modes').appendChild(el('p', 'empty', e.message)) }
    renderPhone()
  }
  function renderPhone() {
    const box = $('phone')
    box.innerHTML = ''
    box.appendChild(switchRow('🔊', 'Spoken replies', 'She answers out loud.', voiceOn, on => setVoice(on)))
    if (canPush && !inApp) box.appendChild(linkRow(pushOn ? '🔔' : '🔕', 'Notifications', pushOn ? name + ' can message this phone.' : 'Let ' + name + ' message this phone.', enablePush))
    if (android && !inApp) {
      box.appendChild(linkRow('📱', 'Get the app', 'Download the app for this phone.', () => { location.href = './fairy-phone.apk?key=' + encodeURIComponent(key) }))
      box.appendChild(linkRow('🔗', 'Connect the app', 'After installing it, pair it with one tap.', () => {
        location.href = 'intent://pair?u=' + encodeURIComponent(location.origin) + '&k=' + encodeURIComponent(key) + '#Intent;scheme=fairycompanion;package=dev.fairy.companion;end'
      }))
    }
    box.appendChild(linkRow('🚪', 'Unpair this phone', 'Forget the pairing. Scan the QR code to pair again.', () => {
      if (!confirm('Unpair this phone?')) return
      localStorage.removeItem('fairy-key'); location.reload()
    }))
  }

  // -- Notifications: the character can message this phone when the owner is away from the PC --
  const canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  let pushOn = false
  function keyBytes(b64) {
    const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4))
    return Uint8Array.from(s, c => c.charCodeAt(0))
  }
  async function subscribe() {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      const data = await api('./api/push-key')
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.key) })
    }
    await api('./api/push-subscribe', sub.toJSON())
    pushOn = true
  }
  async function enablePush() {
    try {
      if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') { toast('Notifications are blocked. Allow them in the site settings.'); return }
      await subscribe()
      toast(name + ' can message this phone now.')
      renderPhone()
    } catch (e) { toast('Notifications did not turn on: ' + (e.message || e)) }
  }
  if (canPush) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      // The PC can lose a subscription, so a phone that allowed notifications sends it again on each visit.
      if (key && Notification.permission === 'granted') subscribe().catch(() => {})
    }).catch(() => {})
  }

  // -- Start --
  if (!key) { show('pair'); return }
  show('chat')
  loadHistory().then(() => {
    if (shared.length) window.fairyShare({ text: [...new Set(shared)].join('\\n') })
  })
})()
</script>
</body>
</html>
`

export const PHONE_MANIFEST = JSON.stringify({
  name: 'AIRI',
  short_name: 'AIRI',
  start_url: './',
  display: 'standalone',
  background_color: '#120f1b',
  theme_color: '#120f1b',
  icons: [{ src: './icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  // Android lists the home screen app in the share menu. Links and text arrive in the query of the page.
  share_target: { action: './', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
})

export const PHONE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#6d4bd8"/><text x="50" y="68" font-size="58" text-anchor="middle">🧚</text></svg>`

/** The service worker of the phone page. It only shows the character's notifications and opens the chat on a tap. */
export const PHONE_SERVICE_WORKER = /* js */ `self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'New message', { body: data.body || '', icon: './icon.svg', tag: 'fairy-message', renotify: true }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => list.length ? list[0].focus() : self.clients.openWindow('./')))
})
`
