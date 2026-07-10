import type { Command } from 'commander'
import { toggleVHost } from './toggle.js'

export function registerEnableCommand(program: Command): void {
  program
    .command('enable <name>')
    .description('Re-enable a disabled virtual host')
    .option('--skip-validate', 'skip the config-test check after enabling')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl enable myapp
`,
    )
    .action((name: string, options: { skipValidate?: boolean }) => toggleVHost(name, true, options.skipValidate))
}
