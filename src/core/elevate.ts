import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ELEVATED_EXIT_MARKER, logger } from '../utils/logger.js'

export function isElevated(): boolean {
  if (process.platform === 'win32') {
    const etcDir = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'drivers', 'etc')
    return canWritePath(etcDir)
  }
  return typeof process.getuid === 'function' && process.getuid() === 0
}

/**
 * True if `target` is writable, or (when it doesn't exist yet) if its parent directory is.
 *
 * Uses real open()/write() probes rather than fs.accessSync: on Windows, access(W_OK) only checks
 * the read-only attribute and doesn't evaluate ACLs, so it reports protected paths (like the hosts
 * file or System32\drivers\etc) as writable even without admin rights.
 */
export function canWritePath(target: string): boolean {
  try {
    if (fs.existsSync(target)) {
      if (fs.statSync(target).isDirectory()) {
        return canWriteDir(target)
      }
      const fd = fs.openSync(target, 'r+')
      fs.closeSync(fd)
      return true
    }
    return canWriteDir(path.dirname(target))
  } catch {
    return false
  }
}

function canWriteDir(dir: string): boolean {
  const probe = path.join(dir, `.vhostctl-write-test-${process.pid}`)
  try {
    fs.writeFileSync(probe, '')
    fs.unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

const WINDOWS_ELEVATE_MAX_ATTEMPTS = 3
const WINDOWS_ELEVATE_RETRY_DELAY_MS = 400

/**
 * How long to let the elevated child run before we give up waiting on it and reap our own wrapper.
 *
 * `Start-Process -Verb RunAs -Wait` has been observed here to not return promptly when the elevated
 * command leaves a long-lived detached grandchild running (`reload` restarting Apache spawns
 * httpd.exe as its own independent process) — the actual work finishes in a few seconds either
 * way, so a long ceiling only matters for the pathological case, not the common one.
 */
const WINDOWS_ELEVATE_TIMEOUT_MS = 25_000

/** Internal flag stripped out by cli.ts before commander ever parses argv — see utils/logger.ts. */
const ELEVATED_LOG_FLAG = '--__vhostctl-elevated-log'

function sleepSync(ms: number): void {
  const until = Date.now() + ms
  while (Date.now() < until) {
    /* busy-wait: this only runs between elevation retries, a few hundred ms at most */
  }
}

/**
 * Splits the elevated child's real exit code (see `ELEVATED_EXIT_MARKER`) out of its logged
 * output. Falls back to `fallbackStatus` (whatever `$p.ExitCode` reported) when the marker is
 * missing — which happens if the process was killed too abruptly for its `exit` handler to run.
 */
function parseElevatedOutput(raw: string, fallbackStatus: number): { output: string; status: number } {
  const markerIndex = raw.indexOf(ELEVATED_EXIT_MARKER)
  if (markerIndex === -1) return { output: raw, status: fallbackStatus }

  const output = raw.slice(0, markerIndex)
  const match = /\d+/.exec(raw.slice(markerIndex + ELEVATED_EXIT_MARKER.length))
  const status = match ? Number.parseInt(match[0], 10) : fallbackStatus
  return { output, status }
}

/**
 * Runs one elevated attempt and returns its real exit code plus whatever it logged.
 *
 * Elevates `node` directly (one process hop, same as a plain `-Verb RunAs` launch) rather than
 * through an intermediate wrapper script: an earlier version of this wrapped the elevated node
 * in a `powershell -File wrapper.ps1 *> logfile` layer to capture output via OS-level redirection,
 * but that hung indefinitely whenever the elevated command left a long-lived child running (e.g.
 * `reload` restarting Apache) — the redirected file handle stays open for as long as any
 * descendant keeps it, so `-Wait` never returned. Piping app-level log lines out through the
 * relaunched process's own logger (see `setDebugLogFile`) avoids OS redirection entirely, so
 * there's nothing to hold a handle open on that front — but `-Wait` itself has still been observed
 * to occasionally not return promptly in that same scenario, hence the hard timeout below.
 */
function runElevatedOnceWindows(nodeArgs: string[]): { status: number; output: string; timedOut: boolean } {
  const logFile = path.join(os.tmpdir(), `vhostctl-elevate-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.log`)

  try {
    const argString = [...nodeArgs, ELEVATED_LOG_FLAG, logFile].map((a) => `"${a.replace(/"/g, '""')}"`).join(' ')
    const outerCommand = [
      `$p = Start-Process -FilePath 'node' -ArgumentList ${psSingleQuote(argString)} -Verb RunAs -Wait -PassThru`,
      `exit $p.ExitCode`,
    ].join('\n')

    const result = spawnSync('powershell', ['-NoProfile', '-Command', outerCommand], {
      encoding: 'utf8',
      timeout: WINDOWS_ELEVATE_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    })
    const rawOutput = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
    // A timed-out wrapper never reaches `exit $p.ExitCode`, so result.status is meaningless here —
    // the marker written by the elevated child itself (if it got that far) is the only real signal.
    const { output, status } = parseElevatedOutput(rawOutput, result.status ?? 1)
    return { status, output, timedOut: result.signal === 'SIGKILL' }
  } finally {
    fs.rmSync(logFile, { force: true })
  }
}

/**
 * Re-executes the current process elevated (UAC on Windows, sudo on Mac/Linux) and exits with its status.
 *
 * Pass `args` when the command resolved values interactively (prompts) before deciding it needed
 * elevation — those answers only exist in memory, not in process.argv, so the relaunched process
 * must be given them explicitly or it will prompt the user all over again.
 *
 * On Windows, a UAC-elevated child's stdio can't be piped back to the parent — Windows itself
 * blocks it — so a failure in there would otherwise be a silent, unexplained no-op. This works
 * around that (see `runElevatedOnceWindows`) and retries a couple of times when the elevated run
 * produced no output at all, which in practice means something (often antivirus real-time
 * protection scanning a freshly-written file under System32) killed it before it could log
 * anything — not a real application error, which always logs something before it exits non-zero.
 */
export function relaunchElevated(args: string[] = process.argv.slice(2)): never {
  const scriptPath = process.argv[1] ?? ''

  if (process.platform === 'win32') {
    let last = { status: 1, output: '', timedOut: false }
    for (let attempt = 1; attempt <= WINDOWS_ELEVATE_MAX_ATTEMPTS; attempt++) {
      last = runElevatedOnceWindows([scriptPath, ...args])

      if (last.output.trim()) process.stdout.write(last.output)
      if (last.timedOut) {
        logger.dim(
          'The elevated process finished its work but its own launcher did not exit promptly afterward, ' +
            'so vhostctl stopped waiting on it — this is a known Windows quirk when reload leaves Apache ' +
            'running. Everything above already happened for real.',
        )
      }
      if (last.status === 0) process.exit(0)
      if (last.output.trim()) break // a real application error already explained itself — don't retry it

      if (attempt < WINDOWS_ELEVATE_MAX_ATTEMPTS) {
        logger.dim(
          `Elevated run produced no output and exited abnormally (attempt ${attempt}/${WINDOWS_ELEVATE_MAX_ATTEMPTS}) — retrying…`,
        )
        sleepSync(WINDOWS_ELEVATE_RETRY_DELAY_MS)
      }
    }

    if (!last.output.trim()) {
      logger.error(
        'The elevated process exited without producing any output — something likely killed it before it could ' +
          'run (commonly antivirus real-time protection reacting to a write under System32\\drivers\\etc, or a ' +
          'UAC prompt that was dismissed). Nothing was changed.',
      )
    }
    process.exit(last.status)
  } else {
    const result = spawnSync('sudo', [process.execPath, scriptPath, ...args], { stdio: 'inherit' })
    process.exit(result.status ?? 1)
  }
}

/**
 * Ensures every path is writable, self-elevating (and never returning) if it isn't.
 * Throws if already elevated and still unable to write (a real permissions problem, not just missing privilege).
 *
 * Pass `relaunchArgs` when the caller already resolved interactive prompts (domain, root, confirmations)
 * so the elevated relaunch reuses those answers instead of re-prompting from a blank slate.
 */
export function ensureWritable(paths: string[], relaunchArgs?: string[]): void {
  const blocked = paths.filter((p) => !canWritePath(p))
  if (blocked.length === 0) return

  if (isElevated()) {
    throw new Error(`Insufficient permissions to write: ${blocked.join(', ')}`)
  }

  logger.warn(`Elevated permissions are required to write:\n  ${blocked.join('\n  ')}`)
  logger.info(process.platform === 'win32' ? 'Requesting UAC elevation…' : 'Re-running with sudo…')
  relaunchElevated(relaunchArgs)
}
