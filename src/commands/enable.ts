import type { Command } from 'commander'
import { toggleVHost } from './toggle.js'

export function registerEnableCommand(program: Command): void {
  program
    .command('enable <name>')
    .description('Re-enable a disabled virtual host')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl enable myapp
`,
    )
    .action((name: string) => toggleVHost(name, true))
}
