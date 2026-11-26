import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { renderVoiceMoods } from '@proj-airi/core-agent'

import { FAIRY_DATA_DIR } from '../memory-files'

/**
 * FAIRY: Orpheus, an expressive voice that can laugh, sigh, and giggle.
 *
 * Orpheus is a small language model that writes audio codes. Ollama runs it on the GPU, and the SNAC decoder turns
 * the codes into 24 kHz audio on the CPU. On an RX 6800 XT it speaks about 1.6 times faster than real time.
 */

export const ORPHEUS_MODEL = 'hf.co/isaiahbjork/orpheus-3b-0.1-ft-Q4_K_M-GGUF'
export const ORPHEUS_VOICES = ['tara', 'leah', 'jess', 'leo', 'dan', 'mia', 'zac', 'zoe'] as const
export const ORPHEUS_SAMPLE_RATE = 24_000
const OLLAMA_URL = 'http://127.0.0.1:11434'
const SNAC_URL = 'https://huggingface.co/onnx-community/snac_24khz-ONNX/resolve/main/onnx/decoder_model.onnx'
const SNAC_FILE = join(FAIRY_DATA_DIR, 'models', 'snac_24khz', 'decoder_model.onnx')
/** Ollama frees the GPU memory after this much silence. */
const KEEP_ALIVE = '10m'

/** The parts of onnxruntime-node that the decoder uses. */
interface InferenceSession {
  readonly inputNames: readonly string[]
  readonly outputNames: readonly string[]
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: unknown }>>
}
interface Ort {
  Tensor: new (type: 'int64', data: BigInt64Array, dims: number[]) => unknown
  InferenceSession: { create: (path: string) => Promise<InferenceSession> }
}

/** The prompt that makes Orpheus speak `text` with `voice`. Mood markers become its sound tags, such as `<laugh>`. */
export function orpheusPrompt(text: string, voice: string) {
  const spoken = renderVoiceMoods(text, mood => `<${mood}>`).replace(/\s+/g, ' ').trim()
  return `<custom_token_3><|begin_of_text|>${voice}: ${spoken}<|eot_id|><custom_token_4><custom_token_5><custom_token_1>`
}

/**
 * Splits the audio tokens of Orpheus into the three SNAC code layers.
 *
 * Each frame has 7 tokens. Token `i` of the stream carries `n - 10 - (i % 7) * 4096`. A token out of range is skipped,
 * and an incomplete last frame is dropped.
 */
export function snacLayers(output: string) {
  const codes: number[] = []
  for (const match of output.matchAll(/<custom_token_(\d+)>/g)) {
    const code = Number(match[1]) - 10 - (codes.length % 7) * 4096
    if (code >= 0 && code < 4096)
      codes.push(code)
  }
  const layers: [number[], number[], number[]] = [[], [], []]
  for (let frame = 0; frame + 7 <= codes.length; frame += 7) {
    const [a, b, c, d, e, f, g] = codes.slice(frame, frame + 7)
    layers[0].push(a)
    layers[1].push(b, e)
    layers[2].push(c, d, f, g)
  }
  return layers
}

let ort: Ort | undefined
let decoder: Promise<InferenceSession> | undefined
function loadDecoder() {
  decoder ??= (async () => {
    if (!existsSync(SNAC_FILE)) {
      const response = await fetch(SNAC_URL)
      if (!response.ok)
        throw new Error(`Could not download the SNAC decoder (${response.status})`)
      await mkdir(join(SNAC_FILE, '..'), { recursive: true })
      await writeFile(SNAC_FILE, new Uint8Array(await response.arrayBuffer()))
    }
    // NOTICE:
    // onnxruntime-node comes with @huggingface/transformers, which pins its version in pnpm-workspace.yaml.
    // The app does not depend on it directly, so it loads through the transformers package.
    // Remove when stage-tamagotchi lists onnxruntime-node as its own dependency.
    const require = createRequire(import.meta.url)
    ort = createRequire(require.resolve('@huggingface/transformers'))('onnxruntime-node') as Ort
    return await ort.InferenceSession.create(SNAC_FILE)
  })().catch((error) => {
    decoder = undefined
    throw error
  })
  return decoder
}

/** Speaks `text` with an Orpheus voice. Returns mono samples at 24 kHz. */
export async function speakWithOrpheus(text: string, voice: string, signal?: AbortSignal): Promise<Float32Array> {
  const session = await loadDecoder()
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    signal,
    body: JSON.stringify({
      model: ORPHEUS_MODEL,
      raw: true,
      stream: false,
      keep_alive: KEEP_ALIVE,
      prompt: orpheusPrompt(text, voice),
      // About 85 tokens make one second of audio. Speech takes about 15 characters per second.
      options: { temperature: 0.6, top_p: 0.9, repeat_penalty: 1.1, num_ctx: 2048, num_predict: Math.min(1900, 300 + text.length * 8) },
    }),
  })
  if (!response.ok)
    throw new Error(`Orpheus failed: ${response.status} ${(await response.text()).slice(0, 200)}`)
  const { response: output } = await response.json() as { response: string }
  const layers = snacLayers(output)
  if (!layers[0].length)
    throw new Error('Orpheus returned no audio')

  const tensor = (codes: number[]) => new ort!.Tensor('int64', BigInt64Array.from(codes, BigInt), [1, codes.length])
  const feeds = Object.fromEntries(session.inputNames.map((name, index) => [name, tensor(layers[index])]))
  const result = await session.run(feeds)
  return result[session.outputNames[0]].data as Float32Array
}

/** Loads Orpheus onto the GPU and the decoder into memory, so the first sentence does not wait for them. */
export async function warmUpOrpheus() {
  await speakWithOrpheus('Hi.', ORPHEUS_VOICES[0])
}

/** A 16-bit PCM WAV file of mono samples. */
export function toWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 32767, true))
  return view.buffer
}
