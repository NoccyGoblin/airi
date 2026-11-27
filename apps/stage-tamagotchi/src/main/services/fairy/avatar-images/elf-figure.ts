/**
 * FAIRY: a full-body elf faery drawn in SVG, about six and a half heads tall. Her arms and legs are bent limbs, so
 * each state can have its own pose: a hand on her hip, a wave, a hand at her chin, arms up, and more.
 */

export type Eyes = 'open' | 'closed' | 'happy' | 'wide' | 'wink' | 'sad' | 'side'
export type Mouth = 'smile' | 'open' | 'grin' | 'sad' | 'o' | 'flat' | 'smirk'
export type Arms = 'hip' | 'wave' | 'chin' | 'mouth' | 'up' | 'clasp' | 'out' | 'tucked'
export type Legs = 'stand' | 'kick' | 'together' | 'step'

interface Point {
  x: number
  y: number
}

const SKIN = '#f8d6c4'
const LINE = '#46345e'
const SHOULDER_L: Point = { x: 92, y: 108 }
const SHOULDER_R: Point = { x: 128, y: 106 }
const HIP_L: Point = { x: 104, y: 236 }
const HIP_R: Point = { x: 120, y: 236 }

/** A bent limb from `from` through `joint` to `to`, with a dark outline under the skin. */
function limb(from: Point, joint: Point, to: Point, width: number, color = SKIN) {
  const d = `M${from.x} ${from.y} Q${joint.x * 2 - (from.x + to.x) / 2} ${joint.y * 2 - (from.y + to.y) / 2} ${to.x} ${to.y}`
  return `<path d="${d}" stroke="${LINE}" stroke-width="${width + 2.4}" stroke-linecap="round" fill="none"/>`
    + `<path d="${d}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" fill="none"/>`
}

/** A small hand: a palm and a thumb, turned by `angle` degrees. */
function hand(at: Point, angle: number) {
  return `<g transform="translate(${at.x} ${at.y}) rotate(${angle})">`
    + `<ellipse rx="5.2" ry="6.4" fill="${SKIN}" stroke="${LINE}" stroke-width="1.1"/>`
    + `<ellipse cx="4.6" cy="-2" rx="2.2" ry="3.4" fill="${SKIN}" stroke="${LINE}" stroke-width="1" transform="rotate(-30 4.6 -2)"/></g>`
}

/** A puffed sleeve over a shoulder. */
function sleeve(at: Point, side: 1 | -1) {
  return `<path d="M${at.x - 9 * side} ${at.y - 6} Q${at.x + 10 * side} ${at.y - 10} ${at.x + 12 * side} ${at.y + 8} Q${at.x + 2 * side} ${at.y + 16} ${at.x - 8 * side} ${at.y + 10} Z" fill="#53b892" stroke="${LINE}" stroke-width="1.1"/>`
    + `<path d="M${at.x + 11 * side} ${at.y + 7} Q${at.x + 2 * side} ${at.y + 14} ${at.x - 7 * side} ${at.y + 9}" stroke="#f2c766" stroke-width="1.4" fill="none"/>`
}

/** Elbow and hand of the left and right arm for each pose. */
const ARM_POSES: Record<Arms, { left: [Point, Point, number], right: [Point, Point, number] }> = {
  hip: { left: [{ x: 82, y: 150 }, { x: 86, y: 196 }, 5], right: [{ x: 148, y: 136 }, { x: 134, y: 162 }, 120] },
  wave: { left: [{ x: 82, y: 150 }, { x: 86, y: 196 }, 5], right: [{ x: 152, y: 88 }, { x: 160, y: 56 }, -20] },
  chin: { left: [{ x: 86, y: 148 }, { x: 116, y: 150 }, 80], right: [{ x: 140, y: 142 }, { x: 120, y: 92 }, -150] },
  mouth: { left: [{ x: 80, y: 138 }, { x: 102, y: 88 }, 170], right: [{ x: 140, y: 138 }, { x: 118, y: 88 }, -170] },
  up: { left: [{ x: 68, y: 86 }, { x: 62, y: 54 }, 20], right: [{ x: 152, y: 86 }, { x: 158, y: 54 }, -20] },
  clasp: { left: [{ x: 86, y: 154 }, { x: 106, y: 178 }, 60], right: [{ x: 134, y: 152 }, { x: 114, y: 178 }, -60] },
  out: { left: [{ x: 62, y: 116 }, { x: 34, y: 108 }, 100], right: [{ x: 158, y: 114 }, { x: 186, y: 104 }, -100] },
  tucked: { left: [{ x: 86, y: 150 }, { x: 100, y: 168 }, 60], right: [{ x: 134, y: 150 }, { x: 120, y: 168 }, -60] },
}

