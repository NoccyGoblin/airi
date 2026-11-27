/**
 * FAIRY: the page of a mini game with the character. It has no access to anything. It tells the main process the
 * owner's move through its title ("move:4", "rps:rock") and gets her move back through `window.herMove`.
 */

export type GameName = 'tic-tac-toe' | 'rock-paper-scissors'

const STYLE = `
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:600 14px/1.3 system-ui,'Segoe UI',sans-serif;color:#fff;user-select:none}
#card{position:absolute;inset:6px;border-radius:18px;background:rgba(32,22,48,.94);box-shadow:0 4px 18px rgba(0,0,0,.4);display:flex;flex-direction:column}
#top{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;-webkit-app-region:drag}
#close{-webkit-app-region:no-drag;border:0;background:transparent;color:#cbb6e6;font:20px/1 system-ui;cursor:pointer}
#status{text-align:center;min-height:22px;padding:4px 10px;color:#ffd1ea}
#play{flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px}
button.cell,button.pick,#again{border:0;border-radius:12px;cursor:pointer;font:700 34px/1 system-ui;color:#fff;background:rgba(255,255,255,.08)}
button.cell{width:72px;height:72px}
button.cell:hover:not(:disabled),button.pick:hover:not(:disabled){background:rgba(255,79,163,.35)}
button.cell.O{color:#ff8fc8}
#grid{display:grid;grid-template-columns:repeat(3,72px);gap:8px}
button.pick{width:76px;height:76px;font-size:38px}
#picks{display:flex;gap:10px}
#score{color:#cbb6e6}
#again{font-size:14px;padding:8px 16px;background:#ff4fa3;display:none;margin:10px auto 14px}
`

const TIC_TAC_TOE = `
const grid = document.getElementById('grid')
const cells = [...Array(9)].map((_, index) => {
  const button = document.createElement('button')
  button.className = 'cell'
  button.onclick = () => { if (!button.textContent && !done && yourTurn) { mark(index, 'X'); yourTurn = false; status('…'); document.title = 'move:' + index + ':' + Date.now() } }
  grid.appendChild(button)
  return button
})
let yourTurn = true, done = false
function mark(index, who) { cells[index].textContent = who; cells[index].classList.add(who); cells[index].disabled = true }
window.herMove = (index) => { if (index >= 0) mark(index, 'O'); yourTurn = true; status('Your turn') }
window.gameOver = (text) => { done = true; status(text); cells.forEach(cell => { cell.disabled = true }); again.style.display = 'block' }
status('You are X. Your turn!')
`

const ROCK_PAPER_SCISSORS = `
const picks = document.getElementById('picks')
const symbols = { rock: '✊', paper: '✋', scissors: '✌️' }
let you = 0, her = 0, waiting = false
for (const name of Object.keys(symbols)) {
  const button = document.createElement('button')
  button.className = 'pick'
  button.textContent = symbols[name]
  button.title = name
  button.onclick = () => { if (!waiting && you < 2 && her < 2) { waiting = true; status('…'); document.title = 'rps:' + name + ':' + Date.now() } }
  picks.appendChild(button)
}
window.herMove = (yours, hers, outcome) => {
  if (outcome === 'win') you++
  if (outcome === 'loss') her++
  document.getElementById('score').textContent = 'You ' + you + ' – ' + her + ' Her'
  status(symbols[yours] + ' vs ' + symbols[hers] + (outcome === 'win' ? '  You win this round!' : outcome === 'loss' ? '  She wins this round!' : '  Same! Again.'))
  waiting = false
}
window.gameOver = (text) => { status(text); [...picks.children].forEach(button => { button.disabled = true }); again.style.display = 'block' }
status('Best of three. Pick one!')
`

export function gamePage(game: GameName, characterName: string) {
  const name = characterName.replaceAll(/[<>&"']/g, '')
  const title = game === 'tic-tac-toe' ? `Tic-tac-toe with ${name}` : `Rock, paper, scissors with ${name}`
  const board = game === 'tic-tac-toe' ? '<div id="grid"></div>' : '<div id="picks"></div><div id="score">You 0 – 0 Her</div>'
  return `<!doctype html><html><head><meta charset="utf-8"><title>game</title><style>${STYLE}</style></head><body><div id="card">
<div id="top"><span>🎮 ${title}</span><button id="close" title="Close" onclick="window.close()">×</button></div>
<div id="status"></div><div id="play">${board}</div><button id="again" onclick="document.title='again:'+Date.now()">Play again</button></div>
<script>
const again = document.getElementById('again')
function status(text) { document.getElementById('status').textContent = text }
${game === 'tic-tac-toe' ? TIC_TAC_TOE : ROCK_PAPER_SCISSORS}
</script></body></html>`
}

/** Who wins a round of rock, paper, scissors, seen from the owner. */
export function rpsOutcome(yours: string, hers: string): 'win' | 'loss' | 'tie' {
  if (yours === hers)
    return 'tie'
  const beats: Record<string, string> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }
  return beats[yours] === hers ? 'win' : 'loss'
}
