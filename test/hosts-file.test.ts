import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addEntries, getManagedDomains, previewEntries, removeDomain, removeEntries } from '../src/core/hosts-file.js'

describe('hosts-file', () => {
  let tmpDir: string
  let hostsPath: string
  let backupDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhostctl-hosts-'))
    hostsPath = path.join(tmpDir, 'hosts')
    backupDir = path.join(tmpDir, 'backups')
    fs.writeFileSync(hostsPath, '127.0.0.1 localhost\n::1 localhost\n', 'utf8')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('adds new managed entries without touching unrelated lines', () => {
    const { added, backupPath } = addEntries('myapp', ['myapp.local'], hostsPath, backupDir)
    expect(added).toEqual(['127.0.0.1 myapp.local # vhostctl:myapp'])
    expect(backupPath).not.toBeNull()
    expect(fs.readFileSync(backupPath as string, 'utf8')).toBe('127.0.0.1 localhost\n::1 localhost\n')

    const content = fs.readFileSync(hostsPath, 'utf8')
    expect(content).toContain('127.0.0.1 localhost')
    expect(content).toContain('127.0.0.1 myapp.local # vhostctl:myapp')
  })

  it('does not duplicate an already-managed domain, and reports no backup for the no-op', () => {
    addEntries('myapp', ['myapp.local'], hostsPath, backupDir)
    const second = addEntries('myapp', ['myapp.local'], hostsPath, backupDir)
    expect(second.added).toEqual([])
    expect(second.backupPath).toBeNull()

    const matches = fs.readFileSync(hostsPath, 'utf8').match(/myapp\.local/g) ?? []
    expect(matches).toHaveLength(1)
  })

  it('lists only the domains managed under a given name', () => {
    addEntries('myapp', ['myapp.local', 'api.myapp.local'], hostsPath, backupDir)
    addEntries('other', ['other.local'], hostsPath, backupDir)

    expect(getManagedDomains('myapp', hostsPath).sort()).toEqual(['api.myapp.local', 'myapp.local'])
    expect(getManagedDomains('other', hostsPath)).toEqual(['other.local'])
  })

  it('removes only entries for the given name', () => {
    addEntries('myapp', ['myapp.local'], hostsPath, backupDir)
    addEntries('other', ['other.local'], hostsPath, backupDir)

    const backupPath = removeEntries('myapp', hostsPath, backupDir)
    expect(backupPath).not.toBeNull()

    const content = fs.readFileSync(hostsPath, 'utf8')
    expect(content).not.toContain('myapp.local')
    expect(content).toContain('other.local')
    expect(content).toContain('127.0.0.1 localhost')
  })

  it('removes a single subdomain while keeping the rest of that vhost intact', () => {
    addEntries('myapp', ['myapp.local', 'api.myapp.local'], hostsPath, backupDir)

    removeDomain('myapp', 'api.myapp.local', hostsPath, backupDir)

    expect(getManagedDomains('myapp', hostsPath)).toEqual(['myapp.local'])
  })

  it('preview does not write to the file', () => {
    const lines = previewEntries('myapp', ['myapp.local'])
    expect(lines).toEqual(['127.0.0.1 myapp.local # vhostctl:myapp'])
    expect(fs.readFileSync(hostsPath, 'utf8')).not.toContain('myapp.local')
  })
})
