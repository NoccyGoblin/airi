import type { FigurePose } from './elf-figure'

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { elfFigure } from './elf-figure'

/**
 * FAIRY: placeholder drawings of a full-body elf faery, one per state, so sprite mode works before the owner has art.
 * Each is an animated SVG: her wings flutter and sparkles twinkle. The owner replaces them with their own images of
 * the same names. A file that still holds {@link PLACEHOLDER_MARK} is ours, so a newer version can replace it.
 */

export const PLACEHOLDER_MARK = '<!-- fairy placeholder -->'

const NOTES = '<text x="172" y="70" font-size="26" fill="#5cc4a0">♪</text><text x="22" y="96" font-size="22" fill="#a98cf0">♫</text>'
const SPEED = '<path d="M14 120 L44 132 M8 160 L38 164 M14 200 L42 196" stroke="#a98cf0" stroke-width="4" stroke-linecap="round"/>'
const DIZZY = '<text x="150" y="40" font-size="20" fill="#f2c766">★</text><text x="56" y="34" font-size="16" fill="#f2c766">✦</text><text x="168" y="22" font-size="14" fill="#f2c766">✦</text>'
const SLEEP = '<text x="150" y="40" font-size="24" fill="#a98cf0">z</text><text x="168" y="22" font-size="18" fill="#a98cf0">z</text><text x="182" y="8" font-size="14" fill="#a98cf0">z</text>'
const THOUGHT = '<circle cx="152" cy="40" r="4" fill="#cfbaff"/><circle cx="164" cy="28" r="6" fill="#cfbaff"/><circle cx="180" cy="14" r="9" fill="#cfbaff"/>'
const TEAR = '<path d="M127 70 q4 8 0 10 q-4 -2 0 -10 Z" fill="#9fe3ff"/>'

const POSES: Record<string, Omit<FigurePose, 'mark'>> = {
  idle: { eyes: 'open', mouth: 'smile', arms: 'hip' },
  talk: { eyes: 'open', mouth: 'open', arms: 'hip' },
  blink: { eyes: 'closed', mouth: 'smile', arms: 'hip' },
  happy: { eyes: 'happy', mouth: 'grin', arms: 'up', blush: 0.7, flutter: 0.35 },
  sad: { eyes: 'sad', mouth: 'sad', arms: 'clasp', legs: 'together', flutter: 1.2, blush: 0.25, extra: TEAR },
  surprised: { eyes: 'wide', mouth: 'o', arms: 'mouth', flutter: 0.25 },
  thinking: { eyes: 'side', mouth: 'flat', arms: 'chin', flutter: 0.9, extra: THOUGHT },
  thrown: { eyes: 'wide', mouth: 'open', arms: 'out', legs: 'kick', tilt: -16, flutter: 0.15, extra: SPEED },
  landed: { eyes: 'closed', mouth: 'flat', arms: 'tucked', legs: 'together', tilt: 5, flutter: 1, extra: DIZZY },
  sleeping: { eyes: 'closed', mouth: 'o', arms: 'tucked', legs: 'together', tilt: 4, flutter: 2.4, blush: 0.6, extra: SLEEP },
  dancing: { eyes: 'happy', mouth: 'grin', arms: 'up', legs: 'step', tilt: 6, blush: 0.7, flutter: 0.3, extra: NOTES },
  mischief: { eyes: 'wink', mouth: 'smirk', arms: 'wave', blush: 0.6, flutter: 0.4 },
}

export const PLACEHOLDERS: Record<string, string> = Object.fromEntries(
  Object.entries(POSES).map(([state, pose]) => [state, elfFigure({ ...pose, mark: PLACEHOLDER_MARK })]),
)

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
