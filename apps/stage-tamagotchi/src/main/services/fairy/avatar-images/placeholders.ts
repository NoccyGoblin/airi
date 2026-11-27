import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * FAIRY: simple placeholder drawings of a fairy, one per state, so sprite mode works before the owner has art. The
 * owner replaces them with their own images of the same names.
 */

type Eyes = 'open' | 'closed' | 'happy' | 'wide' | 'wink' | 'sad'
type Mouth = 'smile' | 'open' | 'grin' | 'sad' | 'o' | 'flat' | 'smirk'

const EYES: Record<Eyes, string> = {
  open: '<circle cx="86" cy="96" r="7" fill="#3b2a55"/><circle cx="114" cy="96" r="7" fill="#3b2a55"/><circle cx="88" cy="94" r="2.4" fill="#fff"/><circle cx="116" cy="94" r="2.4" fill="#fff"/>',
  closed: '<path d="M79 97 Q86 102 93 97 M107 97 Q114 102 121 97" stroke="#3b2a55" stroke-width="3" fill="none" stroke-linecap="round"/>',
  happy: '<path d="M79 99 Q86 90 93 99 M107 99 Q114 90 121 99" stroke="#3b2a55" stroke-width="3" fill="none" stroke-linecap="round"/>',
  wide: '<circle cx="86" cy="95" r="9" fill="#fff" stroke="#3b2a55" stroke-width="2"/><circle cx="114" cy="95" r="9" fill="#fff" stroke="#3b2a55" stroke-width="2"/><circle cx="86" cy="96" r="4" fill="#3b2a55"/><circle cx="114" cy="96" r="4" fill="#3b2a55"/>',
  wink: '<circle cx="86" cy="96" r="7" fill="#3b2a55"/><circle cx="88" cy="94" r="2.4" fill="#fff"/><path d="M107 97 Q114 91 121 97" stroke="#3b2a55" stroke-width="3" fill="none" stroke-linecap="round"/>',
  sad: '<path d="M79 93 L93 98 M107 98 L121 93" stroke="#3b2a55" stroke-width="3" stroke-linecap="round"/><circle cx="86" cy="100" r="5" fill="#3b2a55"/><circle cx="114" cy="100" r="5" fill="#3b2a55"/>',
}

const MOUTHS: Record<Mouth, string> = {
  smile: '<path d="M92 112 Q100 119 108 112" stroke="#b03a6b" stroke-width="3" fill="none" stroke-linecap="round"/>',
  open: '<ellipse cx="100" cy="115" rx="7" ry="8" fill="#b03a6b"/><ellipse cx="100" cy="119" rx="4" ry="3" fill="#ff8fb3"/>',
  grin: '<path d="M89 110 Q100 124 111 110 Z" fill="#b03a6b"/>',
  sad: '<path d="M92 117 Q100 110 108 117" stroke="#b03a6b" stroke-width="3" fill="none" stroke-linecap="round"/>',
  o: '<circle cx="100" cy="115" r="5" fill="#b03a6b"/>',
  flat: '<path d="M94 114 L106 114" stroke="#b03a6b" stroke-width="3" stroke-linecap="round"/>',
  smirk: '<path d="M92 114 Q102 118 110 109" stroke="#b03a6b" stroke-width="3" fill="none" stroke-linecap="round"/>',
}

function fairy(eyes: Eyes, mouth: Mouth, extra = '', tilt = 0) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220">
<g transform="rotate(${tilt} 100 120)">
<ellipse cx="58" cy="120" rx="34" ry="22" fill="#bfe8ff" opacity=".75" transform="rotate(-25 58 120)"/>
<ellipse cx="142" cy="120" rx="34" ry="22" fill="#bfe8ff" opacity=".75" transform="rotate(25 142 120)"/>
<ellipse cx="66" cy="148" rx="22" ry="13" fill="#d8c8ff" opacity=".7" transform="rotate(20 66 148)"/>
<ellipse cx="134" cy="148" rx="22" ry="13" fill="#d8c8ff" opacity=".7" transform="rotate(-20 134 148)"/>
<path d="M100 126 L74 190 Q100 200 126 190 Z" fill="#ff9ccf"/>
<path d="M88 190 L86 208 M112 190 L114 208" stroke="#ffd9c2" stroke-width="7" stroke-linecap="round"/>
<circle cx="100" cy="100" r="32" fill="#ffe3cf"/>
<path d="M68 98 Q66 58 100 60 Q134 58 132 98 Q124 76 100 76 Q76 76 68 98 Z" fill="#ffb3d9"/>
<circle cx="78" cy="108" r="6" fill="#ff9ccf" opacity=".5"/><circle cx="122" cy="108" r="6" fill="#ff9ccf" opacity=".5"/>
${EYES[eyes]}${MOUTHS[mouth]}
<path d="M100 60 Q104 44 116 40" stroke="#ffb3d9" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="118" cy="39" r="5" fill="#fff5a8"/>
</g>${extra}</svg>`
}

const NOTE = '<text x="160" y="50" font-size="26" fill="#ff4fa3">♪</text><text x="22" y="70" font-size="22" fill="#9b5cff">♫</text>'

export const PLACEHOLDERS: Record<string, string> = {
  idle: fairy('open', 'smile'),
  talk: fairy('open', 'open'),
  blink: fairy('closed', 'smile'),
  happy: fairy('happy', 'grin'),
  sad: fairy('sad', 'sad'),
  surprised: fairy('wide', 'o'),
  thinking: fairy('open', 'flat', '<text x="146" y="58" font-size="30" fill="#9b5cff">…</text>'),
  thrown: fairy('wide', 'open', '<path d="M18 60 L46 70 M14 90 L40 94 M20 120 L44 118" stroke="#9b5cff" stroke-width="4" stroke-linecap="round"/>', -25),
  landed: fairy('closed', 'flat', '<text x="140" y="56" font-size="24" fill="#ffcc33">★</text><text x="40" y="52" font-size="18" fill="#ffcc33">✦</text>', 8),
  sleeping: fairy('closed', 'o', '<text x="140" y="60" font-size="26" fill="#9b5cff">z</text><text x="158" y="40" font-size="20" fill="#9b5cff">z</text>'),
  dancing: fairy('happy', 'grin', NOTE, 10),
  mischief: fairy('wink', 'smirk', '<text x="150" y="56" font-size="26" fill="#ff4fa3">✧</text>'),
}

export async function writePlaceholderImages(folder: string) {
  await Promise.all(Object.entries(PLACEHOLDERS).map(([state, svg]) => writeFile(join(folder, `${state}.svg`), svg)))
}
