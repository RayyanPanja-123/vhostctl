import type { Command } from 'commander'
import { toggleVHost } from './toggle.js'

export function registerDisableCommand(program: Command): void {
  program
    .command('disable <name>')
    .description('Disable a virtual host without deleting it')
    .option('--skip-validate', 'skip the config-test check after disabling')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl disable myapp
`,
    )
    .action((name: string, options: { skipValidate?: boolean }) => toggleVHost(name, false, options.skipValidate))
}
