import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

import { Mutex } from 'async-mutex'

/**
 * FAIRY: one PowerShell that stays open for the PC actions. A new PowerShell takes about half a second to start, and
 * the character often reads and clicks many times in a row.
 *
 * Each script goes in as one base64 line and comes back as one line: "OK <base64 output>" or "ERR <base64 message>".
 * Base64 keeps quotes and new lines in a script from breaking the protocol.
 */

const LOOP_SCRIPT = `
# Errors that do not stop a script go to stderr, as in a normal PowerShell. A thrown error comes back as ERR.
$utf8 = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  try {
    $script = $utf8.GetString([Convert]::FromBase64String($line))
    $output = & ([scriptblock]::Create($script)) | Out-String
    [Console]::Out.WriteLine('OK ' + [Convert]::ToBase64String($utf8.GetBytes($output)))
  }
  catch {
    [Console]::Out.WriteLine('ERR ' + [Convert]::ToBase64String($utf8.GetBytes($_.ToString())))
  }
}
`

const DEFAULT_TIMEOUT_MS = 20_000

function toBase64(text: string) {
  return Buffer.from(text, 'utf8').toString('base64')
}

function fromBase64(text: string) {
  return Buffer.from(text, 'base64').toString('utf8')
}

export class PowerShellHost {
  private shell: ChildProcessWithoutNullStreams | undefined
  private waiting: ((line: string) => void) | undefined
  private readonly queue = new Mutex()

  /**
   * Runs a script and returns what it printed.
   *
   * Throws:
   * - The script's error, or a timeout. After a timeout the PowerShell restarts.
   */
  async run(script: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
    return this.queue.runExclusive(async () => {
      const shell = this.ensureShell()
      const answer = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.waiting = undefined
          this.stop()
          reject(new Error('PowerShell took too long.'))
        }, timeoutMs)
        this.waiting = (line) => {
          clearTimeout(timer)
          this.waiting = undefined
          resolve(line)
        }
      })
      shell.stdin.write(`${toBase64(script)}\n`)
      const line = await answer
      const [status, body = ''] = line.split(' ', 2)
      const text = fromBase64(body)
      if (status !== 'OK')
        throw new Error(text.trim() || 'The PowerShell script failed.')
      return text
    })
  }

  /** Ends the PowerShell. The next run starts a new one. */
  stop() {
    this.shell?.kill()
    this.shell = undefined
  }

  private ensureShell() {
    if (this.shell && this.shell.exitCode === null)
      return this.shell
    const shell = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(LOOP_SCRIPT, 'utf16le').toString('base64')], { windowsHide: true })
    // A PowerShell that was stopped can still print or exit later. Only the current one answers the waiting script.
    createInterface({ input: shell.stdout }).on('line', (line) => {
      if (this.shell === shell && /^(?:OK|ERR)(?: |$)/.test(line))
        this.waiting?.(line)
    })
    // Progress records and warnings go to stderr. They are not answers.
    shell.stderr.resume()
    shell.on('exit', () => {
      if (this.shell !== shell)
        return
      this.shell = undefined
      this.waiting?.(`ERR ${toBase64('PowerShell stopped.')}`)
    })
    this.shell = shell
    return shell
  }
}
