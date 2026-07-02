import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addEntries, getManagedDomains, previewEntries, removeDomain, removeEntries } from '../src/core/hosts-file.js'

describe('hosts-file', () => {
  let tmpDir: string
  let hostsPath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhostctl-hosts-'))
    hostsPath = path.join(tmpDir, 'hosts')
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n::1 localhost\n', 'utf8')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('adds new managed entries without touching unrelated lines', () => {
    const added = addEntries('myapp', ['myapp.local'], hostsPath)
    expect(added).toEqual(['127.0.0.1 myapp.local # vhostctl:myapp'])

    const content = fs.readFileSync(hostsPath, 'utf8')
    expect(content).toContain('127.0.0.1 localhost')
    expect(content).toContain('127.0.0.1 myapp.local # vhostctl:myapp')
  })

  it('does not duplicate an already-managed domain', () => {
    addEntries('myapp', ['myapp.local'], hostsPath)
    const secondAdd = addEntries('myapp', ['myapp.local'], hostsPath)
    expect(secondAdd).toEqual([])

    const matches = fs.readFileSync(hostsPath, 'utf8').match(/myapp\.local/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('lists only the domains managed under a given name', () => {
    addEntries('myapp', ['myapp.local', 'api.myapp.local'], hostsPath)
    addEntries('other', ['other.local'], hostsPath)

    expect(getManagedDomains('myapp', hostsPath).sort()).toEqual(['api.myapp.local', 'myapp.local'])
    expect(getManagedDomains('other', hostsPath)).toEqual(['other.local'])
  })

  it('removes only entries for the given name', () => {
    addEntries('myapp', ['myapp.local'], hostsPath)
    addEntries('other', ['other.local'], hostsPath)

    removeEntries('myapp', hostsPath)

    const content = fs.readFileSync(hostsPath, 'utf8')
    expect(content).not.toContain('myapp.local')
    expect(content).toContain('other.local')
    expect(content).toContain('127.0.0.1 localhost')
  })

  it('removes a single subdomain while keeping the rest of that vhost intact', () => {
    addEntries('myapp', ['myapp.local', 'api.myapp.local'], hostsPath)

    removeDomain('myapp', 'api.myapp.local', hostsPath)

    expect(getManagedDomains('myapp', hostsPath)).toEqual(['myapp.local'])
  })

  it('preview does not write to the file', () => {
    const lines = previewEntries('myapp', ['myapp.local'])
    expect(lines).toEqual(['127.0.0.1 myapp.local # vhostctl:myapp'])
    expect(fs.readFileSync(hostsPath, 'utf8')).not.toContain('myapp.local')
  })
})
