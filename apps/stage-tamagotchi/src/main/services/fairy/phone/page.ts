/**
 * FAIRY: the phone page. One self-contained HTML file: chat with the Iru that runs on the PC, and send a photo from the
 * camera or the gallery. The PC serves it on the Tailscale network only (see ./index.ts).
 *
 * The pairing key comes in the first link (`?key=...`) and stays in the phone's localStorage.
 */
export const PHONE_PAGE_HTML = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#16131f">
<meta name="mobile-web-app-capable" content="yes">
<link rel="manifest" href="./manifest.webmanifest">
<title>Iru</title>
<style>
  :root { color-scheme: dark; --bg:#16131f; --panel:#221d30; --me:#6d4bd8; --her:#2c2540; --text:#efeaff; --muted:#9a91b8; }
  * { box-sizing: border-box; }
  html, body { margin:0; height:100%; background:var(--bg); color:var(--text); font: 16px/1.45 system-ui, sans-serif; }
  body { display:flex; flex-direction:column; padding-bottom: env(safe-area-inset-bottom); }
  header { padding: 14px 16px 10px; padding-top: calc(14px + env(safe-area-inset-top)); font-weight:600; display:flex; gap:8px; align-items:center; }
  header small { color:var(--muted); font-weight:400; }
  #log { flex:1; overflow-y:auto; padding: 8px 12px 16px; display:flex; flex-direction:column; gap:8px; }
  .msg { max-width:85%; padding:9px 13px; border-radius:16px; white-space:pre-wrap; word-wrap:break-word; }
  .me { align-self:flex-end; background:var(--me); border-bottom-right-radius:4px; }
  .her { align-self:flex-start; background:var(--her); border-bottom-left-radius:4px; }
  .msg img { display:block; max-width:100%; border-radius:10px; margin-bottom:6px; }
  .note { align-self:center; color:var(--muted); font-size:13px; }
  form { display:flex; gap:6px; padding:8px 10px; background:var(--panel); align-items:flex-end; }
  textarea { flex:1; resize:none; max-height:120px; border:0; border-radius:18px; padding:10px 14px; background:var(--bg); color:var(--text); font:inherit; outline:none; }
  button { border:0; border-radius:50%; width:42px; height:42px; font-size:20px; background:var(--her); color:var(--text); flex:none; }
  button.send { background:var(--me); }
  button:disabled { opacity:.4; }
  #preview { display:none; padding:6px 12px 0; background:var(--panel); }
  #preview img { height:64px; border-radius:8px; vertical-align:middle; }
  #preview button { width:28px; height:28px; font-size:14px; margin-left:6px; }
  input[type=file] { display:none; }
  header button { margin-left:auto; width:36px; height:36px; font-size:17px; }
  button.mic { touch-action:none; user-select:none; -webkit-user-select:none; }
  button.mic.on { background:#d8466d; transform:scale(1.15); }
</style>
</head>
<body>
<header>🧚 Iru <small id="status">connecting…</small><button type="button" id="voice" aria-label="Spoken replies">🔊</button></header>
<div id="log"></div>
<div id="preview"><img id="previewImg" alt=""><button type="button" id="clearImg" aria-label="Remove photo">✕</button></div>
<form id="form">
  <button type="button" id="cam" aria-label="Take a photo">📷</button>
  <button type="button" id="gal" aria-label="Pick a photo">🖼️</button>
  <textarea id="text" rows="1" placeholder="Message Iru…"></textarea>
  <button type="button" class="mic" id="mic" aria-label="Hold to talk">🎤</button>
  <button class="send" id="send" aria-label="Send">➤</button>
  <input id="camInput" type="file" accept="image/*" capture="environment">
  <input id="galInput" type="file" accept="image/*">
</form>
<script>
(() => {
  const params = new URLSearchParams(location.search)
  if (params.get('key')) {
    localStorage.setItem('fairy-key', params.get('key'))
    history.replaceState(null, '', location.pathname)
  }
  const key = localStorage.getItem('fairy-key') || ''
  const $ = id => document.getElementById(id)
  const log = $('log'), text = $('text'), send = $('send'), status = $('status')
  let image = null

  function add(role, body, img) {
    const el = document.createElement('div')
    el.className = 'msg ' + (role === 'user' ? 'me' : 'her')
    if (img) { const i = document.createElement('img'); i.src = img; el.appendChild(i) }
    if (body) el.appendChild(document.createTextNode(body))
    log.appendChild(el)
    log.scrollTop = log.scrollHeight
    return el
  }
  function note(t) { const el = document.createElement('div'); el.className = 'note'; el.textContent = t; log.appendChild(el); log.scrollTop = log.scrollHeight; return el }

  async function api(path, body) {
    const res = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Fairy-Key': key }, body: body ? JSON.stringify(body) : undefined })
    if (res.status === 401) throw new Error('This phone is not paired. Scan the QR code in Iru on your PC again.')
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) throw new Error(data.error || ('Error ' + res.status))
    return data
  }

  async function loadHistory() {
    try {
      const data = await api('./api/history')
      log.innerHTML = ''
      for (const m of data.messages) add(m.role, m.text)
      status.textContent = 'online'
    } catch (e) { status.textContent = 'offline'; note(e.message || 'Iru is not reachable. Is your PC on and Iru running?') }
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
  }
  $('cam').onclick = () => $('camInput').click()
  $('gal').onclick = () => $('galInput').click()
  $('camInput').onchange = e => pick(e.target)
  $('galInput').onchange = e => pick(e.target)
  $('clearImg').onclick = () => { image = null; $('preview').style.display = 'none' }

  text.addEventListener('input', () => { text.style.height = 'auto'; text.style.height = text.scrollHeight + 'px' })

  // -- Spoken replies: the PC voice when speech is set up there, else the voice of the phone --
  let voiceOn = localStorage.getItem('fairy-voice') !== 'off'
  const voiceBtn = $('voice')
  function showVoice() { voiceBtn.textContent = voiceOn ? '🔊' : '🔇'; voiceBtn.setAttribute('aria-pressed', String(voiceOn)) }
  voiceBtn.onclick = () => { voiceOn = !voiceOn; localStorage.setItem('fairy-voice', voiceOn ? 'on' : 'off'); if (!voiceOn) stopTalking(); showVoice() }
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
    const waiting = note('Iru is thinking…')
    try {
      const data = await api('./api/send', { ...body, speak: voiceOn })
      waiting.remove()
      onReply(data)
      add('assistant', data.reply || '…')
      talk(data)
      status.textContent = 'online'
    } catch (err) { waiting.remove(); note(err.message) }
    finally { send.disabled = false; mic.disabled = false }
  }

  $('form').onsubmit = async (e) => {
    e.preventDefault()
    const body = text.value.trim()
    if (!body && !image) return
    const sentImage = image
    add('user', body, sentImage)
    text.value = ''; text.style.height = 'auto'; image = null; $('preview').style.display = 'none'
    await ask({ text: body || 'What do you see in this photo?', image: sentImage }, () => {})
  }

  // -- Hold to talk: records 16 kHz mono audio, and the PC turns it into text --
  const mic = $('mic')
  let rec = null
  async function startRec() {
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
      proc.onaudioprocess = ev => { if (!state.stopped) state.chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0))) }
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
    if (total < state.rate * 0.4) { note('Hold the 🎤 button while you talk.'); return }
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
  mic.addEventListener('pointerdown', e => { e.preventDefault(); mic.setPointerCapture(e.pointerId); startRec() })
  mic.addEventListener('pointerup', stopRec)
  mic.addEventListener('pointercancel', stopRec)
  mic.addEventListener('contextmenu', e => e.preventDefault())
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); $('form').requestSubmit() } })

  if (!key) note('Open this page from the QR code in Iru on your PC to pair this phone.')
  else loadHistory()
})()
</script>
</body>
</html>
`

export const PHONE_MANIFEST = JSON.stringify({
  name: 'Iru',
  short_name: 'Iru',
  start_url: './',
  display: 'standalone',
  background_color: '#16131f',
  theme_color: '#16131f',
  icons: [{ src: './icon.svg', sizes: 'any', type: 'image/svg+xml' }],
})

export const PHONE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#6d4bd8"/><text x="50" y="68" font-size="58" text-anchor="middle">🧚</text></svg>`
