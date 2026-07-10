import fs from 'node:fs'
import path from 'node:path'
import type { StackHandle, VHost } from '../core/types.js'
import { deleteFileSafe, writeFileSafe } from '../utils/fs-safe.js'
import { getBackupDir } from '../utils/paths.js'
import { commentOutBlock, hasBlock, removeBlock, upsertBlock, wrapMarkers } from './block-file.js'

export type BlockRenderer = (vhost: VHost) => string

function perSiteFilePath(stack: StackHandle, name: string): string {
  return path.join(stack.sitesAvailableDir as string, `${name}.conf`)
}

function perSiteLinkPath(stack: StackHandle, name: string): string {
  return path.join(stack.sitesEnabledDir as string, `${name}.conf`)
}

/** Writes the vhost's config (creating it or replacing an existing block). Returns the config file path and backup path. */
export function writeVHostConfig(
  stack: StackHandle,
  vhost: VHost,
  render: BlockRenderer,
  backupDir: string = getBackupDir(),
): { configFile: string; backupPath: string | null } {
  const block = render(vhost)
  if (stack.writeMode === 'single-file') {
    const backupPath = upsertBlock(stack.vhostsFilePath as string, vhost.name, block, backupDir)
    return { configFile: stack.vhostsFilePath as string, backupPath }
  }
  const filePath = perSiteFilePath(stack, vhost.name)
  const { backupPath } = writeFileSafe(filePath, wrapMarkers(vhost.name, block), backupDir)
  if (stack.enableMechanism === 'symlink' && stack.sitesEnabledDir) {
    fs.mkdirSync(stack.sitesEnabledDir, { recursive: true })
    const linkPath = perSiteLinkPath(stack, vhost.name)
    if (!fs.existsSync(linkPath)) {
      fs.symlinkSync(filePath, linkPath)
    }
  }
  return { configFile: filePath, backupPath }
}

/** Removes the vhost's config. Returns the backup path, or `null`. */
export function removeVHostConfig(stack: StackHandle, vhost: VHost, backupDir: string = getBackupDir()): string | null {
  if (stack.writeMode === 'single-file') {
    return removeBlock(stack.vhostsFilePath as string, vhost.name, backupDir)
  }
  if (stack.enableMechanism === 'symlink' && stack.sitesEnabledDir) {
    const linkPath = perSiteLinkPath(stack, vhost.name)
    if (fs.existsSync(linkPath)) fs.rmSync(linkPath)
  }
  const filePath = perSiteFilePath(stack, vhost.name)
  if (!fs.existsSync(filePath)) return null
  return deleteFileSafe(filePath, backupDir)
}

/** Enables/disables the vhost. Returns the backup path, or `null` if only a symlink was toggled (no content change). */
export function setVHostEnabled(
  stack: StackHandle,
  vhost: VHost,
  enabled: boolean,
  render: BlockRenderer,
  backupDir: string = getBackupDir(),
): string | null {
  if (stack.enableMechanism === 'symlink' && stack.writeMode === 'per-site-file' && stack.sitesEnabledDir) {
    const filePath = perSiteFilePath(stack, vhost.name)
    const linkPath = perSiteLinkPath(stack, vhost.name)
    if (enabled) {
      fs.mkdirSync(stack.sitesEnabledDir, { recursive: true })
      if (!fs.existsSync(linkPath)) fs.symlinkSync(filePath, linkPath)
    } else if (fs.existsSync(linkPath)) {
      fs.rmSync(linkPath)
    }
    return null
  }

  const rendered = render(vhost)
  const block = enabled ? rendered : commentOutBlock(rendered)
  if (stack.writeMode === 'single-file') {
    return upsertBlock(stack.vhostsFilePath as string, vhost.name, block, backupDir)
  }
  const filePath = perSiteFilePath(stack, vhost.name)
  return writeFileSafe(filePath, wrapMarkers(vhost.name, block), backupDir).backupPath
}

export function vhostConfigExists(stack: StackHandle, name: string): boolean {
  if (stack.writeMode === 'single-file') {
    return hasBlock(stack.vhostsFilePath as string, name)
  }
  return fs.existsSync(perSiteFilePath(stack, name))
}

export function getConfigFilePath(stack: StackHandle, name: string): string {
  return stack.writeMode === 'single-file' ? (stack.vhostsFilePath as string) : perSiteFilePath(stack, name)
}
