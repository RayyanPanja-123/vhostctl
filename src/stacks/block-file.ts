import fs from 'node:fs'

function startMarker(name: string): string {
  return `# vhostctl:${name}:start`
}

function endMarker(name: string): string {
  return `# vhostctl:${name}:end`
}

export function wrapMarkers(name: string, block: string): string {
  return `${startMarker(name)}\n${block}\n${endMarker(name)}\n`
}

/** Insert or replace a marker-delimited block inside a shared config file. */
export function upsertBlock(filePath: string, name: string, block: string): void {
  const wrapped = wrapMarkers(name, block)
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  const start = content.indexOf(startMarker(name))
  const end = content.indexOf(endMarker(name))
  if (start !== -1 && end !== -1) {
    const before = content.slice(0, start)
    const after = content.slice(end + endMarker(name).length)
    content = before + wrapped.trimEnd() + '\n' + after
  } else {
    const separator = content.length === 0 || content.endsWith('\n\n') ? '' : content.endsWith('\n') ? '\n' : '\n\n'
    content = content + separator + wrapped
  }
  fs.writeFileSync(filePath, content, 'utf8')
}

/** Remove a marker-delimited block from a shared config file, if present. */
export function removeBlock(filePath: string, name: string): void {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf8')
  const start = content.indexOf(startMarker(name))
  const end = content.indexOf(endMarker(name))
  if (start === -1 || end === -1) return
  const before = content.slice(0, start)
  const after = content.slice(end + endMarker(name).length)
  const cleaned = (before.trimEnd() + '\n' + after.trimStart()).replace(/\n{3,}/g, '\n\n')
  fs.writeFileSync(filePath, cleaned, 'utf8')
}

export function hasBlock(filePath: string, name: string): boolean {
  if (!fs.existsSync(filePath)) return false
  return fs.readFileSync(filePath, 'utf8').includes(startMarker(name))
}

export function readBlockBody(filePath: string, name: string): string | null {
  if (!fs.existsSync(filePath)) return null
  const content = fs.readFileSync(filePath, 'utf8')
  const start = content.indexOf(startMarker(name))
  const end = content.indexOf(endMarker(name))
  if (start === -1 || end === -1) return null
  return content.slice(start + startMarker(name).length, end).trim()
}

export function commentOutBlock(block: string): string {
  return block
    .split('\n')
    .map((line) => (line.trim().length === 0 ? line : `# ${line}`))
    .join('\n')
}

export function isBlockCommented(block: string): boolean {
  const lines = block.split('\n').filter((line) => line.trim().length > 0)
  return lines.length > 0 && lines.every((line) => line.trim().startsWith('#'))
}
