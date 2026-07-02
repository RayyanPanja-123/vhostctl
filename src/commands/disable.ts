import type { Command } from 'commander'
import { toggleVHost } from './toggle.js'

export function registerDisableCommand(program: Command): void {
  program
    .command('disable <name>')
    .description('Disable a virtual host without deleting it')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl disable myapp
`,
    )
    .action((name: string) => toggleVHost(name, false))
}
