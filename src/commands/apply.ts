import path from 'node:path'
import type { Command } from 'commander'
import { ensureWritable } from '../core/elevate.js'
import { addEntries, removeDomains } from '../core/hosts-file.js'
import type { Manifest, ManifestVHost } from '../core/manifest.js'
import { loadManifestFile } from '../core/manifest.js'
import { findVHost, loadRegistry, saveRegistry, upsertVHost } from '../core/registry.js'
import type { Registry, StackHandle, VHost } from '../core/types.js'
import { reloadStack } from './reload.js'
import { detectAllStacks, getDriver } from '../stacks/detect.js'
import type { FileChange } from '../stacks/validate.js'
import { validateOrRollback } from '../stacks/validate.js'
import { getHostsFilePath } from '../utils/paths.js'
import { logger } from '../utils/logger.js'

interface ApplyCliOptions {
  dryRun?: boolean
  skipValidate?: boolean
  hosts?: boolean
  prune?: boolean
  reload?: boolean
}

export function registerApplyCommand(program: Command): void {
  program
    .command('apply <file>')
    .description('Create or update vhosts and subdomains from a JSON manifest')
    .option('--dry-run', 'preview changes without writing anything')
    .option('--skip-validate', 'skip the config-test check after writing')
    .option('--hosts', 'also add entries to the OS hosts file (off by default — servers usually resolve via real DNS)')
    .option('--prune', 'unlink any registered subdomain not listed in the manifest for a vhost')
    .option('--no-reload', 'do not automatically reload affected stacks after applying')
    .addHelpText(
      'after',
      `
Reads a JSON manifest describing one or more vhosts and their subdomains, and creates or
updates each one to match — safe to commit alongside a project and re-run on every deploy.

Example manifest:
  {
    "defaults": { "stack": "nginx", "port": 80 },
    "vhosts": [
      { "name": "myapp", "domain": "myapp.com", "root": "/var/www/myapp", "subdomains": ["api", "admin"] }
    ]
  }

Examples:
  $ vhostctl apply ./deploy/vhosts.json
  $ vhostctl apply ./deploy/vhosts.json --dry-run
  $ vhostctl apply ./deploy/vhosts.json --prune
`,
    )
    .action(async (file: string, options: ApplyCliOptions) => {
      await applyManifest(file, options)
    })
}

function resolveStack(registry: Registry, kind: string | undefined, context: string): StackHandle {
  const stacks = registry.detectedStacks.length > 0 ? registry.detectedStacks : detectAllStacks()
  if (stacks.length === 0) {
    throw new Error('No web server stack detected. Run `vhostctl detect` first.')
  }
  if (!kind) {
    if (stacks.length === 1) return stacks[0] as StackHandle
    throw new Error(
      `${context}: "stack" must be set — multiple stacks are detected on this machine ` +
        `(${stacks.map((s) => s.kind).join(', ')}). Set it per-vhost or in "defaults".`,
    )
  }
  const match = stacks.find((s) => s.kind === kind)
  if (!match) {
    throw new Error(`${context}: stack "${kind}" was not detected on this machine. Run \`vhostctl detect\`.`)
  }
  return match
}

function normalizeSubdomain(domain: string, sub: string): string {
  return sub.includes('.') ? sub : `${sub}.${domain}`
}

interface PlannedVHost {
  entry: ManifestVHost
  existing: VHost | undefined
  stack: StackHandle
  vhost: VHost
  addedSubdomains: string[]
  prunedSubdomains: string[]
}

function planVHost(entry: ManifestVHost, registry: Registry, defaults: Manifest['defaults'], options: ApplyCliOptions): PlannedVHost {
  const context = `vhost "${entry.name}"`
  const stack = resolveStack(registry, entry.stack ?? defaults.stack, context)
  const existing = findVHost(registry, entry.name)

  const requested = new Set((entry.subdomains ?? []).map((s) => normalizeSubdomain(entry.domain, s)))
  const current = existing?.subdomains ?? []
  const addedSubdomains = [...requested].filter((d) => !current.includes(d))
  const prunedSubdomains = options.prune ? current.filter((d) => !requested.has(d)) : []
  const finalSubdomains = options.prune ? [...requested] : [...new Set([...current, ...requested])]

  const vhost: VHost = {
    name: entry.name,
    domain: entry.domain,
    docRoot: path.resolve(entry.root),
    stack: stack.kind,
    port: entry.port ?? defaults.port ?? existing?.port ?? 80,
    enabled: existing?.enabled ?? true,
    subdomains: finalSubdomains,
    configFile: '',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  }
  vhost.configFile = getDriver(stack.kind).configFilePath(stack, vhost.name)

  return { entry, existing, stack, vhost, addedSubdomains, prunedSubdomains }
}

