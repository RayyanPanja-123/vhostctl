import type { Command } from 'commander'
import { getManagedDomains } from '../core/hosts-file.js'
import { findVHost, loadRegistry } from '../core/registry.js'
import { logger } from '../utils/logger.js'

function printField(label: string, value: string): void {
  logger.plain(`${label.padEnd(14)}${value}`)
}

export function registerViewCommand(program: Command): void {
  program
    .command('view <name>')
    .alias('show')
    .alias('info')
    .description('Show full details for one virtual host')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl view myapp
`,
    )
    .action((name: string) => {
      const registry = loadRegistry()
      const vhost = findVHost(registry, name)
      if (!vhost) {
        logger.error(`No vhost named "${name}". Run \`vhostctl list\` to see what's registered.`)
        process.exitCode = 1
        return
      }

      logger.heading(vhost.name)
      printField('Domain:', vhost.domain)
      printField('Document root:', vhost.docRoot)
      printField('Stack:', vhost.stack)
      printField('Port:', String(vhost.port))
      printField('Status:', vhost.enabled ? 'enabled' : 'disabled')
      printField('Config file:', vhost.configFile)
      printField('Created:', vhost.createdAt)
      printField('Subdomains:', vhost.subdomains.length ? vhost.subdomains.join(', ') : '(none)')

      const hostsLines = getManagedDomains(vhost.name)
      logger.plain('')
      logger.plain(`Hosts entries:${hostsLines.length ? '' : ' (none)'}`)
      for (const domain of hostsLines) {
        logger.plain(`  127.0.0.1 ${domain}`)
      }
    })
}
