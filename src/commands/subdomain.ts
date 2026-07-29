import type { Command } from 'commander'
import prompts from 'prompts'
import { ensureWritable } from '../core/elevate.js'
import { addEntries, removeDomains } from '../core/hosts-file.js'
import { findVHost, loadRegistry, saveRegistry, upsertVHost } from '../core/registry.js'
import type { Registry, StackHandle, VHost } from '../core/types.js'
import { detectAllStacks, getDriver } from '../stacks/detect.js'
import type { FileChange } from '../stacks/validate.js'
import { validateOrRollback } from '../stacks/validate.js'
import { getHostsFilePath } from '../utils/paths.js'
import { logger } from '../utils/logger.js'
import { reloadStack } from './reload.js'

function resolveSubdomain(vhost: VHost, sub: string): string {
  return sub.includes('.') ? sub : `${sub}.${vhost.domain}`
}

/** Splits a comma-separated `--sub` argument (or prompt answer) into distinct, trimmed entries. */
function splitSubs(input: string): string[] {
  return [...new Set(input.split(',').map((s) => s.trim()).filter(Boolean))]
}

async function pickVHostName(registry: Registry): Promise<string | undefined> {
  if (registry.vhosts.length === 0) {
    logger.error('No vhosts registered yet. Create one with `vhostctl add <name>`.')
    return undefined
  }
  if (registry.vhosts.length === 1) {
    return registry.vhosts[0]?.name
  }
  const response = await prompts({
    type: 'select',
    name: 'name',
    message: 'Which vhost?',
    choices: registry.vhosts.map((v) => ({
      title: `${v.name} (${v.domain})`,
      description: v.subdomains.length > 0 ? `${v.subdomains.length} subdomain(s)` : 'no subdomains yet',
      value: v.name,
    })),
  })
  if (!response.name) {
    logger.dim('Cancelled.')
    return undefined
  }
  return response.name as string
}

/**
 * Resolves a vhost by name, falling back to the interactive picker when no name was given, or
 * when the given name doesn't match anything — the latter keeps a typo from being a dead end.
 */
async function resolveVHostName(name: string | undefined, registry: Registry): Promise<string | undefined> {
  if (!name) return pickVHostName(registry)
  if (findVHost(registry, name)) return name

  const known = registry.vhosts.map((v) => v.name)
  if (known.length === 0) {
    logger.error('No vhosts registered yet. Create one with `vhostctl add <name>`.')
    return undefined
  }
  logger.warn(`No vhost named "${name}". Known vhosts: ${known.join(', ')}`)
  return pickVHostName(registry)
}

function resolveStackFor(registry: Registry, vhost: VHost): StackHandle {
  const stacks = registry.detectedStacks.length > 0 ? registry.detectedStacks : detectAllStacks()
  const stack = stacks.find((s) => s.kind === vhost.stack)
  if (!stack) {
    throw new Error(`Stack "${vhost.stack}" is no longer detected on this machine. Run \`vhostctl detect\` first.`)
  }
  return stack
}

/** Rebuilds the CLI args for a relaunch (elevated or not) so it replays the same flags the user actually passed. */
function subdomainRelaunchArgs(
  action: 'add' | 'remove',
  vhostName: string,
  domains: string[],
  options: { skipValidate?: boolean; reload?: boolean },
): string[] {
  const args = ['subdomain', action, vhostName, domains.join(',')]
  if (options.skipValidate) args.push('--skip-validate')
  if (options.reload === false) args.push('--no-reload')
  return args
}

/** Reloads the stack after a change, unless the caller passed --no-reload. Falls back to a manual-reload hint on failure. */
function reloadAfterChange(stack: StackHandle, reload: boolean | undefined): void {
  if (reload === false) {
    logger.info('Run `vhostctl reload` to apply the change.')
    return
  }
  const result = reloadStack(stack, { skipValidate: true })
  if (result.ok) {
    logger.success(`${stack.label} reloaded.`)
  } else {
    logger.error(`Failed to reload ${stack.label}: ${result.output || 'unknown error'}`)
    logger.dim('Run `vhostctl reload` manually.')
  }
}

