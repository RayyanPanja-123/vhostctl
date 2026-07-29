import fs from 'node:fs'
import path from 'node:path'
import { getBackupDir } from './paths.js'

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}

function encodePathForBackup(filePath: string): string {
  return filePath.replace(/[/\\:]/g, '_')
}

/** Error codes that typically mean "another process (often antivirus real-time scanning, on
 * Windows) briefly has the file open" rather than a real permissions or disk problem — worth a
 * few short retries instead of failing the whole operation outright. */
const TRANSIENT_FS_CODES = new Set(['EBUSY', 'EPERM', 'EACCES'])

function isTransientFsError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && TRANSIENT_FS_CODES.has(String((err as { code: unknown }).code))
}

function sleepSync(ms: number): void {
  const until = Date.now() + ms
  while (Date.now() < until) {
    /* busy-wait: Windows file locks here are held for single-digit milliseconds, not worth an async dance */
  }
}

/** Retries `fn` a few times on transient file-lock errors (see `TRANSIENT_FS_CODES`) before giving up. */
function withRetry<T>(fn: () => T, attempts = 4, delayMs = 75): T {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return fn()
    } catch (err) {
      if (attempt === attempts || !isTransientFsError(err)) throw err
      sleepSync(delayMs)
    }
  }
  throw new Error('unreachable')
}

/** Writes `content` to `filePath` atomically: temp file in the same directory, then rename over the target. */
export function writeFileAtomic(filePath: string, content: string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmpPath = path.join(dir, `.vhostctl-tmp-${process.pid}-${Date.now()}-${randomSuffix()}`)
  try {
    withRetry(() => fs.writeFileSync(tmpPath, content, 'utf8'))
    withRetry(() => fs.renameSync(tmpPath, filePath))
  } catch (err) {
    fs.rmSync(tmpPath, { force: true })
    throw err
  }
}

/**
 * Copies `filePath`'s current content into `backupDir` before it gets overwritten.
 * Returns the backup path, or `null` if `filePath` doesn't exist yet (nothing to back up —
 * the caller is about to create a brand-new file).
 */
export function backupFile(filePath: string, backupDir: string = getBackupDir()): string | null {
  if (!fs.existsSync(filePath)) return null
  fs.mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `${encodePathForBackup(filePath)}.${Date.now()}-${randomSuffix()}.bak`)
  withRetry(() => fs.copyFileSync(filePath, backupPath))
  return backupPath
}

/** Backs up `filePath` (if it exists), then atomically writes `content` over it. */
export function writeFileSafe(
  filePath: string,
  content: string,
  backupDir: string = getBackupDir(),
): { backupPath: string | null } {
  const backupPath = backupFile(filePath, backupDir)
  writeFileAtomic(filePath, content)
  return { backupPath }
}

/** Backs up `filePath` (if it exists), then deletes it. Returns the backup path, or `null` if it didn't exist. */
export function deleteFileSafe(filePath: string, backupDir: string = getBackupDir()): string | null {
  const backupPath = backupFile(filePath, backupDir)
  fs.rmSync(filePath, { force: true })
  return backupPath
}

/**
 * Undoes a `writeFileSafe`/`deleteFileSafe` call: restores `filePath` from `backupPath`,
 * or deletes `filePath` if `backupPath` is `null` (the mutation had created a brand-new file).
 */
export function restoreFromBackup(filePath: string, backupPath: string | null): void {
  if (backupPath === null) {
    fs.rmSync(filePath, { force: true })
    return
  }
  const content = fs.readFileSync(backupPath, 'utf8')
  writeFileAtomic(filePath, content)
}
