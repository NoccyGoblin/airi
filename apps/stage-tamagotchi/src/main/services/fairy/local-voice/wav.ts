/**
 * Reads a WAV file into mono samples at `targetRate`.
 *
 * Supports 16-bit, 24-bit, and 32-bit integer PCM and 32-bit float, in plain and extensible WAV files.
 *
 * @example
 * readWavMono(bytes, 16_000) // Float32Array of samples between -1 and 1
 */
export function readWavMono(bytes: Uint8Array, targetRate: number): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE')
    throw new Error('The audio is not a WAV file.')

  let format = 0
  let channels = 1
  let rate = 0
  let bits = 0
  let data: DataView | undefined
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = tag(offset)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ') {
      format = view.getUint16(body, true)
      channels = view.getUint16(body + 2, true)
      rate = view.getUint32(body + 4, true)
      bits = view.getUint16(body + 14, true)
      // WAVE_FORMAT_EXTENSIBLE keeps the real format in the first two bytes of the sub-format GUID.
      if (format === 0xFFFE && size >= 26)
        format = view.getUint16(body + 24, true)
    }
    else if (id === 'data') {
      data = new DataView(bytes.buffer, bytes.byteOffset + body, Math.min(size, bytes.length - body))
    }
    offset = body + size + (size % 2)
  }
  if (!data || !rate || !channels)
    throw new Error('The WAV file has no audio.')

  const bytesPerSample = bits / 8
  const frames = Math.floor(data.byteLength / (bytesPerSample * channels))
  const read = (position: number) => {
    if (format === 3 && bits === 32)
      return data.getFloat32(position, true)
    if (format === 1 && bits === 16)
      return data.getInt16(position, true) / 32768
    if (format === 1 && bits === 24)
      return ((data.getUint8(position) | (data.getUint8(position + 1) << 8) | (data.getInt8(position + 2) << 16))) / 8388608
    if (format === 1 && bits === 32)
      return data.getInt32(position, true) / 2147483648
    throw new Error(`Unsupported WAV format ${format} with ${bits} bits.`)
  }

  const mono = new Float32Array(frames)
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0
    for (let channel = 0; channel < channels; channel++)
      sum += read((frame * channels + channel) * bytesPerSample)
    mono[frame] = sum / channels
  }
  if (rate === targetRate)
    return mono

  // Linear resampling is enough for speech recognition.
  const length = Math.floor(frames * targetRate / rate)
  const resampled = new Float32Array(length)
  const step = rate / targetRate
  for (let index = 0; index < length; index++) {
    const position = index * step
    const left = Math.floor(position)
    const right = Math.min(left + 1, frames - 1)
    resampled[index] = mono[left] + (mono[right] - mono[left]) * (position - left)
  }
  return resampled
}
