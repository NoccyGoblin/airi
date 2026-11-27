import type { FSWatcher } from 'node:fs'

import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { existsSync, watch } from 'node:fs'
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { screen } from 'electron'

import { electronAvatarImages, electronAvatarImagesChanged, electronCharacterSize } from '../../../../shared/eventa'
import { FAIRY_DATA_DIR } from '../memory-files'
import { PLACEHOLDER_MARK, upgradePlaceholderImages, writePlaceholderImages } from './placeholders'

/**
 * FAIRY: the images of the character's sprite avatar, from `fairy-data/avatar`. Each file is named after a state,
 * for example `idle.png`, `talk.gif`, or `sleeping.webp`. The window gets them as data URLs and hears when the
 * folder changes, so a new drawing shows at once.
 */

export const AVATAR_DIR = join(FAIRY_DATA_DIR, 'avatar')
const TYPES: Record<string, string> = { '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.apng': 'image/apng', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }
/** One image larger than this is left out, so a huge file does not slow the window. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const log = useLogg('fairy-avatar-images').useGlobalConfig()

/** The state of an image file, from its name without the extension, in lower case. */
export function stateOfFile(name: string) {
  const extension = extname(name).toLowerCase()
  return TYPES[extension] ? name.slice(0, -extension.length).toLowerCase() : undefined
}

/**
 * Whether an SVG is one of our placeholders: the current ones carry the mark, and the first version had its own
 * size and hair color.
 */
export function isOurPlaceholder(content: string) {
  return content.includes(PLACEHOLDER_MARK) || (content.includes('viewBox="0 0 200 220"') && content.includes('#ffb3d9'))
}

let upgraded = false

async function readImages(): Promise<Record<string, string>> {
  if (!existsSync(AVATAR_DIR)) {
    await mkdir(AVATAR_DIR, { recursive: true })
    await writePlaceholderImages(AVATAR_DIR)
    log.log(`made ${AVATAR_DIR} with placeholder images. Put your own drawings there.`)
  }
  else if (!upgraded) {
    // Our older placeholders get the newer drawings. The owner's own images stay.
    await upgradePlaceholderImages(AVATAR_DIR, isOurPlaceholder)
  }
  upgraded = true
  const images: Record<string, string> = {}
  for (const name of await readdir(AVATAR_DIR)) {
    const state = stateOfFile(name)
    if (!state)
      continue
    const path = join(AVATAR_DIR, name)
    if ((await stat(path)).size > MAX_IMAGE_BYTES)
      continue
    images[state] = `data:${TYPES[extname(name).toLowerCase()]};base64,${(await readFile(path)).toString('base64')}`
  }
  return images
}

export function createAvatarImagesService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  // A full-body sprite needs a taller window than a Live2D bust. Her feet stay where they were, and the window stays
  // on the screen.
  defineInvokeHandler(params.context, electronCharacterSize, ({ width, height }) => {
    const before = params.window.getBounds()
    const area = screen.getDisplayMatching(before).workArea
    const size = { width: Math.round(Math.min(area.width, Math.max(120, width))), height: Math.round(Math.min(area.height, Math.max(120, height))) }
    const x = Math.min(area.x + area.width - size.width, Math.max(area.x, Math.round(before.x + (before.width - size.width) / 2)))
    const y = Math.min(area.y + area.height - size.height, Math.max(area.y, before.y + before.height - size.height))
    params.window.setBounds({ x, y, ...size }, false)
    return { width: before.width, height: before.height }
  })

  let watcher: FSWatcher | undefined
  let changeTimer: ReturnType<typeof setTimeout> | undefined

  defineInvokeHandler(params.context, electronAvatarImages, async () => {
    const images = await readImages()
    if (!watcher) {
      watcher = watch(AVATAR_DIR, () => {
        // A drawing app saves in a few steps, so the window hears once after the last one.
        clearTimeout(changeTimer)
        changeTimer = setTimeout(() => params.context.emit(electronAvatarImagesChanged, undefined), 500)
      })
      watcher.on('error', error => log.warn(`could not watch the avatar folder: ${errorMessageFrom(error)}`))
    }
    return { images, folder: AVATAR_DIR }
  })

  return () => {
    clearTimeout(changeTimer)
    watcher?.close()
  }
}
