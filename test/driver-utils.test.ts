import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { StackHandle, VHost } from '../src/core/types.js'
import { renderApacheBlock } from '../src/stacks/apache/template.js'
import { commentOutBlock } from '../src/stacks/block-file.js'
import {
  getConfigFilePath,
  removeVHostConfig,
  setVHostEnabled,
  vhostConfigExists,
  writeVHostConfig,
} from '../src/stacks/driver-utils.js'

function makeVHost(overrides: Partial<VHost> = {}): VHost {
  return {
    name: 'myapp',
    domain: 'myapp.local',
    docRoot: '/sites/myapp',
    stack: 'apache',
    port: 80,
    enabled: true,
    subdomains: [],
    configFile: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

let canSymlink = false

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vhostctl-symlink-check-'))
  const target = path.join(tmp, 'target.txt')
  const link = path.join(tmp, 'link.txt')
  fs.writeFileSync(target, 'x')
  try {
    fs.symlinkSync(target, link)
    canSymlink = true
  } catch {
    canSymlink = false
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

describe('driver-utils: single-file stack (e.g. XAMPP)', () => {
  let tmpDir: string
  let stack: StackHandle

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhostctl-driver-single-'))
    stack = {
      kind: 'xampp-apache',
      label: 'XAMPP (Apache)',
      writeMode: 'single-file',
      vhostsFilePath: path.join(tmpDir, 'httpd-vhosts.conf'),
      enableMechanism: 'comment-toggle',
      reloadCommand: ['echo', 'noop'],
      defaultDocroot: tmpDir,
      installRoot: tmpDir,
    }
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes a block into the shared vhosts file', () => {
    const vhost = makeVHost()
    const configFile = writeVHostConfig(stack, vhost, renderApacheBlock)

    expect(configFile).toBe(stack.vhostsFilePath)
    expect(vhostConfigExists(stack, vhost.name)).toBe(true)
    expect(fs.readFileSync(configFile, 'utf8')).toContain('ServerName myapp.local')
  })

  it('comments out the block when disabled, and restores it when re-enabled', () => {
    const vhost = makeVHost()
    writeVHostConfig(stack, vhost, renderApacheBlock)

    setVHostEnabled(stack, vhost, false, renderApacheBlock)
    const disabledContent = fs.readFileSync(stack.vhostsFilePath as string, 'utf8')
    expect(disabledContent).toContain(commentOutBlock(renderApacheBlock(vhost)))

    setVHostEnabled(stack, vhost, true, renderApacheBlock)
    const restored = fs.readFileSync(stack.vhostsFilePath as string, 'utf8')
    expect(restored).toContain(renderApacheBlock(vhost))
    expect(restored).not.toContain(commentOutBlock(renderApacheBlock(vhost)))
  })

  it('removes the block entirely', () => {
    const vhost = makeVHost()
    writeVHostConfig(stack, vhost, renderApacheBlock)
    removeVHostConfig(stack, vhost)

    expect(vhostConfigExists(stack, vhost.name)).toBe(false)
  })

  it('getConfigFilePath returns the shared file for single-file mode', () => {
    expect(getConfigFilePath(stack, 'myapp')).toBe(stack.vhostsFilePath)
  })
})

describe('driver-utils: per-site-file stack with comment-toggle (e.g. RHEL httpd)', () => {
  let tmpDir: string
  let stack: StackHandle

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhostctl-driver-persite-'))
    stack = {
      kind: 'apache',
      label: 'httpd (RHEL/CentOS)',
      writeMode: 'per-site-file',
      sitesAvailableDir: tmpDir,
      enableMechanism: 'comment-toggle',
      reloadCommand: ['echo', 'noop'],
      defaultDocroot: tmpDir,
      installRoot: tmpDir,
    }
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates one config file per site', () => {
    const vhost = makeVHost()
    const configFile = writeVHostConfig(stack, vhost, renderApacheBlock)

    expect(configFile).toBe(path.join(tmpDir, 'myapp.conf'))
    expect(fs.existsSync(configFile)).toBe(true)
  })

  it('removes the per-site file', () => {
    const vhost = makeVHost()
    writeVHostConfig(stack, vhost, renderApacheBlock)
    removeVHostConfig(stack, vhost)

    expect(fs.existsSync(path.join(tmpDir, 'myapp.conf'))).toBe(false)
  })
})

describe('driver-utils: per-site-file stack with symlink enable (e.g. Debian/Ubuntu)', () => {
  let tmpDir: string
  let stack: StackHandle

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhostctl-driver-symlink-'))
    stack = {
      kind: 'nginx',
      label: 'nginx (Debian/Ubuntu)',
      writeMode: 'per-site-file',
      sitesAvailableDir: path.join(tmpDir, 'sites-available'),
      sitesEnabledDir: path.join(tmpDir, 'sites-enabled'),
      enableMechanism: 'symlink',
      reloadCommand: ['echo', 'noop'],
      defaultDocroot: tmpDir,
      installRoot: tmpDir,
    }
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it.skipIf(!canSymlink)('symlinks into sites-enabled on write, and unlinks on disable', () => {
    const vhost = makeVHost()
    writeVHostConfig(stack, vhost, renderApacheBlock)

    const linkPath = path.join(stack.sitesEnabledDir as string, 'myapp.conf')
    expect(fs.existsSync(linkPath)).toBe(true)

    setVHostEnabled(stack, vhost, false, renderApacheBlock)
    expect(fs.existsSync(linkPath)).toBe(false)

    setVHostEnabled(stack, vhost, true, renderApacheBlock)
    expect(fs.existsSync(linkPath)).toBe(true)
  })
})
