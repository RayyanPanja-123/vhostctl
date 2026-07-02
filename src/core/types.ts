export type StackKind = 'xampp-apache' | 'wamp-apache' | 'apache' | 'nginx'

export type WriteMode = 'single-file' | 'per-site-file'

export type EnableMechanism = 'none' | 'symlink' | 'comment-toggle'

export interface StackHandle {
  kind: StackKind
  label: string
  writeMode: WriteMode
  /** Present when writeMode === 'single-file': the shared vhosts config file to append/remove blocks in. */
  vhostsFilePath?: string
  /** Present when writeMode === 'per-site-file': directory holding one config file per site. */
  sitesAvailableDir?: string
  /** Present only when enableMechanism === 'symlink'. */
  sitesEnabledDir?: string
  enableMechanism: EnableMechanism
  reloadCommand: string[]
  defaultDocroot: string
  /** Root install dir, used only for display in `detect`/`view`. */
  installRoot: string
}

export interface VHost {
  name: string
  domain: string
  docRoot: string
  stack: StackKind
  port: number
  enabled: boolean
  subdomains: string[]
  /** Path to the config file (single-file: shared vhosts file; per-site: this vhost's own file). */
  configFile: string
  createdAt: string
}

export interface Registry {
  vhosts: VHost[]
  detectedStacks: StackHandle[]
  detectedAt: string | null
}
