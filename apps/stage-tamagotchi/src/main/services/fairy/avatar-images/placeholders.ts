import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * FAIRY: placeholder drawings of an elf faery, one per state, so sprite mode works before the owner has art. Each is
 * an animated SVG: her wings flutter and sparkles twinkle. The owner replaces them with their own images of the same
 * names. A file that still holds {@link PLACEHOLDER_MARK} is ours, so a newer version can replace it.
 */

export const PLACEHOLDER_MARK = '<!-- fairy placeholder -->'

type Eyes = 'open' | 'closed' | 'happy' | 'wide' | 'wink' | 'sad' | 'side'
type Mouth = 'smile' | 'open' | 'grin' | 'sad' | 'o' | 'flat' | 'smirk'

const IRIS = 'url(#iris)'

function eye(cx: number) {
  return `<ellipse cx="${cx}" cy="100" rx="6.5" ry="8.5" fill="${IRIS}"/><ellipse cx="${cx}" cy="102" rx="3" ry="4" fill="#123d33"/>`
    + `<circle cx="${cx + 2}" cy="97" r="2.4" fill="#fff"/><circle cx="${cx - 2.5}" cy="104" r="1.1" fill="#fff" opacity=".8"/>`
    + `<path d="M${cx - 8} 93 Q${cx} 88 ${cx + 8} 93" stroke="#4a3566" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
}

function closedEye(cx: number, up = false) {
  const y = up ? 101 : 100
  return `<path d="M${cx - 7} ${y} Q${cx} ${up ? 94 : 105} ${cx + 7} ${y}" stroke="#4a3566" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
}

const EYES: Record<Eyes, string> = {
  open: eye(86) + eye(114),
  closed: closedEye(86) + closedEye(114),
  happy: closedEye(86, true) + closedEye(114, true),
  wide: `<ellipse cx="86" cy="99" rx="8" ry="10" fill="#fff" stroke="#4a3566" stroke-width="1.6"/><ellipse cx="114" cy="99" rx="8" ry="10" fill="#fff" stroke="#4a3566" stroke-width="1.6"/>`
    + `<circle cx="86" cy="100" r="4" fill="${IRIS}"/><circle cx="114" cy="100" r="4" fill="${IRIS}"/><circle cx="87.5" cy="98.5" r="1.4" fill="#fff"/><circle cx="115.5" cy="98.5" r="1.4" fill="#fff"/>`,
  wink: eye(86) + closedEye(114, true),
  sad: `${eye(86) + eye(114)}<path d="M78 89 L92 93 M108 93 L122 89" stroke="#4a3566" stroke-width="2.2" stroke-linecap="round"/>`,
  side: `<ellipse cx="86" cy="100" rx="6.5" ry="8.5" fill="#fff" stroke="#4a3566" stroke-width="1.2"/><ellipse cx="114" cy="100" rx="6.5" ry="8.5" fill="#fff" stroke="#4a3566" stroke-width="1.2"/>`
    + `<circle cx="90" cy="98" r="4" fill="${IRIS}"/><circle cx="118" cy="98" r="4" fill="${IRIS}"/>`,
}

const MOUTHS: Record<Mouth, string> = {
  smile: '<path d="M94 116 Q100 120 106 116" stroke="#b5476e" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
  open: '<path d="M93 114 Q100 126 107 114 Z" fill="#a83a63"/><path d="M96 120 Q100 123 104 120" fill="#ff9bb8"/>',
  grin: '<path d="M91 113 Q100 125 109 113 Z" fill="#a83a63"/><path d="M93 114 L107 114" stroke="#fff" stroke-width="2"/>',
  sad: '<path d="M94 119 Q100 114 106 119" stroke="#b5476e" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
  o: '<ellipse cx="100" cy="118" rx="3.5" ry="4.5" fill="#a83a63"/>',
  flat: '<path d="M95 117 L105 117" stroke="#b5476e" stroke-width="2.2" stroke-linecap="round"/>',
  smirk: '<path d="M93 117 Q102 120 108 112" stroke="#b5476e" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
}

const DEFS = `<defs>
<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#b8ffe4" stop-opacity=".55"/><stop offset="1" stop-color="#b8ffe4" stop-opacity="0"/></radialGradient>
<radialGradient id="skin" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#fff1e7"/><stop offset="1" stop-color="#f6cdb9"/></radialGradient>
<linearGradient id="hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6efff"/><stop offset=".45" stop-color="#cfbaff"/><stop offset="1" stop-color="#8f7ad6"/></linearGradient>
<linearGradient id="dress" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5cc4a0"/><stop offset="1" stop-color="#2a7a68"/></linearGradient>
<linearGradient id="wing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8fbff" stop-opacity=".9"/><stop offset=".5" stop-color="#e5d4ff" stop-opacity=".55"/><stop offset="1" stop-color="#b9ffe0" stop-opacity=".35"/></linearGradient>
<radialGradient id="iris" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#7ef0c4"/><stop offset="1" stop-color="#1f8a6b"/></radialGradient>
</defs>`