/** Knee and ankle of the left and right leg for each stance. */
const LEG_POSES: Record<Legs, { left: [Point, Point], right: [Point, Point] }> = {
  stand: { left: [{ x: 102, y: 326 }, { x: 101, y: 396 }], right: [{ x: 124, y: 322 }, { x: 130, y: 392 }] },
  together: { left: [{ x: 106, y: 326 }, { x: 106, y: 396 }], right: [{ x: 118, y: 326 }, { x: 118, y: 396 }] },
  step: { left: [{ x: 97, y: 324 }, { x: 92, y: 392 }], right: [{ x: 126, y: 322 }, { x: 136, y: 390 }] },
  kick: { left: [{ x: 101, y: 326 }, { x: 99, y: 396 }], right: [{ x: 138, y: 310 }, { x: 160, y: 348 }] },
}

function boot(at: Point, angle: number) {
  return `<path d="M-7 -6 L7 -6 L8 4 Q14 6 14 10 L-8 10 Z" fill="#7a5a3e" stroke="${LINE}" stroke-width="1.1" transform="translate(${at.x} ${at.y}) rotate(${angle})"/>`
}

function eye(cx: number) {
  return `<ellipse cx="${cx}" cy="66" rx="4.8" ry="6.2" fill="url(#iris)" stroke="${LINE}" stroke-width=".8"/><ellipse cx="${cx}" cy="67.6" rx="2.1" ry="2.9" fill="#123d33"/>`
    + `<circle cx="${cx + 1.6}" cy="64" r="1.6" fill="#fff"/><circle cx="${cx - 1.8}" cy="69" r=".8" fill="#fff" opacity=".8"/>`
    + `<path d="M${cx - 6} 60.6 Q${cx} 56.8 ${cx + 6} 60.4" stroke="${LINE}" stroke-width="1.9" fill="none" stroke-linecap="round"/>`
}

function shut(cx: number, smile: boolean) {
  return `<path d="M${cx - 5.5} 66 Q${cx} ${smile ? 60.5 : 70} ${cx + 5.5} 66" stroke="${LINE}" stroke-width="2" fill="none" stroke-linecap="round"/>`
}

const EYES: Record<Eyes, string> = {
  open: eye(99) + eye(121),
  closed: shut(99, false) + shut(121, false),
  happy: shut(99, true) + shut(121, true),
  wide: `<ellipse cx="99" cy="65.5" rx="5.8" ry="7.4" fill="#fff" stroke="${LINE}" stroke-width="1.2"/><ellipse cx="121" cy="65.5" rx="5.8" ry="7.4" fill="#fff" stroke="${LINE}" stroke-width="1.2"/><circle cx="99" cy="66" r="2.8" fill="url(#iris)"/><circle cx="121" cy="66" r="2.8" fill="url(#iris)"/>`,
  wink: eye(99) + shut(121, true),
  sad: `${eye(99) + eye(121)}<path d="M93 56 L104 59.5 M116 59.5 L127 56" stroke="${LINE}" stroke-width="1.6" stroke-linecap="round"/>`,
  side: `<ellipse cx="99" cy="66" rx="4.8" ry="6.2" fill="#fff" stroke="${LINE}" stroke-width=".9"/><ellipse cx="121" cy="66" rx="4.8" ry="6.2" fill="#fff" stroke="${LINE}" stroke-width=".9"/><circle cx="102" cy="64" r="3" fill="url(#iris)"/><circle cx="124" cy="64" r="3" fill="url(#iris)"/>`,
}

const MOUTHS: Record<Mouth, string> = {
  smile: '<path d="M105.5 80.5 Q110 83.5 114.5 80.5" stroke="#b5476e" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
  open: '<path d="M105 79.5 Q110 88 115 79.5 Z" fill="#a83a63" stroke="#7c2547" stroke-width=".8"/><path d="M107.5 84 Q110 86 112.5 84" fill="#ff9bb8"/>',
  grin: '<path d="M104 79 Q110 87.5 116 79 Z" fill="#a83a63" stroke="#7c2547" stroke-width=".8"/><path d="M105 79.6 L115 79.6" stroke="#fff" stroke-width="1.4"/>',
  sad: '<path d="M106 83 Q110 79.5 114 83" stroke="#b5476e" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
  o: '<ellipse cx="110" cy="82" rx="2.6" ry="3.3" fill="#a83a63"/>',
  flat: '<path d="M106.5 81.5 L113.5 81.5" stroke="#b5476e" stroke-width="1.7" stroke-linecap="round"/>',
  smirk: '<path d="M105 81.5 Q111 84 115.5 78.5" stroke="#b5476e" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
}

