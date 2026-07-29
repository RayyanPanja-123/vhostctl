import fs from 'node:fs'
import type { StackKind } from './types.js'

export interface ManifestVHost {
  name: string
  domain: string
  root: string
  stack?: StackKind
  port?: number
  subdomains?: string[]
}

export interface ManifestDefaults {
  stack?: StackKind
  port?: number
}

export interface Manifest {
  defaults: ManifestDefaults
  vhosts: ManifestVHost[]
}

const STACK_KINDS: StackKind[] = ['xampp-apache', 'wamp-apache', 'apache', 'nginx']

function fail(message: string): never {
  throw new Error(message)
}

function requireString(value: unknown, context: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(`${context}: "${field}" is required.`)
  }
  return value
}

function readStackKind(value: unknown, context: string): StackKind | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !STACK_KINDS.includes(value as StackKind)) {
    fail(`${context}: "stack" must be one of ${STACK_KINDS.join(', ')}.`)
  }
  return value as StackKind
}

function readPort(value: unknown, context: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    fail(`${context}: "port" must be a positive integer.`)
  }
  return value
}

function readSubdomains(value: unknown, context: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    fail(`${context}: "subdomains" must be an array of strings.`)
  }
  return value.map((entry, index) => requireString(entry, `${context}.subdomains[${index}]`, 'subdomains[]'))
}

export function parseManifest(raw: string): Manifest {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch (error) {
    fail(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    fail('Manifest must be a JSON object with a "vhosts" array.')
  }
  const root = data as Record<string, unknown>

  const defaults: ManifestDefaults = {}
  if (root.defaults !== undefined) {
    if (typeof root.defaults !== 'object' || root.defaults === null || Array.isArray(root.defaults)) {
      fail('"defaults" must be an object.')
    }
    const d = root.defaults as Record<string, unknown>
    defaults.stack = readStackKind(d.stack, 'defaults')
    defaults.port = readPort(d.port, 'defaults')
  }

  if (!Array.isArray(root.vhosts) || root.vhosts.length === 0) {
    fail('"vhosts" must be a non-empty array.')
  }

  const seen = new Set<string>()
  const vhosts: ManifestVHost[] = root.vhosts.map((entry, index) => {
    const context = `vhosts[${index}]`
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      fail(`${context}: must be an object.`)
    }
    const v = entry as Record<string, unknown>

    const name = requireString(v.name, context, 'name')
    if (seen.has(name)) {
      fail(`Duplicate vhost name "${name}".`)
    }
    seen.add(name)

    const domain = requireString(v.domain, context, 'domain')
    const root_ = requireString(v.root, context, 'root')
    const stack = readStackKind(v.stack, context)
    const port = readPort(v.port, context)
    const subdomains = readSubdomains(v.subdomains, context)

    return { name, domain, root: root_, stack, port, subdomains }
  })

  return { defaults, vhosts }
}

export function loadManifestFile(filePath: string): Manifest {
  let raw: string
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      fail(`Manifest file not found: ${filePath}`)
    }
    throw error
  }
  return parseManifest(raw)
}
