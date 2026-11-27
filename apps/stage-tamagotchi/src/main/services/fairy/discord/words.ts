/**
 * FAIRY: how the bot tells that someone talks to the character, and the few spoken or typed commands it knows.
 * Speech recognition spells names in many ways, so the name match is loose.
 */

/** Lower case letters and digits only, with spaces between words. */
function plain(text: string) {
  // NFKD splits a letter from its accent, and \p{M} removes the accent marks.
  return text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Tells whether a text calls the character by her name or by one of its other spellings.
 *
 * @example
 * callsName('Hey Loomy, what is up?', ['Lumi', 'Loomy']) // => true
 */
export function callsName(text: string, names: readonly string[]) {
  const words = ` ${plain(text)} `
  return names.map(plain).filter(Boolean).some(name => words.includes(` ${name} `))
}

/** Spellings that speech recognition often writes for a name. The name itself comes first. */
export function nameSpellings(name: string, extra: readonly string[] = []) {
  const base = plain(name)
  const guesses = base === 'lumi' ? ['loomy', 'lumie', 'lumy', 'loomi', 'lumee', 'lummy', 'loomie'] : []
  return [...new Set([base, ...extra.map(plain), ...guesses].filter(Boolean))]
}

export type CallCommand = 'join' | 'leave'

/**
 * Finds a join or leave command in a text that calls the character.
 *
 * @example
 * callCommand('Lumi, join the call') // => 'join'
 * callCommand('lumi leave vc please') // => 'leave'
 */
export function callCommand(text: string): CallCommand | undefined {
  const words = ` ${plain(text)} `
  if (/ (?:leave|disconnect|get out|hang up|bye bye) /.test(words))
    return 'leave'
  if (/ (?:join|hop in|come in|get in) /.test(words))
    return 'join'
  return undefined
}

/**
 * Whisper writes these for silence or noise. A clip that only holds one of them is not speech.
 */
const NOISE_TEXTS = new Set(['you', 'thank you', 'thanks for watching', 'bye', 'uh', 'um', 'hmm', 'okay', 'oh'])

export function isNoise(text: string) {
  const words = plain(text)
  return !words || NOISE_TEXTS.has(words)
}

/**
 * The slash command for the character, named after her. Discord allows lower case letters, digits, "-", and "_", up
 * to 32 characters.
 *
 * @example
 * commandNameFor('Lumi') // => 'lumi'
 */
export function commandNameFor(character: string) {
  const name = plain(character).replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 32)
  return name || 'ask'
}
