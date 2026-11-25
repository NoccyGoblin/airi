import type { KokoroTTS } from 'kokoro-js'

import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'
import { eventHandler, H3 } from 'h3'

import { createH3Server } from '../../airi/http-server/server'
import { FAIRY_DATA_DIR } from '../memory-files'
import { readWavMono } from './wav'

/**
 * FAIRY: a local voice server for the character, in the main process.
 *
 * It speaks with Kokoro and listens with Whisper. Both run on the CPU through onnxruntime-node, so they use every core.
 * In the renderer, Kokoro runs as single-threaded WASM, about 20 times slower, and WebGPU on some AMD cards gives
 * broken audio. The models download once into `fairy-data/models` and then run offline.
 *
 * The server speaks the OpenAI audio API, so the "App (Local)" speech and transcription providers can use it with the
 * base URL `http://127.0.0.1:7462/v1/`. It listens on 127.0.0.1 only.
 */

export const LOCAL_VOICE_PORT = 7462
const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'
const WHISPER_MODELS: Record<string, { id: string, dtype: 'fp32' | 'q8' }> = {
  'whisper-small.en': { id: 'onnx-community/whisper-small.en', dtype: 'q8' },
  'whisper-base.en': { id: 'onnx-community/whisper-base.en', dtype: 'fp32' },
}
const DEFAULT_WHISPER = 'whisper-small.en'
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

const log = useLogg('fairy-local-voice').useGlobalConfig()

type Transformers = typeof import('@huggingface/transformers')
type Transcriber = (audio: Float32Array) => Promise<{ text: string } | { text: string }[]>

let transformers: Promise<Transformers> | undefined
function loadTransformers() {
  transformers ??= import('@huggingface/transformers').then((module) => {
    module.env.cacheDir = join(FAIRY_DATA_DIR, 'models')
    return module
  })
  return transformers
}

let kokoro: Promise<KokoroTTS> | undefined
function loadKokoro() {
  kokoro ??= (async () => {
    await loadTransformers()
    const { KokoroTTS } = await import('kokoro-js')
    const started = Date.now()
    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: 'fp32', device: 'cpu' })
    log.log(`Kokoro ready in ${Date.now() - started} ms`)
    return tts
  })().catch((error) => {
    kokoro = undefined
    throw error
  })
  return kokoro
}

const whisper = new Map<string, Promise<Transcriber>>()
function loadWhisper(name: string) {
  const model = WHISPER_MODELS[name] ?? WHISPER_MODELS[DEFAULT_WHISPER]
  let loaded = whisper.get(model.id)
  if (!loaded) {
    loaded = (async () => {
      const { pipeline } = await loadTransformers()
      const started = Date.now()
      const asr = await pipeline('automatic-speech-recognition', model.id, { device: 'cpu', dtype: model.dtype })
      log.log(`Whisper ${model.id} ready in ${Date.now() - started} ms`)
      return asr as unknown as Transcriber
    })().catch((error) => {
      whisper.delete(model.id)
      throw error
    })
    whisper.set(model.id, loaded)
  }
  return loaded
}

// One generation at a time keeps the CPU free for the game and keeps the sentence order.
const speaking = new Mutex()
const listening = new Mutex()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

function failure(error: unknown, status = 500) {
  return json({ error: { message: errorMessageFrom(error) ?? 'Local voice failed' } }, status)
}

let started: Promise<void> | undefined

/** Starts the local voice server and warms up both models in the background. */
export function startLocalVoiceServer() {
  started ??= (async () => {
    const app = new H3()

    app.options('/**', eventHandler(() => new Response(null, { status: 204, headers: CORS })))

    app.get('/v1/models', eventHandler(() => json({
      object: 'list',
      data: ['kokoro', ...Object.keys(WHISPER_MODELS)].map(id => ({ id, object: 'model', owned_by: 'local' })),
    })))

    app.get('/v1/audio/voices', eventHandler(async () => {
      try {
        const tts = await loadKokoro()
        return json({ voices: Object.entries(tts.voices).map(([id, voice]) => ({ id, name: voice.name, language: voice.language, gender: voice.gender })) })
      }
      catch (error) {
        return failure(error)
      }
    }))

    app.post('/v1/audio/speech', eventHandler(async (event) => {
      try {
        const body = await event.req.json() as { input?: unknown, voice?: unknown, speed?: unknown }
        const input = typeof body.input === 'string' ? body.input.slice(0, 4000) : ''
        if (!input.trim())
          return json({ error: { message: 'Empty input' } }, 400)
        const tts = await loadKokoro()
        const voice = typeof body.voice === 'string' && body.voice in tts.voices ? body.voice : 'af_heart'
        const speed = typeof body.speed === 'number' && body.speed > 0.25 && body.speed < 4 ? body.speed : 1
        const audio = await speaking.runExclusive(() => tts.generate(input, { voice: voice as keyof KokoroTTS['voices'], speed }))
        return new Response(audio.toWav(), { headers: { 'Content-Type': 'audio/wav', ...CORS } })
      }
      catch (error) {
        return failure(error)
      }
    }))

    app.post('/v1/audio/transcriptions', eventHandler(async (event) => {
      try {
        const form = await event.req.formData()
        const file = form.get('file')
        if (!file || typeof file === 'string')
          return json({ error: { message: 'Missing audio file' } }, 400)
        if (file.size > MAX_AUDIO_BYTES)
          return json({ error: { message: 'The audio is too long' } }, 413)
        const bytes = new Uint8Array(await file.arrayBuffer())
        const samples = readWavMono(bytes, 16_000)
        const level = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / Math.max(1, samples.length))
        const model = String(form.get('model') ?? DEFAULT_WHISPER)
        const asr = await loadWhisper(model)
        const result = await listening.runExclusive(() => asr(samples))
        const text = (Array.isArray(result) ? result.map(part => part.text).join(' ') : result.text).trim()
        log.log(`heard ${(samples.length / 16_000).toFixed(1)} s at level ${level.toFixed(4)} from ${bytes.length} bytes: "${text}"`)
        return json({ text })
      }
      catch (error) {
        return failure(error)
      }
    }))

    const server = createH3Server({ app, host: '127.0.0.1', port: LOCAL_VOICE_PORT })
    const address = await server.start()
    log.log(`local voice listening on ${address.baseUrl}`)

    // Warm up, so the first reply does not wait for the models.
    void loadKokoro().then(tts => tts.generate('Hi.', { voice: 'af_heart' })).catch(error => log.warn(`Kokoro warm-up failed: ${errorMessageFrom(error)}`))
    void loadWhisper(DEFAULT_WHISPER).then(asr => asr(new Float32Array(16_000))).catch(error => log.warn(`Whisper warm-up failed: ${errorMessageFrom(error)}`))
  })().catch((error) => {
    started = undefined
    log.withError(error).warn('local voice server did not start')
  })
  return started
}
