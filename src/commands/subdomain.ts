import type { Command } from 'commander'
import prompts from 'prompts'
import { ensureWritable } from '../core/elevate.js'
import { addEntries, removeDomain } from '../core/hosts-file.js'
import { findVHost, loadRegistry, saveRegistry, upsertVHost } from '../core/registry.js'
import type { Registry, VHost } from '../core/types.js'
import { detectAllStacks, getDriver } from '../stacks/detect.js'
import { getHostsFilePath } from '../utils/paths.js'
import { logger } from '../utils/logger.js'

function resolveSubdomain(vhost: VHost, sub: string): string {
  return sub.includes('.') ? sub : `${sub}.${vhost.domain}`
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
    choices: registry.vhosts.map((v) => ({ title: `${v.name} (${v.domain})`, value: v.name })),
  })
  if (!response.name) {
    logger.dim('Cancelled.')
    return undefined
  }
  return response.name as string
}

async function resolveVHostName(name: string | undefined, registry: Registry): Promise<string | undefined> {
  return name ?? pickVHostName(registry)
}

async function subdomainAdd(name: string | undefined, sub: string | undefined): Promise<void> {
  const registry = loadRegistry()

  const vhostName = await resolveVHostName(name, registry)
  if (!vhostName) {
    process.exitCode = 1
    return
  }

  const vhost = findVHost(registry, vhostName)
  if (!vhost) {
    logger.error(`No vhost named "${vhostName}". Run \`vhostctl list\` to see what's registered.`)
    process.exitCode = 1
    return
  }

  let subInput = sub
  if (!subInput) {
    const response = await prompts({
      type: 'text',
      name: 'sub',
      message: 'Subdomain',
      hint: 'e.g. api, or admin.example.local',
    })
    subInput = response.sub as string | undefined
  }
  if (!subInput) {
    logger.error('A subdomain is required.')
    process.exitCode = 1
    return
  }

  const domain = resolveSubdomain(vhost, subInput)
  if (vhost.subdomains.includes(domain)) {
    logger.info(`"${domain}" is already linked to "${vhost.name}".`)
    return
  }

  const stacks = registry.detectedStacks.length > 0 ? registry.detectedStacks : detectAllStacks()
  const stack = stacks.find((s) => s.kind === vhost.stack)
  if (!stack) {
    throw new Error(`Stack "${vhost.stack}" is no longer detected on this machine. Run \`vhostctl detect\` first.`)
  }

  const updatedVHost: VHost = { ...vhost, subdomains: [...vhost.subdomains, domain] }
  const driver = getDriver(stack.kind)
  const configFile = driver.configFilePath(stack, vhost.name)
  ensureWritable([configFile, getHostsFilePath()], ['subdomain', 'add', vhost.name, domain])

  driver.write(stack, updatedVHost)
  if (!vhost.enabled) {
    driver.setEnabled(stack, updatedVHost, false)
  }
  addEntries(vhost.name, [domain])

  saveRegistry(upsertVHost(registry, updatedVHost))

  logger.success(`Linked subdomain "${domain}" to "${vhost.name}".`)
  logger.info('Run `vhostctl reload` to apply the change.')
}

async function subdomainRemove(name: string | undefined, sub: string | undefined): Promise<void> {
  const registry = loadRegistry()

  const vhostName = await resolveVHostName(name, registry)
  if (!vhostName) {
    process.exitCode = 1
    return
  }

  const vhost = findVHost(registry, vhostName)
  if (!vhost) {
    logger.error(`No vhost named "${vhostName}". Run \`vhostctl list\` to see what's registered.`)
    process.exitCode = 1
    return
  }

  if (vhost.subdomains.length === 0) {
    logger.info(`"${vhost.name}" has no linked subdomains.`)
    return
  }

  let domain: string
  if (sub) {
    domain = resolveSubdomain(vhost, sub)
    if (!vhost.subdomains.includes(domain)) {
      logger.info(`"${domain}" is not linked to "${vhost.name}".`)
      return
    }
  } else {
    const response = await prompts({
      type: 'select',
      name: 'domain',
      message: 'Which subdomain?',
      choices: vhost.subdomains.map((d) => ({ title: d, value: d })),
    })
    if (!response.domain) {
      logger.dim('Cancelled.')
      process.exitCode = 1
      return
    }
    domain = response.domain as string
  }

  const stacks = registry.detectedStacks.length > 0 ? registry.detectedStacks : detectAllStacks()
  const stack = stacks.find((s) => s.kind === vhost.stack)
  if (!stack) {
    throw new Error(`Stack "${vhost.stack}" is no longer detected on this machine. Run \`vhostctl detect\` first.`)
  }

  const updatedVHost: VHost = { ...vhost, subdomains: vhost.subdomains.filter((d) => d !== domain) }
  const driver = getDriver(stack.kind)
  const configFile = driver.configFilePath(stack, vhost.name)
  ensureWritable([configFile, getHostsFilePath()], ['subdomain', 'remove', vhost.name, domain])

  driver.write(stack, updatedVHost)
  if (!vhost.enabled) {
    driver.setEnabled(stack, updatedVHost, false)
  }
  removeDomain(vhost.name, domain)

  saveRegistry(upsertVHost(registry, updatedVHost))

  logger.success(`Unlinked subdomain "${domain}" from "${vhost.name}".`)
  logger.info('Run `vhostctl reload` to apply the change.')
}

async function subdomainList(name: string | undefined): Promise<void> {
  const registry = loadRegistry()

  const vhostName = await resolveVHostName(name, registry)
  if (!vhostName) {
    process.exitCode = 1
    return
  }

  const vhost = findVHost(registry, vhostName)
  if (!vhost) {
    logger.error(`No vhost named "${vhostName}". Run \`vhostctl list\` to see what's registered.`)
    process.exitCode = 1
    return
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
    .description('Link a subdomain to an existing vhost')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl subdomain add myapp api
  $ vhostctl subdomain add myapp admin.myapp.local
  $ vhostctl subdomain add
`,
    )
    .action(async (name: string | undefined, sub: string | undefined) => {
      await subdomainAdd(name, sub)
    })

  subdomain
    .command('remove [name] [sub]')
    .alias('rm')
    .description('Unlink a subdomain from a vhost')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl subdomain remove myapp api
  $ vhostctl subdomain remove
`,
    )
    .action(async (name: string | undefined, sub: string | undefined) => {
      await subdomainRemove(name, sub)
    })

  subdomain
    .command('list [name]')
    .alias('ls')
    .description('List subdomains linked to a vhost')
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
