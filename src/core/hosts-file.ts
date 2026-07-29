import fs from 'node:fs'
import { writeFileSafe } from '../utils/fs-safe.js'
import { getBackupDir, getHostsFilePath } from '../utils/paths.js'

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

/** Appends hosts-file lines for any domains not already managed under `name`. Returns the added lines and backup path. */
export function addEntries(
  name: string,
  domains: string[],
  hostsPath: string = getHostsFilePath(),
  backupDir: string = getBackupDir(),
): { added: string[]; backupPath: string | null } {
  const existingManaged = new Set(getManagedDomains(name, hostsPath))
  const newLines = domains.filter((domain) => !existingManaged.has(domain)).map((domain) => buildHostsLine(name, domain))
  if (newLines.length === 0) return { added: [], backupPath: null }

  const lines = [...splitLines(readHostsFile(hostsPath)), ...newLines]
  const { backupPath } = writeFileSafe(hostsPath, lines.join('\n') + '\n', backupDir)
  return { added: newLines, backupPath }
}

/** Removes every hosts-file line managed under `name`. Returns the backup path, or `null`. */
export function removeEntries(
  name: string,
  hostsPath: string = getHostsFilePath(),
  backupDir: string = getBackupDir(),
): string | null {
  const content = readHostsFile(hostsPath)
  if (!content) return null
  const suffix = marker(name)
  const lines = splitLines(content).filter((line) => !line.trim().endsWith(suffix))
  return writeFileSafe(hostsPath, lines.join('\n') + '\n', backupDir).backupPath
}

/** Removes only the hosts-file line for one specific domain managed under `name`. Returns the backup path, or `null`. */
export function removeDomain(
  name: string,
  domain: string,
  hostsPath: string = getHostsFilePath(),
  backupDir: string = getBackupDir(),
): string | null {
  const content = readHostsFile(hostsPath)
  if (!content) return null
  const suffix = marker(name)
  const lines = splitLines(content).filter((line) => {
    const trimmed = line.trim()
    if (!trimmed.endsWith(suffix)) return true
    return trimmed.split(/\s+/)[1] !== domain
  })
  return writeFileSafe(hostsPath, lines.join('\n') + '\n', backupDir).backupPath
}

/** Removes the hosts-file lines for several domains managed under `name` in one write. Returns which were actually removed and the backup path, or `null` if nothing matched. */
export function removeDomains(
  name: string,
  domains: string[],
  hostsPath: string = getHostsFilePath(),
  backupDir: string = getBackupDir(),
): { removed: string[]; backupPath: string | null } {
  const content = readHostsFile(hostsPath)
  if (!content) return { removed: [], backupPath: null }
  const suffix = marker(name)
  const toRemove = new Set(domains)
  const removed: string[] = []
  const lines = splitLines(content).filter((line) => {
    const trimmed = line.trim()
    if (!trimmed.endsWith(suffix)) return true
    const domain = trimmed.split(/\s+/)[1]
    if (domain && toRemove.has(domain)) {
      removed.push(domain)
      return false
    }
    return true
  })
  if (removed.length === 0) return { removed: [], backupPath: null }
  return { removed, backupPath: writeFileSafe(hostsPath, lines.join('\n') + '\n', backupDir).backupPath }
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
