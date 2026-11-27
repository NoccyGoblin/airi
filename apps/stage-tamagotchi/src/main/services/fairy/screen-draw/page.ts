/**
 * FAIRY: the page of the drawing layer over the screen. It draws marks and doodles stroke by stroke, then fades
 * them out. A doodle is SVG that the character wrote, so the page keeps only plain shapes and attributes: no scripts,
 * no links, no pictures, and no event handlers.
 */

/** Shapes and attributes that a doodle can use. Everything else is dropped. */
export const DOODLE_ELEMENTS = ['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'text']
export const DOODLE_ATTRIBUTES = ['viewBox', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'transform', 'font-size', 'text-anchor', 'opacity']

/**
 * A first check of doodle SVG before it reaches the page, which then keeps only the allowed parts.
 *
 * Returns:
 * - Why the SVG is refused, or nothing when it may go to the page
 */
export function doodleProblem(svg: string) {
  if (!svg.trim().startsWith('<svg'))
    return 'A doodle must be one <svg> element.'
  if (svg.length > 40_000)
    return 'The doodle is too big. Use fewer and simpler shapes.'
  if (/<script|<foreignobject|<image|<use|href|\bon\w+\s*=|url\s*\(|javascript:/i.test(svg))
    return 'A doodle can only have plain shapes: no scripts, links, pictures, or events.'
  return undefined
}

export const DRAW_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>drawing</title><style>
html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}
svg.layer{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.mark{fill:none;stroke:#ff4fa3;stroke-width:5;stroke-linecap:round;filter:drop-shadow(0 0 4px rgba(255,79,163,.6))}
.label{font:700 18px system-ui,'Segoe UI',sans-serif;fill:#fff;paint-order:stroke;stroke:#ff4fa3;stroke-width:5px}
.drawing{transition:opacity .8s}
.drawing.gone{opacity:0}
</style></head><body><svg class="layer" id="layer"></svg><script>
const NS = 'http://www.w3.org/2000/svg'
const ELEMENTS = new Set(${JSON.stringify(DOODLE_ELEMENTS)})
const ATTRIBUTES = new Set(${JSON.stringify(DOODLE_ATTRIBUTES)})
const layer = document.getElementById('layer')

// Draws each stroke from its start to its end, one after another.
function animateStrokes(root) {
  let delay = 0
  for (const shape of root.querySelectorAll('path,circle,ellipse,line,polyline,polygon,rect')) {
    let length = 0
    try { length = shape.getTotalLength() } catch {}
    if (!length) continue
    const duration = Math.min(900, 150 + length * 0.9)
    shape.style.strokeDasharray = length
    shape.style.strokeDashoffset = length
    shape.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration, delay, fill: 'forwards', easing: 'ease-in-out' })
    delay += duration * 0.6
  }
  for (const text of root.querySelectorAll('text')) {
    text.style.opacity = 0
    text.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay, fill: 'forwards' })
  }
}

function fadeLater(group, holdMs) {
  setTimeout(() => { group.classList.add('gone'); setTimeout(() => group.remove(), 900) }, holdMs)
}

// Keeps only allowed shapes and attributes of the character's SVG.
function cleanCopy(source) {
  if (!ELEMENTS.has(source.localName)) return null
  const copy = document.createElementNS(NS, source.localName)
  for (const attribute of source.attributes)
    if (ATTRIBUTES.has(attribute.name)) copy.setAttribute(attribute.name, attribute.value)
  for (const child of source.childNodes) {
    if (child.nodeType === 3 && source.localName === 'text') copy.appendChild(document.createTextNode(child.textContent))
    else if (child.nodeType === 1) { const clean = cleanCopy(child); if (clean) copy.appendChild(clean) }
  }
  return copy
}

window.drawMark = ({ x, y, radius, label, holdMs }) => {
  const group = document.createElementNS(NS, 'g')
  group.setAttribute('class', 'drawing')
  const circle = document.createElementNS(NS, 'ellipse')
  circle.setAttribute('class', 'mark')
  circle.setAttribute('cx', x); circle.setAttribute('cy', y)
  circle.setAttribute('rx', radius * 1.25); circle.setAttribute('ry', radius)
  circle.setAttribute('transform', 'rotate(-8 ' + x + ' ' + y + ')')
  group.appendChild(circle)
  if (label) {
    const text = document.createElementNS(NS, 'text')
    text.setAttribute('class', 'label')
    text.setAttribute('x', x); text.setAttribute('y', y - radius - 14)
    text.setAttribute('text-anchor', 'middle')
    text.textContent = label
    group.appendChild(text)
  }
  layer.appendChild(group)
  animateStrokes(group)
  fadeLater(group, holdMs)
}

window.drawDoodle = ({ svg, box, holdMs }) => {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
  const clean = parsed && cleanCopy(parsed)
  if (!clean || clean.localName !== 'svg') return false
  clean.setAttribute('x', box.x); clean.setAttribute('y', box.y)
  clean.setAttribute('width', box.width); clean.setAttribute('height', box.height)
  if (!clean.getAttribute('viewBox')) clean.setAttribute('viewBox', '0 0 400 400')
  for (const shape of clean.querySelectorAll('path,circle,ellipse,line,polyline,polygon,rect'))
    if (!shape.getAttribute('stroke')) shape.setAttribute('stroke', '#ff4fa3')
  const group = document.createElementNS(NS, 'g')
  group.setAttribute('class', 'drawing')
  group.setAttribute('style', 'fill:none;stroke-width:4;stroke-linecap:round;stroke-linejoin:round')
  group.appendChild(clean)
  layer.appendChild(group)
  animateStrokes(group)
  fadeLater(group, holdMs)
  return true
}
</script></body></html>`
