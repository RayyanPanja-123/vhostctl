import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectApacheStacks } from '../src/stacks/apache/detector.js'

// These tests run on whatever platform CI/dev is on. We only assert Windows-specific
// detection here since that's the environment this project is developed against;
// the detector's own platform branches are exercised for real by `vhostctl detect`.
const describeOnWindows = process.platform === 'win32' ? describe : describe.skip

describeOnWindows('detectApacheStacks (win32)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('finds XAMPP when its httpd-vhosts.conf exists and nothing else does', () => {
    const xamppVhosts = path.join('C:\\xampp', 'apache', 'conf', 'extra', 'httpd-vhosts.conf')
    vi.spyOn(fs, 'existsSync').mockImplementation((target) => target === xamppVhosts)

    const stacks = detectApacheStacks()

    expect(stacks).toHaveLength(1)
    expect(stacks[0]).toMatchObject({
      kind: 'xampp-apache',
      writeMode: 'single-file',
      vhostsFilePath: xamppVhosts,
    })
  })

  it('finds WAMP by locating the newest apache* subdirectory and the alias dir', () => {
    const apacheParent = path.join('C:\\wamp64', 'bin', 'apache')
    const aliasDir = path.join('C:\\wamp64', 'alias')

    vi.spyOn(fs, 'existsSync').mockImplementation((target) => target === apacheParent || target === aliasDir)
    vi.spyOn(fs, 'readdirSync').mockImplementation((dir) => {
      if (dir !== apacheParent) return []
      return [
        { name: 'apache2.4.51', isDirectory: () => true },
        { name: 'apache2.4.58', isDirectory: () => true },
      ] as unknown as fs.Dirent[]
    })

    const stacks = detectApacheStacks()

    expect(stacks).toHaveLength(1)
    expect(stacks[0]).toMatchObject({ kind: 'wamp-apache', writeMode: 'per-site-file', sitesAvailableDir: aliasDir })
    // picks the lexicographically-last version directory
    expect(stacks[0]?.reloadCommand?.[0]).toContain('apache2.4.58')
  })

  it('returns no stacks when nothing is installed', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    expect(detectApacheStacks()).toEqual([])
  })
})
