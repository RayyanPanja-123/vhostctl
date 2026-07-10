import fs from 'node:fs'
import { writeFileSafe } from '../utils/fs-safe.js'
import { getBackupDir, getRegistryPath } from '../utils/paths.js'
import type { Registry, StackHandle, VHost } from './types.js'

function emptyRegistry(): Registry {
  return { vhosts: [], detectedStacks: [], detectedAt: null }
}

export function loadRegistry(registryPath: string = getRegistryPath()): Registry {
  if (!fs.existsSync(registryPath)) {
    return emptyRegistry()
  }
  const raw = fs.readFileSync(registryPath, 'utf8')
  if (!raw.trim()) {
    return emptyRegistry()
  }
  const parsed = JSON.parse(raw) as Partial<Registry>
  return {
    vhosts: parsed.vhosts ?? [],
    detectedStacks: parsed.detectedStacks ?? [],
    detectedAt: parsed.detectedAt ?? null,
  }
}

export function saveRegistry(
  registry: Registry,
  registryPath: string = getRegistryPath(),
  backupDir: string = getBackupDir(),
): string | null {
  return writeFileSafe(registryPath, JSON.stringify(registry, null, 2) + '\n', backupDir).backupPath
}

export function findVHost(registry: Registry, name: string): VHost | undefined {
  return registry.vhosts.find((v) => v.name === name)
}

export function upsertVHost(registry: Registry, vhost: VHost): Registry {
  const others = registry.vhosts.filter((v) => v.name !== vhost.name)
  return { ...registry, vhosts: [...others, vhost] }
}

export function removeVHost(registry: Registry, name: string): Registry {
  return { ...registry, vhosts: registry.vhosts.filter((v) => v.name !== name) }
}

export function setDetectedStacks(registry: Registry, stacks: StackHandle[], detectedAt: string): Registry {
  return { ...registry, detectedStacks: stacks, detectedAt }
}
