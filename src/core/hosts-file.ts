import fs from 'node:fs'
import { getHostsFilePath } from '../utils/paths.js'

const LOOPBACK_IP = '127.0.0.1'

function marker(name: string): string {
  return `# vhostctl:${name}`
}

export function buildHostsLine(name: string, domain: string): string {
  return `${LOOPBACK_IP} ${domain} ${marker(name)}`
}

export function readHostsFile(hostsPath: string = getHostsFilePath()): string {
  return fs.existsSync(hostsPath) ? fs.readFileSync(hostsPath, 'utf8') : ''
}

function splitLines(content: string): string[] {
  if (!content) return []
  const lines = content.split(/\r?\n/)
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') {
    lines.pop()
  }
  return lines
}

export function getManagedDomains(name: string, hostsPath: string = getHostsFilePath()): string[] {
  const suffix = marker(name)
  return splitLines(readHostsFile(hostsPath))
    .filter((line) => line.trim().endsWith(suffix))
    .map((line) => line.trim().split(/\s+/)[1])
    .filter((domain): domain is string => Boolean(domain))
}

/** Appends hosts-file lines for any domains not already managed under `name`. Returns the lines actually added. */
export function addEntries(name: string, domains: string[], hostsPath: string = getHostsFilePath()): string[] {
  const existingManaged = new Set(getManagedDomains(name, hostsPath))
  const newLines = domains.filter((domain) => !existingManaged.has(domain)).map((domain) => buildHostsLine(name, domain))
  if (newLines.length === 0) return []

  const lines = [...splitLines(readHostsFile(hostsPath)), ...newLines]
  fs.writeFileSync(hostsPath, lines.join('\n') + '\n', 'utf8')
  return newLines
}

/** Removes every hosts-file line managed under `name`. */
export function removeEntries(name: string, hostsPath: string = getHostsFilePath()): void {
  const content = readHostsFile(hostsPath)
  if (!content) return
  const suffix = marker(name)
  const lines = splitLines(content).filter((line) => !line.trim().endsWith(suffix))
  fs.writeFileSync(hostsPath, lines.join('\n') + '\n', 'utf8')
}

/** Removes only the hosts-file line for one specific domain managed under `name`. */
export function removeDomain(name: string, domain: string, hostsPath: string = getHostsFilePath()): void {
  const content = readHostsFile(hostsPath)
  if (!content) return
  const suffix = marker(name)
  const lines = splitLines(content).filter((line) => {
    const trimmed = line.trim()
    if (!trimmed.endsWith(suffix)) return true
    return trimmed.split(/\s+/)[1] !== domain
  })
  fs.writeFileSync(hostsPath, lines.join('\n') + '\n', 'utf8')
}

/** Preview the lines that would be added, without touching the file (used by --dry-run). */
export function previewEntries(name: string, domains: string[]): string[] {
  return domains.map((domain) => buildHostsLine(name, domain))
}

export function isHostsWritable(hostsPath: string = getHostsFilePath()): boolean {
  try {
    fs.accessSync(hostsPath, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}
