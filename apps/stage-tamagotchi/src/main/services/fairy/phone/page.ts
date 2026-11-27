/**
 * FAIRY: the phone page. One self-contained HTML file: chat with the character that runs on the PC, and send a photo from the
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
<title>AIRI</title>
<style>
  :root { color-scheme: dark; --bg:#16131f; --panel:#221d30; --me:#6d4bd8; --her:#2c2540; --text:#efeaff; --muted:#9a91b8; }
  * { box-sizing: border-box; }
  html, body { margin:0; height:100%; background:var(--bg); color:var(--text); font: 16px/1.45 system-ui, sans-serif; }
  body { display:flex; flex-direction:column; padding-bottom: env(safe-area-inset-bottom); }
  #who { background: transparent; color: inherit; font: inherit; border: 1px solid rgba(255,255,255,.25); border-radius: 8px; padding: 2px 6px; }
  #who option { color: #222; }
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
  header button { width:36px; height:36px; font-size:17px; }
  #status { margin-right:auto; }
  button.mic { touch-action:none; user-select:none; -webkit-user-select:none; }
  button.mic.on { background:#d8466d; transform:scale(1.15); }
</style>
</head>
<body>
<header>🧚 <span id="name">AIRI</span><select id="who" aria-label="Character" style="display:none"></select> <small id="status">connecting…</small><button type="button" id="app" aria-label="Get the phone app">📱</button><button type="button" id="bell" aria-label="Notifications">🔕</button><button type="button" id="voice" aria-label="Spoken replies">🔊</button></header>
<div id="log"></div>
<div id="preview"><img id="previewImg" alt=""><button type="button" id="clearImg" aria-label="Remove photo">✕</button></div>
<form id="form">
  <button type="button" id="cam" aria-label="Take a photo">📷</button>
  <button type="button" id="gal" aria-label="Pick a photo">🖼️</button>
  <textarea id="text" rows="1" placeholder="Message…"></textarea>
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
    if (res.status === 401) throw new Error('This phone is not paired. Scan the QR code in AIRI on your PC again.')
    const data = await res.json().catch(() => ({}))
    if (data.character) showName(data.character, data.characterId)
    if (!res.ok || data.ok === false) throw new Error(data.error || ('Error ' + res.status))
    return data
  }

  // The name of the character in the active chat on the PC. Every answer brings it, so a switch shows at once.
  let name = 'AIRI'
  function showName(value, id) {
    name = value
    $('name').textContent = value
    document.title = value
    text.placeholder = 'Message ' + value + '…'
    if (id) $('who').value = id
  }

  // With more than one character, the name turns into a picker. A switch changes the character on the PC too.
  async function loadCharacters() {
    try {
      const data = await api('./api/characters')
      const who = $('who')
      who.innerHTML = ''
      for (const c of data.characters) { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; who.appendChild(o) }
      if (data.characterId) who.value = data.characterId
      const many = data.characters.length > 1
      who.style.display = many ? '' : 'none'
      $('name').style.display = many ? 'none' : ''
    } catch {}
  }
  $('who').onchange = async () => {
    status.textContent = 'switching…'
    try { await api('./api/switch', { id: $('who').value }); await loadHistory() } catch (e) { note(e.message) }
  }

  async function loadHistory() {
    try {
      const data = await api('./api/history')
      log.innerHTML = ''
      for (const m of data.messages) add(m.role, m.text)
      status.textContent = 'online'
    } catch (e) { status.textContent = 'offline'; note(e.message || name + ' is not reachable. Is your PC on and AIRI running?') }
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
    const waiting = note(name + ' is thinking…')
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
  // Hands-free, from the assistant button of the phone app: it stops after a short silence once the owner spoke.
  const HANDS_FREE = { loud: 0.03, quietMs: 1200, waitMs: 7000, maxMs: 20000 }
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
        if (!lastLoud && now - started > HANDS_FREE.waitMs) { state.chunks = []; note('I did not hear anything.'); stopRec() }
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
  mic.addEventListener('pointerdown', e => { e.preventDefault(); mic.setPointerCapture(e.pointerId); startRec(false) })
  // The phone app calls this when the owner presses its assistant button.
  window.fairyListen = () => { if (key) { note('Listening…'); startRec(true) } }
  mic.addEventListener('pointerup', stopRec)
  mic.addEventListener('pointercancel', stopRec)
  mic.addEventListener('contextmenu', e => e.preventDefault())
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); $('form').requestSubmit() } })

  // -- Notifications: the character can message this phone when the owner is away from the PC --
  const bell = $('bell')
  const canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  function showBell(on) { bell.textContent = on ? '🔔' : '🔕'; bell.setAttribute('aria-pressed', String(on)) }
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
    showBell(true)
  }
  bell.onclick = async () => {
    if (!canPush) { note('This browser cannot show notifications from this page. Add it to the home screen in Chrome.'); return }
    try {
      if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') { note('Notifications are blocked. Allow them in the site settings of this page.'); return }
      await subscribe()
      note(name + ' can message this phone now.')
    } catch (e) { note('Notifications did not turn on: ' + (e.message || e)) }
  }
  showBell(false)

  // -- The phone app: inside it, the bell has no use (its web view has no push). In Chrome on Android, offer it. --
  const inApp = navigator.userAgent.includes('FairyCompanionApp')
  if (inApp) bell.style.display = 'none'
  const appBtn = $('app')
  if (inApp || !/Android/.test(navigator.userAgent) || !key) appBtn.style.display = 'none'
  appBtn.onclick = () => {
    const box = note('')
    const download = document.createElement('a')
    download.href = './fairy-phone.apk?key=' + encodeURIComponent(key)
    download.textContent = '1. Download the app'
    const connect = document.createElement('a')
    connect.href = 'intent://pair?u=' + encodeURIComponent(location.origin) + '&k=' + encodeURIComponent(key) + '#Intent;scheme=fairycompanion;package=dev.fairy.companion;end'
    connect.textContent = '2. After installing it, connect the app'
    for (const link of [download, connect]) { link.style.cssText = 'display:block;color:#c9b8ff;margin:6px 0'; box.appendChild(link) }
  }

  if (canPush) {
    navigator.serviceWorker.register('./sw.js').then(() => {
      // The PC can lose a subscription, so a phone that allowed notifications sends it again on each visit.
      if (key && Notification.permission === 'granted') subscribe().catch(() => {})
    }).catch(() => {})
  }

  if (!key) note('Open this page from the QR code in AIRI on your PC to pair this phone.')
  else { loadHistory(); loadCharacters() }
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
  background_color: '#16131f',
  theme_color: '#16131f',
  icons: [{ src: './icon.svg', sizes: 'any', type: 'image/svg+xml' }],
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