function wing(side: 1 | -1, flutterSeconds: number) {
  const s = side
  const upper = `M0 0 C${s * 30} -48 ${s * 82} -70 ${s * 96} -52 C${s * 104} -40 ${s * 70} -12 0 0 Z`
  const lower = `M0 4 C${s * 24} 24 ${s * 66} 52 ${s * 76} 42 C${s * 84} 32 ${s * 54} 10 0 4 Z`
  const veins = `M0 0 Q${s * 50} -30 ${s * 92} -50 M${s * 30} -14 Q${s * 52} -36 ${s * 70} -56 M0 4 Q${s * 40} 22 ${s * 72} 40`
  return `<g transform="translate(${100 + s * 6} 136) scale(.86)"><g>
<animateTransform attributeName="transform" type="rotate" values="0;${s * -14};0" dur="${flutterSeconds}s" repeatCount="indefinite"/>
<path d="${upper}" fill="url(#wing)" stroke="#ffffff" stroke-opacity=".85" stroke-width="1.4"/>
<path d="${lower}" fill="url(#wing)" stroke="#ffffff" stroke-opacity=".8" stroke-width="1.2"/>
<path d="${veins}" stroke="#ffffff" stroke-opacity=".55" stroke-width=".9" fill="none"/>
</g></g>`
}

function sparkle(x: number, y: number, size: number, delay: number, color = '#fff6c2') {
  return `<path d="M${x} ${y - size} Q${x} ${y} ${x + size} ${y} Q${x} ${y} ${x} ${y + size} Q${x} ${y} ${x - size} ${y} Q${x} ${y} ${x} ${y - size} Z" fill="${color}">`
    + `<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="${delay}s" repeatCount="indefinite"/></path>`
}

function leaf(x: number, y: number, rotate: number, color = '#7fd6a8') {
  return `<path d="M${x} ${y} q6 -8 14 0 q-6 8 -14 0 Z" fill="${color}" transform="rotate(${rotate} ${x} ${y})"/>`
}

interface Pose {
  eyes: Eyes
  mouth: Mouth
  /** Drawn on top, for example notes, sweat, or sleep letters. */
  extra?: string
  tilt?: number
  /** Seconds for one wing beat. Slower when calm. */
  flutter?: number
  blush?: number
}

