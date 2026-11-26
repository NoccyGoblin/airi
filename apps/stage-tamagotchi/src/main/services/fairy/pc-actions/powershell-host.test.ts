import { afterAll, describe, expect, it } from 'vitest'

import { PowerShellHost } from './powershell-host'

describe.runIf(process.platform === 'win32')('powerShellHost', () => {
  const host = new PowerShellHost()
  afterAll(() => host.stop())

  it('returns output with quotes and new lines', async () => {
    expect((await host.run('\'it\'\'s\'; \'two\'')).trim().split(/\r?\n/)).toEqual(['it\'s', 'two'])
  }, 30_000)

  it('throws the script error and keeps working', async () => {
    await expect(host.run('throw "broken"')).rejects.toThrow('broken')
    expect((await host.run('1 + 1')).trim()).toBe('2')
  }, 30_000)

  it('restarts after a timeout', async () => {
    await expect(host.run('Start-Sleep -Seconds 5', 500)).rejects.toThrow('too long')
    expect((await host.run('"back"')).trim()).toBe('back')
  }, 30_000)
})
