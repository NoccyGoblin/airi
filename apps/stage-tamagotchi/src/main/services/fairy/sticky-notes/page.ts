/**
 * FAIRY: the page of one sticky note. The note text comes from the character, so it is escaped before it goes in.
 */

export function escapeHtml(text: string) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&#39;')
}

export function notePage(text: string, signature: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>note</title><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:15px/1.35 'Segoe Print','Comic Sans MS',system-ui,sans-serif}
#note{position:absolute;inset:6px;padding:26px 14px 12px;border-radius:4px 4px 14px 4px;background:#fff59d;color:#3e2f00;
box-shadow:0 3px 10px rgba(0,0,0,.3);-webkit-app-region:drag;overflow:hidden;white-space:pre-wrap;word-wrap:break-word;transform:rotate(-1.5deg)}
#close{position:absolute;top:4px;right:6px;border:0;background:transparent;font:18px/1 system-ui;color:#7a6500;cursor:pointer;-webkit-app-region:no-drag}
#close:hover{color:#3e2f00}
#by{position:absolute;bottom:6px;right:12px;font-size:11px;opacity:.6}
</style></head><body><div id="note"><button id="close" title="Close" onclick="window.close()">×</button>${escapeHtml(text)}<div id="by">— ${escapeHtml(signature)} ✨</div></div></body></html>`
}
