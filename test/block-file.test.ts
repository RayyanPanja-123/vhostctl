import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  commentOutBlock,
  hasBlock,
  isBlockCommented,
  readBlockBody,
  removeBlock,
  upsertBlock,
  wrapMarkers,
} from '../src/stacks/block-file.js'

describe('block-file', () => {
  let tmpDir: string
  let filePath: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhostctl-block-'))
    filePath = path.join(tmpDir, 'httpd-vhosts.conf')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('inserts a new marker-wrapped block into an empty file', () => {
    upsertBlock(filePath, 'myapp', '<VirtualHost *:80>\n</VirtualHost>')
    const content = fs.readFileSync(filePath, 'utf8')

    expect(content).toContain('# vhostctl:myapp:start')
    expect(content).toContain('# vhostctl:myapp:end')
    expect(hasBlock(filePath, 'myapp')).toBe(true)
  })

  it('preserves unrelated content already in the file', () => {
    fs.writeFileSync(filePath, '# hand-written comment\n<VirtualHost *:80>\n  ServerName existing.local\n</VirtualHost>\n')
    upsertBlock(filePath, 'myapp', 'new block body')

    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).toContain('existing.local')
    expect(content).toContain('new block body')
  })

  it('replaces an existing block in place rather than duplicating it', () => {
    upsertBlock(filePath, 'myapp', 'version one')
    upsertBlock(filePath, 'myapp', 'version two')

    const content = fs.readFileSync(filePath, 'utf8')
    expect(content.match(/vhostctl:myapp:start/g)).toHaveLength(1)
    expect(readBlockBody(filePath, 'myapp')).toBe('version two')
  })

  it('removes only the targeted block, leaving other vhosts and content intact', () => {
    upsertBlock(filePath, 'myapp', 'myapp block')
    upsertBlock(filePath, 'other', 'other block')

    removeBlock(filePath, 'myapp')

    const content = fs.readFileSync(filePath, 'utf8')
    expect(content).not.toContain('myapp block')
    expect(content).toContain('other block')
  })

  it('removeBlock is a no-op when the block does not exist', () => {
    fs.writeFileSync(filePath, 'untouched content\n')
    removeBlock(filePath, 'missing')
    expect(fs.readFileSync(filePath, 'utf8')).toBe('untouched content\n')
  })

  it('wrapMarkers produces a block readable back via readBlockBody', () => {
    const wrapped = wrapMarkers('myapp', 'body text')
    fs.writeFileSync(filePath, wrapped)
    expect(readBlockBody(filePath, 'myapp')).toBe('body text')
  })

  it('commentOutBlock prefixes every non-blank line, and isBlockCommented detects it', () => {
    const block = 'line one\n\nline two'
    const commented = commentOutBlock(block)

    expect(commented).toBe('# line one\n\n# line two')
    expect(isBlockCommented(commented)).toBe(true)
    expect(isBlockCommented(block)).toBe(false)
  })
})