const DEFS = `<defs>
<radialGradient id="glow" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#b8ffe4" stop-opacity=".42"/><stop offset="1" stop-color="#b8ffe4" stop-opacity="0"/></radialGradient>
<linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0e6"/><stop offset="1" stop-color="#f3c6b2"/></linearGradient>
<linearGradient id="hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f1ff"/><stop offset=".35" stop-color="#d3c0ff"/><stop offset="1" stop-color="#8b74d4"/></linearGradient>
<linearGradient id="dress" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#66cca8"/><stop offset=".6" stop-color="#3c9c82"/><stop offset="1" stop-color="#25705e"/></linearGradient>
<linearGradient id="sheer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9ffe9" stop-opacity=".5"/><stop offset="1" stop-color="#c9ffe9" stop-opacity=".12"/></linearGradient>
<linearGradient id="wing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2fcff" stop-opacity=".85"/><stop offset=".5" stop-color="#e3d2ff" stop-opacity=".5"/><stop offset="1" stop-color="#b9ffe0" stop-opacity=".3"/></linearGradient>
<radialGradient id="iris" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#86f3cb"/><stop offset="1" stop-color="#1c7f63"/></radialGradient>
</defs>`

function wings(flutter: number) {
  const one = (side: 1 | -1) => `<g transform="translate(${110 + side * 6} 128)"><g><animateTransform attributeName="transform" type="rotate" values="0;${side * -12};0" dur="${flutter}s" repeatCount="indefinite"/>
<path d="M0 0 C${side * 30} -60 ${side * 88} -110 ${side * 100} -86 C${side * 108} -66 ${side * 64} -20 0 0 Z" fill="url(#wing)" stroke="#fff" stroke-opacity=".8" stroke-width="1.2"/>
<path d="M0 8 C${side * 26} 40 ${side * 76} 104 ${side * 90} 92 C${side * 100} 80 ${side * 60} 30 0 8 Z" fill="url(#wing)" stroke="#fff" stroke-opacity=".75" stroke-width="1.1"/>
<path d="M0 0 Q${side * 52} -46 ${side * 96} -84 M${side * 30} -22 Q${side * 52} -54 ${side * 74} -84 M0 8 Q${side * 44} 46 ${side * 84} 88" stroke="#fff" stroke-opacity=".5" stroke-width=".8" fill="none"/></g></g>`
  return one(-1) + one(1)
}

function sparkle(x: number, y: number, size: number, delay: number, color: string) {
  return `<path d="M${x} ${y - size} Q${x} ${y} ${x + size} ${y} Q${x} ${y} ${x} ${y + size} Q${x} ${y} ${x - size} ${y} Q${x} ${y} ${x} ${y - size} Z" fill="${color}"><animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="${delay}s" repeatCount="indefinite"/></path>`
}

export interface FigurePose {
  eyes: Eyes
  mouth: Mouth
  arms: Arms
  legs?: Legs
  tilt?: number
  /** Seconds for one wing beat. */
  flutter?: number
  blush?: number
  /** Drawn over her, outside the tilt: notes, letters, or lines. */
  extra?: string
  mark: string
}

