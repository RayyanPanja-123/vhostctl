import type { Command } from 'commander'
import prompts from 'prompts'
import { ensureWritable } from '../core/elevate.js'
import { removeEntries } from '../core/hosts-file.js'
import { findVHost, loadRegistry, removeVHost, saveRegistry } from '../core/registry.js'
import { detectAllStacks, getDriver } from '../stacks/detect.js'
import type { FileChange } from '../stacks/validate.js'
import { validateOrRollback } from '../stacks/validate.js'
import { getHostsFilePath } from '../utils/paths.js'
import { logger } from '../utils/logger.js'

interface RemoveOptions {
  yes?: boolean
  skipValidate?: boolean
}

export function registerRemoveCommand(program: Command): void {
  program
    .command('remove <name>')
    .alias('rm')
    .description('Remove a virtual host (config block + hosts entries)')
    .option('-y, --yes', 'skip the confirmation prompt')
    .option('--skip-validate', 'skip the config-test check after removing')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl remove myapp
  $ vhostctl remove myapp --yes
`,
    )
    .action(async (name: string, options: RemoveOptions) => {
      const registry = loadRegistry()
      const vhost = findVHost(registry, name)
      if (!vhost) {
        logger.error(`No vhost named "${name}". Run \`vhostctl list\` to see what's registered.`)
        process.exitCode = 1
        return
      }

      if (!options.yes) {
        const response = await prompts({
          type: 'confirm',
          name: 'confirmed',
          message: `Remove vhost "${name}" (${vhost.domain})? This edits config files and the hosts file.`,
          initial: false,
        })
        if (!response.confirmed) {
          logger.dim('Cancelled.')
          return
        }
      }

      const stacks = registry.detectedStacks.length > 0 ? registry.detectedStacks : detectAllStacks()
      const stack = stacks.find((s) => s.kind === vhost.stack)
      if (!stack) {
        throw new Error(
          `Stack "${vhost.stack}" is no longer detected on this machine. Run \`vhostctl detect\`, or remove the registry entry manually.`,
        )
      }

      const driver = getDriver(stack.kind)
      const configFile = driver.configFilePath(stack, vhost.name)
      const relaunchArgs = ['remove', name, '--yes']
      if (options.skipValidate) relaunchArgs.push('--skip-validate')
      ensureWritable([configFile, getHostsFilePath()], relaunchArgs)

      const changes: FileChange[] = []
      const configBackup = driver.remove(stack, vhost)
      if (configBackup !== null) {
        changes.push({ path: configFile, backupPath: configBackup })
      }

      const hostsBackup = removeEntries(vhost.name)
      if (hostsBackup !== null) {
        changes.push({ path: getHostsFilePath(), backupPath: hostsBackup })
      }

      const validation = validateOrRollback(stack, changes, options.skipValidate)
      if (!validation.ok) {
        logger.error(`Configuration is invalid — changes rolled back.\n${validation.output}`)
        process.exitCode = 1
        return
      }

      saveRegistry(removeVHost(registry, vhost.name))

      logger.success(`Removed vhost "${name}".`)
      logger.info('Run `vhostctl reload` to apply the change.')
    })
}
