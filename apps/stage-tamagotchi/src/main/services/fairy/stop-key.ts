import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { globalShortcut } from 'electron'

import { electronStopKeyArmed, electronStopPressed } from '../../../shared/eventa'
import { stopPcActions } from './pc-actions'

/**
 * FAIRY: Escape stops the character: her reply, her voice, and the clicks of a job. Escape belongs to the owner's
 * apps, so the character holds it only while she is busy, and gives it back when she is done.
 */

const STOP_KEY = 'Escape'
const log = useLogg('fairy-stop-key').useGlobalConfig()

export function createStopKeyService(params: { context: ReturnType<typeof createContext>['context'] }) {
  let armed = false

  const disarm = () => {
    if (!armed)
      return
    armed = false
    globalShortcut.unregister(STOP_KEY)
  }

  defineInvokeHandler(params.context, electronStopKeyArmed, ({ armed: wanted }) => {
    if (!wanted) {
      disarm()
      return
    }
    if (armed)
      return
    armed = globalShortcut.register(STOP_KEY, () => {
      log.log('the owner pressed Escape: stopping the character')
      stopPcActions()
      params.context.emit(electronStopPressed, undefined)
      disarm()
    })
    if (!armed)
      log.warn('Escape is taken by another app, so it cannot stop the character')
  })

  return disarm
}
