import type { Command } from 'commander'
import { loadRegistry } from '../core/registry.js'
import { detectAllStacks } from '../stacks/detect.js'
import { runCommand } from '../utils/exec.js'
import { logger } from '../utils/logger.js'

export function registerReloadCommand(program: Command): void {
  program
    .command('reload')
    .alias('restart')
    .description('Reload/restart the detected web server(s) so vhost changes take effect')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl reload
`,
    )
    .action(() => {
      const registry = loadRegistry()
      const stacks = registry.detectedStacks.length > 0 ? registry.detectedStacks : detectAllStacks()

      if (stacks.length === 0) {
        logger.warn('No stack detected. Run `vhostctl detect` first.')
        return
      }

      for (const stack of stacks) {
        logger.info(`Reloading ${stack.label}…`)
        const result = runCommand(stack.reloadCommand)
        if (result.ok) {
          logger.success(`${stack.label} reloaded.`)
        } else {
          logger.error(`Failed to reload ${stack.label}: ${result.output || 'unknown error'}`)
          logger.dim(`You may need to restart it manually: ${stack.reloadCommand.join(' ')}`)
        }
      }
    })
}
