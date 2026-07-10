import type { Command } from 'commander'
import { loadRegistry } from '../core/registry.js'
import type { StackHandle } from '../core/types.js'
import { detectAllStacks } from '../stacks/detect.js'
import { validateStack } from '../stacks/validate.js'
import { restartStandaloneApacheWindows, runCommand, type ExecResult } from '../utils/exec.js'
import { logger } from '../utils/logger.js'

interface ReloadStackOptions {
  skipValidate?: boolean
}

/** Validates (unless skipped) then reloads one stack. Does not run `reloadCommand` if validation fails. */
export function reloadStack(stack: StackHandle, options: ReloadStackOptions = {}): ExecResult {
  if (!options.skipValidate) {
    const validation = validateStack(stack)
    if (!validation.ok) {
      return { ok: false, output: `Config test failed:\n${validation.output}` }
    }
  }

  let result = runCommand(stack.reloadCommand)

  const isWindowsApacheServiceMissing =
    !result.ok &&
    process.platform === 'win32' &&
    stack.reloadCommand[1] === '-k' &&
    /No installed service/i.test(result.output)
  if (isWindowsApacheServiceMissing) {
    logger.dim('Apache is not registered as a Windows service — restarting it as a standalone process instead.')
    result = restartStandaloneApacheWindows(stack.reloadCommand[0] as string)
  }

  return result
}

interface ReloadCliOptions {
  skipValidate?: boolean
}

export function registerReloadCommand(program: Command): void {
  program
    .command('reload')
    .alias('restart')
    .description('Reload/restart the detected web server(s) so vhost changes take effect')
    .option('--skip-validate', 'skip the config-test check before reloading')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl reload
`,
    )
    .action((options: ReloadCliOptions) => {
      const registry = loadRegistry()
      const stacks = registry.detectedStacks.length > 0 ? registry.detectedStacks : detectAllStacks()

      if (stacks.length === 0) {
        logger.warn('No stack detected. Run `vhostctl detect` first.')
        return
      }

      for (const stack of stacks) {
        logger.info(`Reloading ${stack.label}…`)
        const result = reloadStack(stack, { skipValidate: options.skipValidate })

        if (result.ok) {
          logger.success(`${stack.label} reloaded.`)
        } else {
          logger.error(`Failed to reload ${stack.label}: ${result.output || 'unknown error'}`)
          logger.dim(`You may need to restart it manually: ${stack.reloadCommand.join(' ')}`)
        }
      }
    })
}
