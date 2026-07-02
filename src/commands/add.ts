import path from 'node:path'
import type { Command } from 'commander'
import prompts from 'prompts'
import { ensureWritable } from '../core/elevate.js'
import { addEntries, previewEntries } from '../core/hosts-file.js'
import { findVHost, loadRegistry, saveRegistry, upsertVHost } from '../core/registry.js'
import type { StackHandle, StackKind, VHost } from '../core/types.js'
import { detectAllStacks, getDriver } from '../stacks/detect.js'
import { getHostsFilePath } from '../utils/paths.js'
import { logger } from '../utils/logger.js'

interface AddCliOptions {
  domain?: string
  root?: string
  stack?: StackKind
  port?: string
  hosts?: boolean
  dryRun?: boolean
}

export function registerAddCommand(program: Command): void {
  program
    .command('add <name>')
    .description('Create a new virtual host')
    .option('-d, --domain <domain>', 'domain to serve (defaults to <name>.local)')
    .option('-r, --root <path>', 'document root directory')
    .option('-s, --stack <stack>', 'xampp-apache | wamp-apache | apache | nginx')
    .option('-p, --port <port>', 'port to listen on', '80')
    .option('--no-hosts', 'skip editing the OS hosts file')
    .option('--dry-run', 'preview changes without writing anything')
    .addHelpText(
      'after',
      `
Examples:
  $ vhostctl add myapp
  $ vhostctl add myapp --domain myapp.local --root D:/sites/myapp
  $ vhostctl add api --stack nginx --port 8080 --dry-run
`,
    )
    .action(async (name: string, options: AddCliOptions) => {
      await addVHost(name, options)
    })
}

async function pickStack(options: AddCliOptions): Promise<StackHandle> {
  const registry = loadRegistry()
  const stacks = registry.detectedStacks.length > 0 ? registry.detectedStacks : detectAllStacks()

  if (stacks.length === 0) {
    throw new Error('No web server stack detected. Run `vhostctl detect` first, or install XAMPP/WAMP/Apache/Nginx.')
  }

  if (options.stack) {
    const match = stacks.find((s) => s.kind === options.stack)
    if (!match) {
      throw new Error(
        `Stack "${options.stack}" was not detected on this machine. Run \`vhostctl detect\` to see what is available.`,
      )
    }
    return match
  }

  if (stacks.length === 1) {
    return stacks[0] as StackHandle
  }

  const response = await prompts({
    type: 'select',
    name: 'stack',
    message: 'Which stack should this vhost use?',
    choices: stacks.map((s) => ({ title: s.label, value: s.kind })),
  })

  const chosen = stacks.find((s) => s.kind === response.stack)
  if (!chosen) {
    throw new Error('No stack selected.')
  }
  return chosen
}

async function addVHost(name: string, options: AddCliOptions): Promise<void> {
  const registry = loadRegistry()

  if (findVHost(registry, name)) {
    throw new Error(`A vhost named "${name}" already exists. Use \`vhostctl remove ${name}\` first, or pick another name.`)
  }

  const stack = await pickStack(options)

  let domain = options.domain
  if (!domain) {
    const response = await prompts({
      type: 'text',
      name: 'domain',
      message: 'Domain',
      initial: `${name}.local`,
    })
    domain = response.domain || `${name}.local`
  }

  let docRoot = options.root
  if (!docRoot) {
    const response = await prompts({
      type: 'text',
      name: 'root',
      message: 'Document root',
      initial: path.join(stack.defaultDocroot, name),
    })
    docRoot = response.root || path.join(stack.defaultDocroot, name)
  }

  const port = Number.parseInt(options.port ?? '80', 10) || 80
  const useHosts = options.hosts !== false

  const vhost: VHost = {
    name,
    domain,
    docRoot: path.resolve(docRoot),
    stack: stack.kind,
    port,
    enabled: true,
    subdomains: [],
    configFile: '',
    createdAt: new Date().toISOString(),
  }

  const driver = getDriver(stack.kind)
  const configFile = driver.configFilePath(stack, vhost.name)
  vhost.configFile = configFile

  if (options.dryRun) {
    logger.heading(`Dry run — ${stack.label}`)
    logger.plain(`Config file: ${configFile}`)
    logger.plain('')
    logger.plain(driver.render(vhost))
    if (useHosts) {
      logger.plain('')
      logger.plain(`Hosts file (${getHostsFilePath()}):`)
      for (const line of previewEntries(name, [domain])) {
        logger.plain(`  ${line}`)
      }
    }
    return
  }

  const pathsToCheck = [configFile]
  if (useHosts) pathsToCheck.push(getHostsFilePath())
  ensureWritable(pathsToCheck)

  driver.write(stack, vhost)

  if (useHosts) {
    addEntries(name, [domain])
  }

  saveRegistry(upsertVHost(registry, vhost))

  logger.success(`Created vhost "${name}" → ${domain} (${stack.label})`)
  logger.dim(`Config: ${configFile}`)
  logger.info('Run `vhostctl reload` to apply the change.')
}
