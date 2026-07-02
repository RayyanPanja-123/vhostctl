import Table from 'cli-table3'
import type { Command } from 'commander'
import { loadRegistry, saveRegistry, setDetectedStacks } from '../core/registry.js'
import { detectAllStacks } from '../stacks/detect.js'
import { logger } from '../utils/logger.js'

export function registerDetectCommand(program: Command): void {
  program
    .command('detect')
    .alias('doctor')
    .description('Scan this machine for XAMPP, WAMP, Apache, and Nginx installs')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl detect
`,
    )
    .action(() => {
      const stacks = detectAllStacks()
      const registry = loadRegistry()
      saveRegistry(setDetectedStacks(registry, stacks, new Date().toISOString()))

      if (stacks.length === 0) {
        logger.warn('No supported web server stack was found on this machine.')
        logger.dim('Supported: XAMPP, WAMP (Windows), standalone Apache, standalone Nginx.')
        return
      }

      logger.heading('Detected stacks')
      const table = new Table({ head: ['Stack', 'Mode', 'Config location'] })
      for (const stack of stacks) {
        table.push([
          stack.label,
          stack.writeMode === 'single-file' ? 'shared file' : 'per-site files',
          stack.writeMode === 'single-file' ? (stack.vhostsFilePath ?? '') : (stack.sitesAvailableDir ?? ''),
        ])
      }
      console.log(table.toString())
    })
}
