/**
 * FAIRY: reads a key combination such as `ctrl+shift+t` into uiohook key names.
 *
 * Names are case-insensitive. Common aliases work: `control`, `win`, `cmd`, `esc`, `return`, `del`, `up`, `pgdn`.
 */

const MODIFIERS: Record<string, string> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  win: 'Meta',
  windows: 'Meta',
  meta: 'Meta',
  cmd: 'Meta',
  super: 'Meta',
}

const KEYS: Record<string, string> = {
  'enter': 'Enter',
  'return': 'Enter',
  'tab': 'Tab',
  'esc': 'Escape',
  'escape': 'Escape',
  'space': 'Space',
  'backspace': 'Backspace',
  'delete': 'Delete',
  'del': 'Delete',
  'insert': 'Insert',
  'home': 'Home',
  'end': 'End',
  'pageup': 'PageUp',
  'pgup': 'PageUp',
  'pagedown': 'PageDown',
  'pgdn': 'PageDown',
  'up': 'ArrowUp',
  'down': 'ArrowDown',
  'left': 'ArrowLeft',
  'right': 'ArrowRight',
  'arrowup': 'ArrowUp',
  'arrowdown': 'ArrowDown',
  'arrowleft': 'ArrowLeft',
  'arrowright': 'ArrowRight',
  'printscreen': 'PrintScreen',
  'minus': 'Minus',
  '-': 'Minus',
  'equal': 'Equal',
  '=': 'Equal',
  'plus': 'Equal',
  'comma': 'Comma',
  ',': 'Comma',
  'period': 'Period',
  '.': 'Period',
  'slash': 'Slash',
  '/': 'Slash',
}

/** Combinations that close or destroy without a way back. The character must not press them. */
const BLOCKED = new Set(['Alt+F4', 'Shift+Delete', 'Ctrl+Alt+Delete'])

export interface KeyCombination {
  modifiers: string[]
  key: string
}

/**
 * Reads one key combination.
 *
 * @example
 * parseKeyCombination('ctrl+shift+t') // { modifiers: ['Ctrl', 'Shift'], key: 'T' }
 */
export function parseKeyCombination(input: string): KeyCombination {
  const parts = input.split('+').map(part => part.trim()).filter(Boolean)
  if (!parts.length)
    throw new Error('No keys given.')

  const modifiers: string[] = []
  let key: string | undefined
  for (const [index, part] of parts.entries()) {
    const lower = part.toLowerCase()
    const modifier = MODIFIERS[lower]
    if (modifier && index < parts.length - 1) {
      if (!modifiers.includes(modifier))
        modifiers.push(modifier)
      continue
    }
    if (key || index < parts.length - 1)
      throw new Error(`"${input}" has more than one main key.`)
    if (/^[a-z0-9]$/i.test(part))
      key = part.toUpperCase()
    else if (/^f(?:[1-9]|1\d|2[0-4])$/i.test(part))
      key = part.toUpperCase()
    else
      key = KEYS[lower] ?? modifier
    if (!key)
      throw new Error(`Unknown key "${part}".`)
  }

  const combination = { modifiers, key: key! }
  if (BLOCKED.has(describeKeyCombination(combination)))
    throw new Error(`${describeKeyCombination(combination)} is blocked, because it can close or delete without a way back.`)
  return combination
}

/** The combination in a fixed order, such as `Ctrl+Shift+T`. */
export function describeKeyCombination(combination: KeyCombination): string {
  const order = ['Ctrl', 'Alt', 'Shift', 'Meta']
  const modifiers = [...combination.modifiers].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return [...modifiers, combination.key].join('+')
}
