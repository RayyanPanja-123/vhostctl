import Table from 'cli-table3'
import type { Command } from 'commander'
import { loadRegistry } from '../core/registry.js'
import { logger } from '../utils/logger.js'

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List all registered virtual hosts')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl list
`,
    )
    .action(() => {
      const registry = loadRegistry()
      if (registry.vhosts.length === 0) {
        logger.info('No vhosts registered yet. Create one with `vhostctl add <name>`.')
        return
      }

      const table = new Table({ head: ['Name', 'Domain', 'Stack', 'Status', 'Subdomains'] })
      for (const vhost of registry.vhosts) {
        table.push([
          vhost.name,
          vhost.domain,
          vhost.stack,
          vhost.enabled ? 'enabled' : 'disabled',
          String(vhost.subdomains.length),
        ])
      }
      console.log(table.toString())
    })
}
