import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupFile, deleteFileSafe, restoreFromBackup, writeFileAtomic, writeFileSafe } from '../src/utils/fs-safe.js'

describe('fs-safe', () => {
  let tmpDir: string
  let filePath: string
  let backupDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhostctl-fs-safe-'))
    filePath = path.join(tmpDir, 'target.conf')
    backupDir = path.join(tmpDir, 'backups')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('writeFileAtomic', () => {
    it('creates the file with the given content', () => {
      writeFileAtomic(filePath, 'hello')
      expect(fs.readFileSync(filePath, 'utf8')).toBe('hello')
    })

    it('overwrites cleanly and leaves no temp files behind', () => {
      writeFileAtomic(filePath, 'first')
      writeFileAtomic(filePath, 'second')

      expect(fs.readFileSync(filePath, 'utf8')).toBe('second')
      const leftovers = fs.readdirSync(tmpDir).filter((f) => f.startsWith('.vhostctl-tmp-'))
      expect(leftovers).toEqual([])
    })
  })

  describe('backupFile', () => {
    it('returns null when the source file does not exist', () => {
      expect(backupFile(filePath, backupDir)).toBeNull()
    })

    it('copies the current content into backupDir', () => {
      fs.writeFileSync(filePath, 'original content')
      const backupPath = backupFile(filePath, backupDir)

      expect(backupPath).not.toBeNull()
      expect(fs.readFileSync(backupPath as string, 'utf8')).toBe('original content')
    })

    it('produces a distinct backup file on each call, even back-to-back', () => {
      fs.writeFileSync(filePath, 'v1')
      const first = backupFile(filePath, backupDir)
      const second = backupFile(filePath, backupDir)

      expect(first).not.toBeNull()
      expect(second).not.toBeNull()
      expect(first).not.toBe(second)
    })
  })

  describe('writeFileSafe', () => {
    it('returns backupPath: null on first write (nothing existed before)', () => {
      const { backupPath } = writeFileSafe(filePath, 'new content', backupDir)
      expect(backupPath).toBeNull()
      expect(fs.readFileSync(filePath, 'utf8')).toBe('new content')
    })

    it('backs up the old content on overwrite', () => {
      writeFileSafe(filePath, 'old content', backupDir)
      const { backupPath } = writeFileSafe(filePath, 'new content', backupDir)

      expect(backupPath).not.toBeNull()
      expect(fs.readFileSync(backupPath as string, 'utf8')).toBe('old content')
      expect(fs.readFileSync(filePath, 'utf8')).toBe('new content')
    })
  })

  describe('deleteFileSafe', () => {
    it('backs up then removes the file', () => {
      fs.writeFileSync(filePath, 'doomed content')
      const backupPath = deleteFileSafe(filePath, backupDir)

      expect(fs.existsSync(filePath)).toBe(false)
      expect(backupPath).not.toBeNull()
      expect(fs.readFileSync(backupPath as string, 'utf8')).toBe('doomed content')
    })

    it('returns null if the file never existed', () => {
      expect(deleteFileSafe(filePath, backupDir)).toBeNull()
    })
  })

  describe('restoreFromBackup', () => {
    it('restores the original content from a backup path', () => {
      writeFileSafe(filePath, 'v1', backupDir)
      const { backupPath } = writeFileSafe(filePath, 'v2', backupDir)

      restoreFromBackup(filePath, backupPath)
      expect(fs.readFileSync(filePath, 'utf8')).toBe('v1')
    })

    it('deletes the target when backupPath is null (undoes a fresh-file creation)', () => {
      writeFileSafe(filePath, 'freshly created', backupDir)
      restoreFromBackup(filePath, null)

      expect(fs.existsSync(filePath)).toBe(false)
    })
  })
})