export function elfFigure(pose: FigurePose) {
  const { eyes, mouth, arms, legs = 'stand', tilt = 0, flutter = 0.6, blush = 0.42, extra = '', mark } = pose
  const armPose = ARM_POSES[arms]
  const legPose = LEG_POSES[legs]
  const armsBehind = arms === 'hip' || arms === 'wave' || arms === 'out' || arms === 'up'
  const drawArms = limb(SHOULDER_L, armPose.left[0], armPose.left[1], 7.4) + hand(armPose.left[1], armPose.left[2])
    + limb(SHOULDER_R, armPose.right[0], armPose.right[1], 7.4) + hand(armPose.right[1], armPose.right[2])
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 440">${mark}${DEFS}
<ellipse cx="110" cy="210" rx="106" ry="196" fill="url(#glow)"/>
${sparkle(30, 96, 6, 0, '#fff6c2')}${sparkle(194, 168, 5, 1, '#c9ffe6')}${sparkle(36, 310, 4, 1.6, '#e7d8ff')}
<g transform="rotate(${tilt} 110 220)">
${wings(flutter)}
<path d="M84 52 Q70 124 76 206 Q84 236 98 242 Q92 184 98 122 Z M136 52 Q150 124 144 206 Q136 236 122 242 Q128 184 122 122 Z" fill="url(#hair)" stroke="${LINE}" stroke-width="1"/>
<path d="M86 50 Q110 30 134 50 Q140 112 132 152 L88 152 Q80 112 86 50 Z" fill="#9e88df"/>
${limb(HIP_L, legPose.left[0], legPose.left[1], 14)}${limb(HIP_R, legPose.right[0], legPose.right[1], 14)}
${boot(legPose.left[1], 0)}${boot(legPose.right[1], legs === 'kick' ? -60 : 0)}
${armsBehind ? drawArms : ''}
<path d="M96 104 Q110 100 124 104 L127 140 Q126 150 121 156 Q140 212 152 276 Q158 306 148 312 Q140 304 132 314 Q124 304 116 314 Q108 304 100 314 Q92 304 84 312 Q72 306 78 276 Q86 212 99 156 Q94 150 93 140 Z" fill="url(#dress)" stroke="${LINE}" stroke-width="1.2"/>
<path d="M122 158 Q140 214 150 276 Q152 296 146 306 Q140 300 134 306 Q138 250 116 170 Z" fill="#25705e" opacity=".35"/>
<path d="M84 312 Q92 304 100 314 Q108 304 116 314 Q124 304 132 314 Q140 304 148 312" stroke="#f2c766" stroke-width="2" fill="none"/>
<path d="M102 162 Q92 236 88 306 M118 162 Q128 236 140 306" stroke="#2c7f69" stroke-width="1.1" opacity=".65" fill="none"/>
<path d="M99 156 Q76 232 70 302 Q80 316 96 306 Q90 244 105 170 Z" fill="url(#sheer)"/>
<path d="M121 156 Q144 232 152 302 Q142 316 126 306 Q132 244 115 170 Z" fill="url(#sheer)"/>
<path d="M95 150 Q110 158 125 150" stroke="#f2c766" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="110" cy="155" r="3.4" fill="#9ff0d0" stroke="#f2c766" stroke-width="1.2"/>
<path d="M98 104 Q110 116 122 104" stroke="#f2c766" stroke-width="1.6" fill="none"/>
${sleeve(SHOULDER_L, -1)}${sleeve(SHOULDER_R, 1)}
${armsBehind ? '' : drawArms}
<path d="M104 86 L116 86 L115 102 Q110 106 105 102 Z" fill="#efc0aa" stroke="${LINE}" stroke-width=".8"/>
<path d="M86 60 L64 44 Q70 58 86 71 Z" fill="url(#skin)" stroke="${LINE}" stroke-width="1"/><path d="M83 61 L71 51 Q75 60 84 66 Z" fill="#f2b0a2" opacity=".7"/>
<path d="M134 60 L156 44 Q150 58 134 71 Z" fill="url(#skin)" stroke="${LINE}" stroke-width="1"/><path d="M137 61 L149 51 Q145 60 136 66 Z" fill="#f2b0a2" opacity=".7"/>
<path d="M86 56 Q86 34 110 32 Q134 34 134 56 Q134 76 124 86 Q117 93 110 93 Q103 93 96 86 Q86 76 86 56 Z" fill="url(#skin)" stroke="${LINE}" stroke-width="1.1"/>
<path d="M84 60 Q80 26 110 22 Q140 26 136 60 Q132 46 124 42 Q126 52 118 54 Q118 44 110 40 Q104 52 96 54 Q98 44 94 42 Q86 48 84 60 Z" fill="url(#hair)" stroke="${LINE}" stroke-width="1.1"/>
<path d="M85 58 Q84 82 91 100 Q86 78 90 60 Z M135 58 Q136 82 129 100 Q134 78 130 60 Z" fill="url(#hair)" stroke="${LINE}" stroke-width=".9"/>
<path d="M96 30 Q108 24 122 28 M100 36 Q106 33 112 34" stroke="#fff" stroke-opacity=".7" stroke-width="1.8" fill="none" stroke-linecap="round"/>
<path d="M86 42 Q110 26 134 42" stroke="#f2c766" stroke-width="2.2" fill="none"/>
<path d="M92 36 q5 -7 11 0 q-5 7 -11 0 Z" fill="#7fd6a8" stroke="${LINE}" stroke-width=".6" transform="rotate(-25 92 36)"/>
<path d="M118 32 q5 -7 11 0 q-5 7 -11 0 Z" fill="#a7e8c4" stroke="${LINE}" stroke-width=".6" transform="rotate(15 118 32)"/>
<path d="M110 26 l4 5 l-4 5 l-4 -5 Z" fill="#7ef0c4" stroke="#f2c766" stroke-width="1"/>
<ellipse cx="94" cy="75" rx="4.4" ry="2.5" fill="#ff8fb0" opacity="${blush}"/><ellipse cx="126" cy="75" rx="4.4" ry="2.5" fill="#ff8fb0" opacity="${blush}"/>
<path d="M110 70 Q109 74 111 75" stroke="#e2ab96" stroke-width="1" fill="none"/>
${EYES[eyes]}${MOUTHS[mouth]}
</g>${extra}</svg>`
}
