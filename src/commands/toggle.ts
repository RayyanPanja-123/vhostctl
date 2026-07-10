import { ensureWritable } from '../core/elevate.js'
import { findVHost, loadRegistry, saveRegistry, upsertVHost } from '../core/registry.js'
import { detectAllStacks, getDriver } from '../stacks/detect.js'
import type { FileChange } from '../stacks/validate.js'
import { validateOrRollback } from '../stacks/validate.js'
import { logger } from '../utils/logger.js'

export function toggleVHost(name: string, enabled: boolean, skipValidate?: boolean): void {
  const registry = loadRegistry()
  const vhost = findVHost(registry, name)
  if (!vhost) {
    logger.error(`No vhost named "${name}". Run \`vhostctl list\` to see what's registered.`)
    process.exitCode = 1
    return
  }

  if (vhost.enabled === enabled) {
    logger.info(`"${name}" is already ${enabled ? 'enabled' : 'disabled'}.`)
    return
  }

  const stacks = registry.detectedStacks.length > 0 ? registry.detectedStacks : detectAllStacks()
  const stack = stacks.find((s) => s.kind === vhost.stack)
  if (!stack) {
    throw new Error(`Stack "${vhost.stack}" is no longer detected on this machine. Run \`vhostctl detect\` first.`)
  }

  const driver = getDriver(stack.kind)
  const configFile = driver.configFilePath(stack, vhost.name)
  ensureWritable([configFile])

  const backupPath = driver.setEnabled(stack, vhost, enabled)

  // Symlink toggles only add/remove a symlink — no file content changed that could newly break a config test.
  if (stack.enableMechanism !== 'symlink') {
    const changes: FileChange[] = [{ path: configFile, backupPath }]
    const validation = validateOrRollback(stack, changes, skipValidate)
    if (!validation.ok) {
      logger.error(`Configuration is invalid — changes rolled back.\n${validation.output}`)
      process.exitCode = 1
      return
    }
  }

  saveRegistry(upsertVHost(registry, { ...vhost, enabled }))

  logger.success(`"${name}" is now ${enabled ? 'enabled' : 'disabled'}.`)
  logger.info('Run `vhostctl reload` to apply the change.')
}
