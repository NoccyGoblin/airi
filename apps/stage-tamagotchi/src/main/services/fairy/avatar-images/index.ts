import type { FSWatcher } from 'node:fs'

import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { existsSync, watch } from 'node:fs'
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'

import { electronAvatarImages, electronAvatarImagesChanged } from '../../../../shared/eventa'
import { FAIRY_DATA_DIR } from '../memory-files'
import { writePlaceholderImages } from './placeholders'

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

async function readImages(): Promise<Record<string, string>> {
  if (!existsSync(AVATAR_DIR)) {
    await mkdir(AVATAR_DIR, { recursive: true })
    await writePlaceholderImages(AVATAR_DIR)
    log.log(`made ${AVATAR_DIR} with placeholder images. Put your own drawings there.`)
  }
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

export function createAvatarImagesService(params: { context: ReturnType<typeof createContext>['context'] }) {
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
