import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { logger } from '../utils/logger.js'

export function isElevated(): boolean {
  if (process.platform === 'win32') {
    const etcDir = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'drivers', 'etc')
    return canWritePath(etcDir)
  }
  return typeof process.getuid === 'function' && process.getuid() === 0
}

/** True if `target` is writable, or (when it doesn't exist yet) if its parent directory is. */
export function canWritePath(target: string): boolean {
  try {
    if (fs.existsSync(target)) {
      fs.accessSync(target, fs.constants.W_OK)
      return true
    }
    fs.accessSync(path.dirname(target), fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Re-executes the current process elevated (UAC on Windows, sudo on Mac/Linux) and exits with its status. */
export function relaunchElevated(): never {
  const scriptPath = process.argv[1] ?? ''
  const args = process.argv.slice(2)

  if (process.platform === 'win32') {
    const argString = [scriptPath, ...args].map((a) => `"${a.replace(/"/g, '""')}"`).join(' ')
    const psCommand = `Start-Process -FilePath 'node' -ArgumentList ${psSingleQuote(argString)} -Verb RunAs -Wait`
    const result = spawnSync('powershell', ['-NoProfile', '-Command', psCommand], { stdio: 'inherit' })
    process.exit(result.status ?? 1)
  } else {
    const result = spawnSync('sudo', [process.execPath, scriptPath, ...args], { stdio: 'inherit' })
    process.exit(result.status ?? 1)
  }
}

/**
 * Ensures every path is writable, self-elevating (and never returning) if it isn't.
 * Throws if already elevated and still unable to write (a real permissions problem, not just missing privilege).
 */
export function ensureWritable(paths: string[]): void {
  const blocked = paths.filter((p) => !canWritePath(p))
  if (blocked.length === 0) return

  if (isElevated()) {
    throw new Error(`Insufficient permissions to write: ${blocked.join(', ')}`)
  }

  logger.warn(`Elevated permissions are required to write:\n  ${blocked.join('\n  ')}`)
  logger.info(process.platform === 'win32' ? 'Requesting UAC elevation…' : 'Re-running with sudo…')
  relaunchElevated()
}
