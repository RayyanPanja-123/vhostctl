import fs from 'node:fs'
import path from 'node:path'
import type { StackHandle, VHost } from '../core/types.js'
import { commentOutBlock, hasBlock, removeBlock, upsertBlock, wrapMarkers } from './block-file.js'

export type BlockRenderer = (vhost: VHost) => string

function perSiteFilePath(stack: StackHandle, name: string): string {
  return path.join(stack.sitesAvailableDir as string, `${name}.conf`)
}

function perSiteLinkPath(stack: StackHandle, name: string): string {
  return path.join(stack.sitesEnabledDir as string, `${name}.conf`)
}

/** Writes the vhost's config (creating it or replacing an existing block) and returns the config file path. */
export function writeVHostConfig(stack: StackHandle, vhost: VHost, render: BlockRenderer): string {
  const block = render(vhost)
  if (stack.writeMode === 'single-file') {
    upsertBlock(stack.vhostsFilePath as string, vhost.name, block)
    return stack.vhostsFilePath as string
  }
  const filePath = perSiteFilePath(stack, vhost.name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, wrapMarkers(vhost.name, block), 'utf8')
  if (stack.enableMechanism === 'symlink' && stack.sitesEnabledDir) {
    fs.mkdirSync(stack.sitesEnabledDir, { recursive: true })
    const linkPath = perSiteLinkPath(stack, vhost.name)
    if (!fs.existsSync(linkPath)) {
      fs.symlinkSync(filePath, linkPath)
    }
  }
  return filePath
}

export function removeVHostConfig(stack: StackHandle, vhost: VHost): void {
  if (stack.writeMode === 'single-file') {
    removeBlock(stack.vhostsFilePath as string, vhost.name)
    return
  }
  if (stack.enableMechanism === 'symlink' && stack.sitesEnabledDir) {
    const linkPath = perSiteLinkPath(stack, vhost.name)
    if (fs.existsSync(linkPath)) fs.rmSync(linkPath)
  }
  const filePath = perSiteFilePath(stack, vhost.name)
  if (fs.existsSync(filePath)) fs.rmSync(filePath)
}

export function setVHostEnabled(stack: StackHandle, vhost: VHost, enabled: boolean, render: BlockRenderer): void {
  if (stack.enableMechanism === 'symlink' && stack.writeMode === 'per-site-file' && stack.sitesEnabledDir) {
    const filePath = perSiteFilePath(stack, vhost.name)
    const linkPath = perSiteLinkPath(stack, vhost.name)
    if (enabled) {
      fs.mkdirSync(stack.sitesEnabledDir, { recursive: true })
      if (!fs.existsSync(linkPath)) fs.symlinkSync(filePath, linkPath)
    } else if (fs.existsSync(linkPath)) {
      fs.rmSync(linkPath)
    }
    return
  }

  const rendered = render(vhost)
  const block = enabled ? rendered : commentOutBlock(rendered)
  if (stack.writeMode === 'single-file') {
    upsertBlock(stack.vhostsFilePath as string, vhost.name, block)
  } else {
    const filePath = perSiteFilePath(stack, vhost.name)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, wrapMarkers(vhost.name, block), 'utf8')
  }
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
