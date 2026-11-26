/**
 * FAIRY: where the activity bubble goes next to the character's window. It prefers above her, then beside her on the
 * side with more room, then below her. It always stays inside the work area. All values are in screen DIP.
 */

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

const GAP = 4

/**
 * @example
 * bubblePlace({ x: 800, y: 400, width: 200, height: 200 }, { width: 240, height: 44 }, { x: 0, y: 0, width: 1920, height: 1040 })
 * // => { x: 780, y: 352 } (centered above her)
 */
export function bubblePlace(character: Box, bubble: { width: number, height: number }, area: Box) {
  const clampX = (x: number) => Math.round(Math.min(area.x + area.width - bubble.width, Math.max(area.x, x)))
  const clampY = (y: number) => Math.round(Math.min(area.y + area.height - bubble.height, Math.max(area.y, y)))
  const centerX = character.x + character.width / 2 - bubble.width / 2
  const centerY = character.y + character.height / 2 - bubble.height / 2

  const above = character.y - bubble.height - GAP
  if (above >= area.y)
    return { x: clampX(centerX), y: Math.round(above) }

  const roomLeft = character.x - area.x
  const roomRight = area.x + area.width - (character.x + character.width)
  if (Math.max(roomLeft, roomRight) >= bubble.width + GAP) {
    const x = roomRight >= roomLeft ? character.x + character.width + GAP : character.x - bubble.width - GAP
    return { x: Math.round(x), y: clampY(centerY) }
  }

  return { x: clampX(centerX), y: clampY(character.y + character.height + GAP) }
}