function elf({ eyes, mouth, extra = '', tilt = 0, flutter = 0.5, blush = 0.45 }: Pose) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240">${PLACEHOLDER_MARK}${DEFS}
<circle cx="100" cy="128" r="96" fill="url(#glow)"/>
${sparkle(34, 60, 6, 0)}${sparkle(168, 92, 5, 0.8)}${sparkle(156, 196, 4, 1.6, '#c9ffe6')}${sparkle(40, 170, 4, 1.1, '#e7d8ff')}
${leaf(24, 120, -30)}${leaf(170, 150, 40, '#a7e8c4')}
<g transform="rotate(${tilt} 100 140)">
${wing(-1, flutter)}${wing(1, flutter)}
<path d="M64 92 Q58 150 70 188 Q86 176 92 140 Z M136 92 Q142 150 130 188 Q114 176 108 140 Z" fill="url(#hair)"/>
<path d="M90 196 L88 222 Q88 228 82 228 L94 228 Q96 222 95 196 Z M110 196 L112 222 Q112 228 118 228 L106 228 Q104 222 105 196 Z" fill="#f6cdb9"/>
<path d="M80 226 Q86 222 94 226 L94 230 L80 230 Z M106 226 Q114 222 120 226 L120 230 L106 230 Z" fill="#6b4a3a"/>
<path d="M86 134 Q100 128 114 134 L120 168 Q138 196 132 202 Q124 198 118 204 Q112 198 106 205 Q100 198 94 205 Q88 198 82 204 Q76 198 68 202 Q62 196 80 168 Z" fill="url(#dress)"/>
<path d="M68 202 Q76 198 82 204 Q88 198 94 205 Q100 198 106 205 Q112 198 118 204 Q124 198 132 202" stroke="#f2c766" stroke-width="2" fill="none"/>
<path d="M84 150 Q100 156 116 150" stroke="#f2c766" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="100" cy="154" r="3" fill="#9ff0d0" stroke="#f2c766" stroke-width="1.2"/>
<path d="M86 136 Q76 150 74 166 Q78 170 82 166 Q84 152 90 142 Z M114 136 Q124 150 126 166 Q122 170 118 166 Q116 152 110 142 Z" fill="#4db08f"/>
<circle cx="78" cy="168" r="4" fill="#f6cdb9"/><circle cx="122" cy="168" r="4" fill="#f6cdb9"/>
<path d="M95 126 L105 126 L104 134 L96 134 Z" fill="#f6cdb9"/>
<path d="M66 100 L44 84 Q50 98 66 110 Z" fill="url(#skin)" stroke="#e8b39f" stroke-width="1"/><path d="M62 101 L50 92 Q54 100 63 106 Z" fill="#f2b4a7" opacity=".7"/>
<path d="M134 100 L156 84 Q150 98 134 110 Z" fill="url(#skin)" stroke="#e8b39f" stroke-width="1"/><path d="M138 101 L150 92 Q146 100 137 106 Z" fill="#f2b4a7" opacity=".7"/>
<circle cx="100" cy="102" r="34" fill="url(#skin)"/>
<path d="M66 100 Q62 62 100 60 Q138 62 134 100 Q130 84 120 78 Q122 90 112 92 Q114 82 104 78 Q100 90 88 90 Q92 80 84 78 Q72 86 66 100 Z" fill="url(#hair)"/>
<path d="M78 72 Q90 64 104 66" stroke="#ffffff" stroke-opacity=".7" stroke-width="2.4" fill="none" stroke-linecap="round"/>
<path d="M70 76 Q100 60 130 76" stroke="#f2c766" stroke-width="2.6" fill="none"/>
${leaf(78, 70, -20)}${leaf(110, 64, 10)}${leaf(92, 64, -5, '#9ff0c4')}
<path d="M100 62 l5 6 l-5 6 l-5 -6 Z" fill="#7ef0c4" stroke="#f2c766" stroke-width="1.2"/>
<ellipse cx="80" cy="112" rx="7" ry="4" fill="#ff8fb0" opacity="${blush}"/><ellipse cx="120" cy="112" rx="7" ry="4" fill="#ff8fb0" opacity="${blush}"/>
${EYES[eyes]}${MOUTHS[mouth]}
</g>${extra}</svg>`
}

const NOTES = '<text x="160" y="56" font-size="24" fill="#5cc4a0">♪</text><text x="22" y="76" font-size="20" fill="#a98cf0">♫</text>'

export const PLACEHOLDERS: Record<string, string> = {
  idle: elf({ eyes: 'open', mouth: 'smile', flutter: 0.6 }),
  talk: elf({ eyes: 'open', mouth: 'open', flutter: 0.6 }),
  blink: elf({ eyes: 'closed', mouth: 'smile', flutter: 0.6 }),
  happy: elf({ eyes: 'happy', mouth: 'grin', blush: 0.7, flutter: 0.35 }),
  sad: elf({ eyes: 'sad', mouth: 'sad', blush: 0.25, flutter: 1.2, extra: '<path d="M126 104 q4 8 0 10 q-4 -2 0 -10 Z" fill="#9fe3ff"/>' }),
  surprised: elf({ eyes: 'wide', mouth: 'o', flutter: 0.25, extra: '<text x="150" y="60" font-size="28" font-weight="700" fill="#f2c766">!</text>' }),
  thinking: elf({ eyes: 'side', mouth: 'flat', flutter: 0.9, extra: '<circle cx="150" cy="66" r="4" fill="#cfbaff"/><circle cx="160" cy="54" r="6" fill="#cfbaff"/><circle cx="174" cy="40" r="9" fill="#cfbaff"/>' }),
  thrown: elf({ eyes: 'wide', mouth: 'open', tilt: -28, flutter: 0.15, extra: '<path d="M16 70 L44 80 M10 100 L38 104 M16 132 L42 128" stroke="#a98cf0" stroke-width="4" stroke-linecap="round"/>' }),
  landed: elf({ eyes: 'closed', mouth: 'flat', tilt: 8, flutter: 1, extra: '<text x="142" y="62" font-size="20" fill="#f2c766">★</text><text x="40" y="58" font-size="16" fill="#f2c766">✦</text><text x="156" y="44" font-size="14" fill="#f2c766">✦</text>' }),
  sleeping: elf({ eyes: 'closed', mouth: 'o', flutter: 2.4, blush: 0.6, extra: '<text x="142" y="64" font-size="22" fill="#a98cf0">z</text><text x="158" y="46" font-size="17" fill="#a98cf0">z</text><text x="171" y="32" font-size="13" fill="#a98cf0">z</text>' }),
  dancing: elf({ eyes: 'happy', mouth: 'grin', tilt: 10, flutter: 0.3, blush: 0.7, extra: NOTES }),
  mischief: elf({ eyes: 'wink', mouth: 'smirk', flutter: 0.4, blush: 0.6, extra: '<text x="146" y="60" font-size="24" fill="#5cc4a0">✧</text>' }),
}

export async function writePlaceholderImages(folder: string) {
  await Promise.all(Object.entries(PLACEHOLDERS).map(([state, svg]) => writeFile(join(folder, `${state}.svg`), svg)))
}

/**
 * Replaces our own older placeholders with this version. A file without the mark, or an image the owner made,
 * stays as it is.
 */
export async function upgradePlaceholderImages(folder: string, isOurs: (content: string) => boolean) {
  for (const [state, svg] of Object.entries(PLACEHOLDERS)) {
    const path = join(folder, `${state}.svg`)
    const content = await readFile(path, 'utf8').catch(() => undefined)
    if (content !== undefined && content !== svg && isOurs(content))
      await writeFile(path, svg)
  }
}
