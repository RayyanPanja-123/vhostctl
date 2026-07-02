import { createRequire } from 'node:module'
import { Command } from 'commander'
import { printBanner } from './banner.js'
import { registerAddCommand } from './commands/add.js'
import { registerDetectCommand } from './commands/detect.js'
import { registerDisableCommand } from './commands/disable.js'
import { registerEnableCommand } from './commands/enable.js'
import { registerExamplesCommand } from './commands/examples.js'
import { registerListCommand } from './commands/list.js'
import { registerReloadCommand } from './commands/reload.js'
import { registerRemoveCommand } from './commands/remove.js'
import { registerSubdomainCommand } from './commands/subdomain.js'
import { registerViewCommand } from './commands/view.js'
import { logger } from './utils/logger.js'

const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }

const program = new Command()

program
  .name('vhostctl')
  .description('Manage local virtual hosts across XAMPP, WAMP, and standalone Apache/Nginx — on Windows, macOS, and Linux.')
  .version(pkg.version, '-v, --version')
  .addHelpText('beforeAll', () => {
    printBanner(pkg.version)
    return ''
  })
  .addHelpText(
    'after',
    `
Examples:
  $ vhostctl detect
  $ vhostctl add myapp --domain myapp.local
  $ vhostctl list
  $ vhostctl view myapp
  $ vhostctl subdomain add myapp api
  $ vhostctl reload

Run \`vhostctl examples\` for more real-world recipes.
`,
  )

registerDetectCommand(program)
registerAddCommand(program)
registerListCommand(program)
registerViewCommand(program)
registerRemoveCommand(program)
registerEnableCommand(program)
registerDisableCommand(program)
registerSubdomainCommand(program)
registerReloadCommand(program)
registerExamplesCommand(program)

if (process.argv.length <= 2) {
  program.outputHelp()
  process.exit(0)
}

program.parseAsync(process.argv).catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
