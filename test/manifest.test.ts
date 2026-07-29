import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadManifestFile, parseManifest } from '../src/core/manifest.js'

const VALID = JSON.stringify({
  defaults: { stack: 'nginx', port: 80 },
  vhosts: [
    { name: 'myapp', domain: 'myapp.com', root: '/var/www/myapp', subdomains: ['api', 'admin.myapp.com'] },
    { name: 'blog', domain: 'blog.myapp.com', root: '/var/www/blog' },
  ],
})

describe('parseManifest', () => {
  it('parses a valid manifest and fills in per-vhost defaults', () => {
    const manifest = parseManifest(VALID)
    expect(manifest.defaults).toEqual({ stack: 'nginx', port: 80 })
    expect(manifest.vhosts).toHaveLength(2)
    expect(manifest.vhosts[0]).toEqual({
      name: 'myapp',
      domain: 'myapp.com',
      root: '/var/www/myapp',
      stack: undefined,
      port: undefined,
      subdomains: ['api', 'admin.myapp.com'],
    })
    expect(manifest.vhosts[1]?.subdomains).toEqual([])
  })

  it('rejects malformed JSON', () => {
    expect(() => parseManifest('{ not json')).toThrow(/Invalid JSON/)
  })

  it('rejects a non-object root', () => {
    expect(() => parseManifest('[]')).toThrow(/must be a JSON object/)
  })

  it('rejects a missing or empty vhosts array', () => {
    expect(() => parseManifest(JSON.stringify({}))).toThrow(/"vhosts" must be a non-empty array/)
    expect(() => parseManifest(JSON.stringify({ vhosts: [] }))).toThrow(/"vhosts" must be a non-empty array/)
  })

  it.each(['name', 'domain', 'root'])('rejects a vhost missing "%s"', (field) => {
    const vhost: Record<string, unknown> = { name: 'a', domain: 'a.com', root: '/var/www/a' }
    delete vhost[field]
    expect(() => parseManifest(JSON.stringify({ vhosts: [vhost] }))).toThrow(new RegExp(`"${field}" is required`))
  })

  it('rejects duplicate vhost names', () => {
    const vhosts = [
      { name: 'a', domain: 'a.com', root: '/var/www/a' },
      { name: 'a', domain: 'a2.com', root: '/var/www/a2' },
    ]
    expect(() => parseManifest(JSON.stringify({ vhosts }))).toThrow(/Duplicate vhost name "a"/)
  })

  it('rejects an invalid stack kind', () => {
    const vhosts = [{ name: 'a', domain: 'a.com', root: '/var/www/a', stack: 'iis' }]
    expect(() => parseManifest(JSON.stringify({ vhosts }))).toThrow(/"stack" must be one of/)
  })

  it('rejects a non-integer port', () => {
    const vhosts = [{ name: 'a', domain: 'a.com', root: '/var/www/a', port: 80.5 }]
    expect(() => parseManifest(JSON.stringify({ vhosts }))).toThrow(/"port" must be a positive integer/)
  })

  it('rejects non-array and non-string subdomains', () => {
    const withNonArray = [{ name: 'a', domain: 'a.com', root: '/var/www/a', subdomains: 'api' }]
    expect(() => parseManifest(JSON.stringify({ vhosts: withNonArray }))).toThrow(/"subdomains" must be an array/)

    const withNonString = [{ name: 'a', domain: 'a.com', root: '/var/www/a', subdomains: [42] }]
    expect(() => parseManifest(JSON.stringify({ vhosts: withNonString }))).toThrow(/subdomains\[\]/)
  })

  it('rejects an invalid defaults object', () => {
    expect(() => parseManifest(JSON.stringify({ defaults: { port: 'x' }, vhosts: [{ name: 'a', domain: 'a.com', root: '/r' }] }))).toThrow(
      /"port" must be a positive integer/,
    )
  })
})

describe('loadManifestFile', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhostctl-manifest-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('reads and parses a manifest file from disk', () => {
    const filePath = path.join(tmpDir, 'vhosts.json')
    fs.writeFileSync(filePath, VALID)

    const manifest = loadManifestFile(filePath)
    expect(manifest.vhosts.map((v) => v.name)).toEqual(['myapp', 'blog'])
  })

  it('throws a friendly error when the file does not exist', () => {
    expect(() => loadManifestFile(path.join(tmpDir, 'missing.json'))).toThrow(/Manifest file not found/)
  })
})
