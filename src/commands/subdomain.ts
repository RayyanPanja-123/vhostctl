import type { Command } from 'commander'
import { ensureWritable } from '../core/elevate.js'
import { addEntries, removeDomain } from '../core/hosts-file.js'
import { findVHost, loadRegistry, saveRegistry, upsertVHost } from '../core/registry.js'
import type { VHost } from '../core/types.js'
import { detectAllStacks, getDriver } from '../stacks/detect.js'
import { getHostsFilePath } from '../utils/paths.js'
import { logger } from '../utils/logger.js'

function resolveSubdomain(vhost: VHost, sub: string): string {
  return sub.includes('.') ? sub : `${sub}.${vhost.domain}`
}

async function subdomainAdd(name: string, sub: string): Promise<void> {
  const registry = loadRegistry()
  const vhost = findVHost(registry, name)
  if (!vhost) {
    logger.error(`No vhost named "${name}". Run \`vhostctl list\` to see what's registered.`)
    process.exitCode = 1
    return
  }

  const domain = resolveSubdomain(vhost, sub)
  if (vhost.subdomains.includes(domain)) {
    logger.info(`"${domain}" is already linked to "${name}".`)
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
  ensureWritable([configFile, getHostsFilePath()])

  driver.write(stack, updatedVHost)
  if (!vhost.enabled) {
    driver.setEnabled(stack, updatedVHost, false)
  }
  addEntries(vhost.name, [domain])

  saveRegistry(upsertVHost(registry, updatedVHost))

  logger.success(`Linked subdomain "${domain}" to "${name}".`)
  logger.info('Run `vhostctl reload` to apply the change.')
}

async function subdomainRemove(name: string, sub: string): Promise<void> {
  const registry = loadRegistry()
  const vhost = findVHost(registry, name)
  if (!vhost) {
    logger.error(`No vhost named "${name}". Run \`vhostctl list\` to see what's registered.`)
    process.exitCode = 1
    return
  }

  const domain = resolveSubdomain(vhost, sub)
  if (!vhost.subdomains.includes(domain)) {
    logger.info(`"${domain}" is not linked to "${name}".`)
    return
  }

  const stacks = registry.detectedStacks.length > 0 ? registry.detectedStacks : detectAllStacks()
  const stack = stacks.find((s) => s.kind === vhost.stack)
  if (!stack) {
    throw new Error(`Stack "${vhost.stack}" is no longer detected on this machine. Run \`vhostctl detect\` first.`)
  }

  const updatedVHost: VHost = { ...vhost, subdomains: vhost.subdomains.filter((d) => d !== domain) }
  const driver = getDriver(stack.kind)
  const configFile = driver.configFilePath(stack, vhost.name)
  ensureWritable([configFile, getHostsFilePath()])

  driver.write(stack, updatedVHost)
  if (!vhost.enabled) {
    driver.setEnabled(stack, updatedVHost, false)
  }
  removeDomain(vhost.name, domain)

  saveRegistry(upsertVHost(registry, updatedVHost))

  logger.success(`Unlinked subdomain "${domain}" from "${name}".`)
  logger.info('Run `vhostctl reload` to apply the change.')
}

function subdomainList(name: string): void {
  const registry = loadRegistry()
  const vhost = findVHost(registry, name)
  if (!vhost) {
    logger.error(`No vhost named "${name}". Run \`vhostctl list\` to see what's registered.`)
    process.exitCode = 1
    return
  }

  if (vhost.subdomains.length === 0) {
    logger.info(`"${name}" has no linked subdomains.`)
    return
  }

  logger.heading(`Subdomains for ${name}`)
  for (const domain of vhost.subdomains) {
    logger.plain(`  ${domain}`)
  }
}

export function registerSubdomainCommand(program: Command): void {
  const subdomain = program.command('subdomain').description('Manage subdomains linked to a vhost')

  subdomain
    .command('add <name> <sub>')
    .description('Link a subdomain to an existing vhost')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl subdomain add myapp api
  $ vhostctl subdomain add myapp admin.myapp.local
`,
    )
    .action(async (name: string, sub: string) => {
      await subdomainAdd(name, sub)
    })

  subdomain
    .command('remove <name> <sub>')
    .alias('rm')
    .description('Unlink a subdomain from a vhost')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl subdomain remove myapp api
`,
    )
    .action(async (name: string, sub: string) => {
      await subdomainRemove(name, sub)
    })

  subdomain
    .command('list <name>')
    .alias('ls')
    .description('List subdomains linked to a vhost')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl subdomain list myapp
`,
    )
    .action((name: string) => {
      subdomainList(name)
    })
}
