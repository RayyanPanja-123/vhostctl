import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StackHandle } from '../src/core/types.js'
import { rollbackChanges, validateOrRollback, validateStack, type FileChange } from '../src/stacks/validate.js'
import { writeFileSafe } from '../src/utils/fs-safe.js'

const PASS_COMMAND = [process.execPath, '-e', 'process.exit(0)']
const FAIL_COMMAND = [process.execPath, '-e', 'process.exit(1)']

function makeStack(overrides: Partial<StackHandle> = {}): StackHandle {
  return {
    kind: 'nginx',
    label: 'nginx (test)',
    writeMode: 'per-site-file',
    sitesAvailableDir: '/tmp/whatever',
    enableMechanism: 'comment-toggle',
    reloadCommand: PASS_COMMAND,
    defaultDocroot: '/tmp',
    installRoot: '/tmp',
    ...overrides,
  }
}

describe('validateStack', () => {
  it('returns ok: true when the config-test command exits 0', () => {
    const result = validateStack(makeStack({ configTestCommand: PASS_COMMAND }))
    expect(result.ok).toBe(true)
  })

  it('returns ok: false when the config-test command exits non-zero', () => {
    const result = validateStack(makeStack({ configTestCommand: FAIL_COMMAND }))
    expect(result.ok).toBe(false)
  })

  it('skips validation (ok: true) when configTestCommand is undefined', () => {
    const result = validateStack(makeStack({ configTestCommand: undefined }))
    expect(result.ok).toBe(true)
    expect(result.output).toContain('skipped')
  })

  it('skips validation (ok: true) when configTestCommand is empty', () => {
    const result = validateStack(makeStack({ configTestCommand: [] }))
    expect(result.ok).toBe(true)
    expect(result.output).toContain('skipped')
  })
})

describe('rollbackChanges / validateOrRollback', () => {
  let tmpDir: string
  let filePath: string
  let backupDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhostctl-validate-'))
    filePath = path.join(tmpDir, 'site.conf')
    backupDir = path.join(tmpDir, 'backups')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('rollbackChanges restores content from a backup path', () => {
    writeFileSafe(filePath, 'original', backupDir)
    const { backupPath } = writeFileSafe(filePath, 'mutated', backupDir)

    rollbackChanges([{ path: filePath, backupPath }])
    expect(fs.readFileSync(filePath, 'utf8')).toBe('original')
  })

  it('rollbackChanges deletes a file whose backupPath is null (fresh creation)', () => {
    writeFileSafe(filePath, 'freshly created', backupDir)

    rollbackChanges([{ path: filePath, backupPath: null }])
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('validateOrRollback restores the file when the config test fails', () => {
    writeFileSafe(filePath, 'original', backupDir)
    const { backupPath } = writeFileSafe(filePath, 'mutated', backupDir)
    const changes: FileChange[] = [{ path: filePath, backupPath }]

    const result = validateOrRollback(makeStack({ configTestCommand: FAIL_COMMAND }), changes)

    expect(result.ok).toBe(false)
    expect(fs.readFileSync(filePath, 'utf8')).toBe('original')
  })

  it('validateOrRollback leaves the mutation in place when the config test passes', () => {
    writeFileSafe(filePath, 'original', backupDir)
    const { backupPath } = writeFileSafe(filePath, 'mutated', backupDir)
    const changes: FileChange[] = [{ path: filePath, backupPath }]

    const result = validateOrRollback(makeStack({ configTestCommand: PASS_COMMAND }), changes)

    expect(result.ok).toBe(true)
    expect(fs.readFileSync(filePath, 'utf8')).toBe('mutated')
  })

  it('validateOrRollback with skipValidate: true leaves a failing config in place', () => {
    writeFileSafe(filePath, 'original', backupDir)
    const { backupPath } = writeFileSafe(filePath, 'mutated', backupDir)
    const changes: FileChange[] = [{ path: filePath, backupPath }]

    const result = validateOrRollback(makeStack({ configTestCommand: FAIL_COMMAND }), changes, true)

    expect(result.ok).toBe(true)
    expect(fs.readFileSync(filePath, 'utf8')).toBe('mutated')
  })
})
