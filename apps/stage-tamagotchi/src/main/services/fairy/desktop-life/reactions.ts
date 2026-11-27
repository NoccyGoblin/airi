import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { array, object, optional, parse, string } from 'valibot'

import { FAIRY_DATA_DIR } from '../memory-files'

/**
 * FAIRY: the short lines in her bubble when something happens to her on the desktop, such as a throw or a nap.
 * They are personality, so they live in `fairy-data/reactions.json`, where the owner can change them. This file only
 * writes a first version.
 */

const REACTIONS_FILE = join(FAIRY_DATA_DIR, 'reactions.json')

const lines = optional(array(string()), [])
const reactionsSchema = object({
  thrown: lines,
  bounce: lines,
  landed: lines,
  sleep: lines,
  wake: lines,
  dance: lines,
})
export type Reactions = Record<keyof typeof reactionsSchema.entries, string[]>
export type ReactionKind = keyof Reactions

const FIRST_REACTIONS: Reactions = {
  thrown: ['Wheee!', 'Hey, rude!', 'Weeeee~', 'I can fly by myself, you know!'],
  bounce: ['Oof!', 'Ow!', 'Boing!'],
  landed: ['...dizzy.', 'Again! Again!', 'Hmph.'],
  sleep: ['💤 zzz…'],
  wake: ['*yawn* Oh, you\'re back!', 'Mmh… I wasn\'t sleeping!'],
  dance: ['♪ ♫', 'Ooh, this one\'s good!'],
}

let cached: Reactions | undefined

export async function loadReactions(): Promise<Reactions> {
  if (cached)
    return cached
  if (!existsSync(REACTIONS_FILE)) {
    await mkdir(FAIRY_DATA_DIR, { recursive: true })
    await writeFile(REACTIONS_FILE, `${JSON.stringify(FIRST_REACTIONS, null, 2)}\n`)
    cached = FIRST_REACTIONS
    return cached
  }
  cached = parse(reactionsSchema, JSON.parse(await readFile(REACTIONS_FILE, 'utf8')))
  return cached
}

/** One random line of a kind, or nothing when the owner left the kind empty. */
export function pickLine(reactions: Reactions, kind: ReactionKind, random: () => number = Math.random): string | undefined {
  const options = reactions[kind]
  return options.length ? options[Math.floor(random() * options.length)] : undefined
}