async function subdomainAdd(
  name: string | undefined,
  sub: string | undefined,
  options: { skipValidate?: boolean; reload?: boolean },
): Promise<void> {
  const registry = loadRegistry()

  const vhostName = await resolveVHostName(name, registry)
  if (!vhostName) {
    process.exitCode = 1
    return
  }

  const vhost = findVHost(registry, vhostName)
  if (!vhost) {
    // resolveVHostName only ever returns names that exist in the registry.
    throw new Error(`No vhost named "${vhostName}".`)
  }

  let subInput = sub
  if (!subInput) {
    const response = await prompts({
      type: 'text',
      name: 'sub',
      message: 'Subdomain(s)',
      hint: 'e.g. api, or api,admin,app',
    })
    subInput = response.sub as string | undefined
  }
  if (!subInput) {
    logger.error('A subdomain is required.')
    process.exitCode = 1
    return
  }

  const requested = splitSubs(subInput).map((s) => resolveSubdomain(vhost, s))
  const alreadyLinked = requested.filter((d) => vhost.subdomains.includes(d))
  const domains = requested.filter((d) => !vhost.subdomains.includes(d))
  for (const d of alreadyLinked) {
    logger.info(`"${d}" is already linked to "${vhost.name}".`)
  }
  if (domains.length === 0) {
    return
  }

  const stack = resolveStackFor(registry, vhost)

  const updatedVHost: VHost = { ...vhost, subdomains: [...vhost.subdomains, ...domains] }
  const driver = getDriver(stack.kind)
  const configFile = driver.configFilePath(stack, vhost.name)
  ensureWritable([configFile, getHostsFilePath()], subdomainRelaunchArgs('add', vhost.name, domains, options))

  const changes: FileChange[] = []
  const written = driver.write(stack, updatedVHost)
  changes.push({ path: written.configFile, backupPath: written.backupPath })
  if (!vhost.enabled) {
    driver.setEnabled(stack, updatedVHost, false)
  }
  const hostsResult = addEntries(vhost.name, domains)
  if (hostsResult.added.length > 0) {
    changes.push({ path: getHostsFilePath(), backupPath: hostsResult.backupPath })
  }

  const validation = validateOrRollback(stack, changes, options.skipValidate)
  if (!validation.ok) {
    logger.error(`Configuration is invalid — changes rolled back.\n${validation.output}`)
    process.exitCode = 1
    return
  }

  saveRegistry(upsertVHost(registry, updatedVHost))

  if (domains.length === 1) {
    logger.success(`Linked subdomain "${domains[0]}" to "${vhost.name}".`)
  } else {
    logger.success(`Linked ${domains.length} subdomains to "${vhost.name}": ${domains.join(', ')}`)
  }
  reloadAfterChange(stack, options.reload)
}

async function subdomainRemove(
  name: string | undefined,
  sub: string | undefined,
  options: { skipValidate?: boolean; reload?: boolean },
): Promise<void> {
  const registry = loadRegistry()

  const vhostName = await resolveVHostName(name, registry)
  if (!vhostName) {
    process.exitCode = 1
    return
  }

  const vhost = findVHost(registry, vhostName)
  if (!vhost) {
    throw new Error(`No vhost named "${vhostName}".`)
  }

  if (vhost.subdomains.length === 0) {
    logger.info(`"${vhost.name}" has no linked subdomains.`)
    return
  }

  let domains: string[]
  if (sub) {
    const requested = splitSubs(sub).map((s) => resolveSubdomain(vhost, s))
    domains = requested.filter((d) => vhost.subdomains.includes(d))
    for (const d of requested) {
      if (!vhost.subdomains.includes(d)) logger.info(`"${d}" is not linked to "${vhost.name}".`)
    }
    if (domains.length === 0) return
  } else {
    const response = await prompts({
      type: 'multiselect',
      name: 'domains',
      message: 'Which subdomain(s)?',
      hint: '- space to select, enter to confirm',
      instructions: false,
      choices: vhost.subdomains.map((d) => ({ title: d, value: d })),
      min: 1,
    })
    if (!response.domains || (response.domains as string[]).length === 0) {
      logger.dim('Cancelled.')
      process.exitCode = 1
      return
    }
    domains = response.domains as string[]
  }

  const stack = resolveStackFor(registry, vhost)

  const updatedVHost: VHost = { ...vhost, subdomains: vhost.subdomains.filter((d) => !domains.includes(d)) }
  const driver = getDriver(stack.kind)
  const configFile = driver.configFilePath(stack, vhost.name)
  ensureWritable([configFile, getHostsFilePath()], subdomainRelaunchArgs('remove', vhost.name, domains, options))

  const changes: FileChange[] = []
  const written = driver.write(stack, updatedVHost)
  changes.push({ path: written.configFile, backupPath: written.backupPath })
  if (!vhost.enabled) {
    driver.setEnabled(stack, updatedVHost, false)
  }
  const hostsResult = removeDomains(vhost.name, domains)
  if (hostsResult.backupPath !== null) {
    changes.push({ path: getHostsFilePath(), backupPath: hostsResult.backupPath })
  }

  const validation = validateOrRollback(stack, changes, options.skipValidate)
  if (!validation.ok) {
    logger.error(`Configuration is invalid — changes rolled back.\n${validation.output}`)
    process.exitCode = 1
    return
  }

  saveRegistry(upsertVHost(registry, updatedVHost))

  if (domains.length === 1) {
    logger.success(`Unlinked subdomain "${domains[0]}" from "${vhost.name}".`)
  } else {
    logger.success(`Unlinked ${domains.length} subdomains from "${vhost.name}": ${domains.join(', ')}`)
  }
  reloadAfterChange(stack, options.reload)
}

