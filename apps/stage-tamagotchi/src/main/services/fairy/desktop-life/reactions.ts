import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { array, object, optional, parse, string } from 'valibot'

import { FAIRY_DATA_DIR } from '../memory-files'

/**
 * FAIRY: the short lines in her bubble when something happens to her on the desktop, such as a throw or a nap.
 * They are personality, so each character has her own file in `fairy-data/reactions/`, where the owner can change
 * them. This file only writes a first version. `{name}` in a line becomes the character's name.
 */

const REACTIONS_DIR = join(FAIRY_DATA_DIR, 'reactions')

const lines = optional(array(string()))
const reactionsSchema = object({
  thrown: lines,
  bounce: lines,
  landed: lines,
  sleep: lines,
  wake: lines,
  dance: lines,
  prankHide: lines,
  prankTug: lines,
  prankPopup: lines,
  prankDoodle: lines,
  prankNote: lines,
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
  prankHide: ['You can\'t see me~', 'Hide and seek! You\'re it!'],
  prankTug: ['Hehe, your mouse is mine now.', 'Mine!'],
  prankPopup: ['⚠ {name} has taken over this PC. All your snacks belong to me now… just kidding 😜', '⚠ System update: your PC is now 100% more {name}. Just kidding 😜'],
  prankDoodle: ['Art! 🎨', 'You\'re welcome.'],
  prankNote: ['{name} was here ✨', 'I licked this screen. Just kidding. Maybe.', 'Drink some water 💧'],
}

/** The character on the stage now, as the main window last said. */
let activeCharacter = ''

export function setActiveCharacter(name: string) {
  activeCharacter = name.trim()
}

/**
 * The file name of a character's reactions.
 *
 * @example
 * reactionsFileFor('Mr. Sparkles') // => 'mr-sparkles.json'
 */
export function reactionsFileFor(character: string) {
  const name = character.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  return `${name || 'default'}.json`
}

/**
 * The reactions of the active character. The file is read each time, so the owner's changes count at once.
 * A character without a file gets the first version.
 */
export async function loadReactions(character = activeCharacter): Promise<Reactions> {
  const file = join(REACTIONS_DIR, reactionsFileFor(character))
  if (!existsSync(file)) {
    await mkdir(REACTIONS_DIR, { recursive: true })
    await writeFile(file, `${JSON.stringify(FIRST_REACTIONS, null, 2)}\n`)
    return withName(FIRST_REACTIONS, character)
  }
  const saved = parse(reactionsSchema, JSON.parse(await readFile(file, 'utf8')))
  // Kinds that came in a later version get their first lines. The owner's own lines stay as they are.
  const missing = Object.keys(FIRST_REACTIONS).filter(kind => saved[kind as ReactionKind] === undefined)
  const reactions = Object.fromEntries(Object.entries(FIRST_REACTIONS).map(([kind, first]) => [kind, saved[kind as ReactionKind] ?? first])) as Reactions
  if (missing.length)
    await writeFile(file, `${JSON.stringify(reactions, null, 2)}\n`)
  return withName(reactions, character)
}

function withName(reactions: Reactions, character: string): Reactions {
  const name = character || 'your fairy'
  return Object.fromEntries(Object.entries(reactions).map(([kind, options]) => [kind, options.map(line => line.replaceAll('{name}', name))])) as Reactions
}

/** One random line of a kind, or nothing when the owner left the kind empty. */
export function pickLine(reactions: Reactions, kind: ReactionKind, random: () => number = Math.random): string | undefined {
  const options = reactions[kind]
  return options.length ? options[Math.floor(random() * options.length)] : undefined
}
