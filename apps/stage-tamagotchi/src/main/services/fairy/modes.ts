import type { FairyMode } from '../../../shared/eventa'

/**
 * FAIRY: one place where the quick menu reads and switches the character's modes. Each mode's service registers here
 * when the main window creates it, so the menu window does not need the main window's IPC context.
 */

interface ModeControl {
  get: () => boolean
  set: (on: boolean) => Promise<void> | void
}

const modes = new Map<FairyMode, ModeControl>()

/** Registers a mode. Returns the function that removes it, for the service's cleanup. */
export function registerMode(name: FairyMode, control: ModeControl) {
  modes.set(name, control)
  return () => {
    if (modes.get(name) === control)
      modes.delete(name)
  }
}

/** The state of every registered mode. */
export function readModes(): Partial<Record<FairyMode, boolean>> {
  return Object.fromEntries([...modes].map(([name, control]) => [name, control.get()]))
}

/** Switches one mode. An unknown mode changes nothing. */
export async function setMode(name: FairyMode, on: boolean) {
  await modes.get(name)?.set(on)
}