async function subdomainList(name: string | undefined): Promise<void> {
  const registry = loadRegistry()

  if (!name) {
    if (registry.vhosts.length === 0) {
      logger.error('No vhosts registered yet. Create one with `vhostctl add <name>`.')
      process.exitCode = 1
      return
    }
    for (const vhost of registry.vhosts) {
      logger.heading(`${vhost.name} (${vhost.domain})`)
      if (vhost.subdomains.length === 0) {
        logger.dim('  no subdomains')
      } else {
        for (const domain of vhost.subdomains) {
          logger.plain(`  ${domain}`)
        }
      }
    }
    return
  }

  const vhostName = await resolveVHostName(name, registry)
  if (!vhostName) {
    process.exitCode = 1
    return
  }

  const vhost = findVHost(registry, vhostName)
  if (!vhost) {
    throw new Error(`No vhost named "${vhostName}".`)
  }

  if (vhost.subdomains.length === 0) {
    logger.info(`"${vhost.name}" has no linked subdomains.`)
    return
  }

  logger.heading(`Subdomains for ${vhost.name}`)
  for (const domain of vhost.subdomains) {
    logger.plain(`  ${domain}`)
  }
}

export function registerSubdomainCommand(program: Command): void {
  const subdomain = program.command('subdomain').description('Manage subdomains linked to a vhost')

  subdomain
    .command('add [name] [sub]')
    .description('Link one or more subdomains to an existing vhost')
    .option('--skip-validate', 'skip the config-test check after writing')
    .option('--no-reload', 'do not automatically reload the stack after applying the change')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl subdomain add myapp api
  $ vhostctl subdomain add myapp api,admin,app
  $ vhostctl subdomain add myapp admin.myapp.local
  $ vhostctl subdomain add
`,
    )
    .action(
      async (
        name: string | undefined,
        sub: string | undefined,
        options: { skipValidate?: boolean; reload?: boolean },
      ) => {
        await subdomainAdd(name, sub, options)
      },
    )

  subdomain
    .command('remove [name] [sub]')
    .alias('rm')
    .description('Unlink one or more subdomains from a vhost')
    .option('--skip-validate', 'skip the config-test check after writing')
    .option('--no-reload', 'do not automatically reload the stack after applying the change')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl subdomain remove myapp api
  $ vhostctl subdomain remove myapp api,admin
  $ vhostctl subdomain remove
`,
    )
    .action(
      async (
        name: string | undefined,
        sub: string | undefined,
        options: { skipValidate?: boolean; reload?: boolean },
      ) => {
        await subdomainRemove(name, sub, options)
      },
    )

  subdomain
    .command('list [name]')
    .alias('ls')
    .description('List subdomains linked to a vhost (or all vhosts, if no name is given)')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl subdomain list myapp
  $ vhostctl subdomain list
`,
    )
    .action(async (name: string | undefined) => {
      await subdomainList(name)
    })
}
