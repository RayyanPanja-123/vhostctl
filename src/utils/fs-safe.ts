import fs from 'node:fs'
import path from 'node:path'
import { getBackupDir } from './paths.js'

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10)
}

function encodePathForBackup(filePath: string): string {
  return filePath.replace(/[/\\:]/g, '_')
}

/** Writes `content` to `filePath` atomically: temp file in the same directory, then rename over the target. */
export function writeFileAtomic(filePath: string, content: string): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmpPath = path.join(dir, `.vhostctl-tmp-${process.pid}-${Date.now()}-${randomSuffix()}`)
  try {
    fs.writeFileSync(tmpPath, content, 'utf8')
    fs.renameSync(tmpPath, filePath)
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
  fs.copyFileSync(filePath, backupPath)
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