function printPlan(planned: PlannedVHost[], file: string): void {
  logger.heading(`Dry run — ${planned.length} vhost(s) from ${file}`)
  for (const p of planned) {
    const action = p.existing ? 'update' : 'create'
    logger.plain(`\n[${action}] ${p.vhost.name} → ${p.vhost.domain} (${p.stack.label})`)
    logger.dim(`  root: ${p.vhost.docRoot}, port: ${p.vhost.port}`)
    if (p.addedSubdomains.length > 0) logger.dim(`  + ${p.addedSubdomains.join(', ')}`)
    if (p.prunedSubdomains.length > 0) logger.dim(`  - ${p.prunedSubdomains.join(', ')}`)
  }
}

async function applyManifest(file: string, options: ApplyCliOptions): Promise<void> {
  const manifest = loadManifestFile(path.resolve(file))
  let registry = loadRegistry()

  const planned = manifest.vhosts.map((entry) => planVHost(entry, registry, manifest.defaults, options))

  if (options.dryRun) {
    printPlan(planned, file)
    return
  }

  const configFiles = [...new Set(planned.map((p) => p.vhost.configFile))]
  const pathsToCheck = options.hosts ? [...configFiles, getHostsFilePath()] : configFiles
  const relaunchArgs = ['apply', file]
  if (options.skipValidate) relaunchArgs.push('--skip-validate')
  if (options.hosts) relaunchArgs.push('--hosts')
  if (options.prune) relaunchArgs.push('--prune')
  if (options.reload === false) relaunchArgs.push('--no-reload')
  ensureWritable(pathsToCheck, relaunchArgs)

  let created = 0
  let updated = 0
  let failed = 0
  const touchedStacks = new Map<string, StackHandle>()

  for (const p of planned) {
    const changes: FileChange[] = []
    try {
      const driver = getDriver(p.stack.kind)
      const written = driver.write(p.stack, p.vhost)
      changes.push({ path: written.configFile, backupPath: written.backupPath })

      if (options.hosts) {
        const toAdd = [p.vhost.domain, ...p.addedSubdomains]
        const hostsResult = addEntries(p.vhost.name, toAdd)
        if (hostsResult.added.length > 0) {
          changes.push({ path: getHostsFilePath(), backupPath: hostsResult.backupPath })
        }
        if (p.prunedSubdomains.length > 0) {
          const removed = removeDomains(p.vhost.name, p.prunedSubdomains)
          if (removed.backupPath !== null) {
            changes.push({ path: getHostsFilePath(), backupPath: removed.backupPath })
          }
        }
      }

      const validation = validateOrRollback(p.stack, changes, options.skipValidate)
      if (!validation.ok) {
        logger.error(`"${p.vhost.name}": configuration is invalid — changes rolled back.\n${validation.output}`)
        failed++
        continue
      }

      registry = upsertVHost(registry, p.vhost)
      saveRegistry(registry)
      touchedStacks.set(p.stack.kind, p.stack)

      if (p.existing) {
        updated++
        const subChange = [
          p.addedSubdomains.length > 0 ? `+${p.addedSubdomains.length}` : null,
          p.prunedSubdomains.length > 0 ? `-${p.prunedSubdomains.length}` : null,
        ]
          .filter(Boolean)
          .join(' ')
        logger.success(`Updated "${p.vhost.name}" → ${p.vhost.domain}${subChange ? ` (${subChange} subdomain(s))` : ''}`)
      } else {
        created++
        logger.success(`Created "${p.vhost.name}" → ${p.vhost.domain} (${p.stack.label})`)
      }
    } catch (error) {
      logger.error(`"${p.vhost.name}": ${error instanceof Error ? error.message : String(error)}`)
      failed++
    }
  }

  if (options.reload !== false) {
    for (const stack of touchedStacks.values()) {
      const result = reloadStack(stack, { skipValidate: true })
      if (result.ok) {
        logger.success(`${stack.label} reloaded.`)
      } else {
        logger.error(`Failed to reload ${stack.label}: ${result.output || 'unknown error'}`)
      }
    }
  } else if (touchedStacks.size > 0) {
    logger.info('Run `vhostctl reload` to apply the change.')
  }

  logger.plain('')
  logger.heading(
    `Applied ${manifest.vhosts.length} vhost(s): ${created} created, ${updated} updated${failed > 0 ? `, ${failed} failed` : ''}.`,
  )
  if (failed > 0) {
    process.exitCode = 1
  }
}
