import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reloadStack } from '../src/commands/reload.js'
import type { StackHandle } from '../src/core/types.js'

const PASS_COMMAND = [process.execPath, '-e', 'process.exit(0)']
const FAIL_COMMAND = [process.execPath, '-e', 'process.exit(1)']

describe('reloadStack', () => {
  let tmpDir: string
  let markerPath: string
  let reloadCommand: string[]
  let stack: StackHandle

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhostctl-reload-'))
    markerPath = path.join(tmpDir, 'marker.txt')
    reloadCommand = [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(markerPath)}, 'reloaded')`]
    stack = {
      kind: 'nginx',
      label: 'nginx (test)',
      writeMode: 'per-site-file',
      sitesAvailableDir: tmpDir,
      enableMechanism: 'comment-toggle',
      reloadCommand,
      defaultDocroot: tmpDir,
      installRoot: tmpDir,
    }
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reloads when the config test passes', () => {
    const result = reloadStack({ ...stack, configTestCommand: PASS_COMMAND })
    expect(result.ok).toBe(true)
    expect(fs.existsSync(markerPath)).toBe(true)
  })

  it('does not run the reload command when the config test fails', () => {
    const result = reloadStack({ ...stack, configTestCommand: FAIL_COMMAND })
    expect(result.ok).toBe(false)
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('--skip-validate bypasses a failing config test and reloads anyway', () => {
    const result = reloadStack({ ...stack, configTestCommand: FAIL_COMMAND }, { skipValidate: true })
    expect(result.ok).toBe(true)
    expect(fs.existsSync(markerPath)).toBe(true)
  })

  it('reloads anyway when configTestCommand is missing (back-compat with a pre-upgrade registry)', () => {
    const result = reloadStack({ ...stack, configTestCommand: undefined })
    expect(result.ok).toBe(true)
    expect(fs.existsSync(markerPath)).toBe(true)
  })
})
