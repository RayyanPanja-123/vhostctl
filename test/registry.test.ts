import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findVHost, loadRegistry, removeVHost, saveRegistry, setDetectedStacks, upsertVHost } from '../src/core/registry.js'
import type { StackHandle, VHost } from '../src/core/types.js'

function makeVHost(overrides: Partial<VHost> = {}): VHost {
  return {
    name: 'myapp',
    domain: 'myapp.local',
    docRoot: '/sites/myapp',
    stack: 'apache',
    port: 80,
    enabled: true,
    subdomains: [],
    configFile: '/etc/apache2/sites-available/myapp.conf',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('registry', () => {
  let tmpDir: string
  let registryPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhostctl-registry-'))
    registryPath = path.join(tmpDir, 'vhosts.json')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns an empty registry when no file exists yet', () => {
    const registry = loadRegistry(registryPath)
    expect(registry).toEqual({ vhosts: [], detectedStacks: [], detectedAt: null })
  })

  it('round-trips a saved registry', () => {
    const registry = upsertVHost(loadRegistry(registryPath), makeVHost())
    saveRegistry(registry, registryPath)

    const reloaded = loadRegistry(registryPath)
    expect(reloaded.vhosts).toHaveLength(1)
    expect(findVHost(reloaded, 'myapp')?.domain).toBe('myapp.local')
  })

  it('upsert replaces an existing vhost with the same name instead of duplicating it', () => {
    let registry = loadRegistry(registryPath)
    registry = upsertVHost(registry, makeVHost({ port: 80 }))
    registry = upsertVHost(registry, makeVHost({ port: 8080 }))

    expect(registry.vhosts).toHaveLength(1)
    expect(registry.vhosts[0]?.port).toBe(8080)
  })

  it('removes a vhost by name', () => {
    let registry = loadRegistry(registryPath)
    registry = upsertVHost(registry, makeVHost({ name: 'a' }))
    registry = upsertVHost(registry, makeVHost({ name: 'b' }))
    registry = removeVHost(registry, 'a')

    expect(registry.vhosts.map((v) => v.name)).toEqual(['b'])
  })

  it('stores detected stacks with a timestamp', () => {
    const stack: StackHandle = {
      kind: 'nginx',
      label: 'nginx (Debian/Ubuntu)',
      writeMode: 'per-site-file',
      sitesAvailableDir: '/etc/nginx/sites-available',
      sitesEnabledDir: '/etc/nginx/sites-enabled',
      enableMechanism: 'symlink',
      reloadCommand: ['nginx', '-s', 'reload'],
      defaultDocroot: '/var/www/html',
      installRoot: '/etc/nginx',
    }
    const registry = setDetectedStacks(loadRegistry(registryPath), [stack], '2026-01-01T00:00:00.000Z')

    expect(registry.detectedStacks).toEqual([stack])
    expect(registry.detectedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
