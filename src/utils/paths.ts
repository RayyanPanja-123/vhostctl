import os from 'node:os'
import path from 'node:path'

/** Resolve vhostctl's own config directory, per OS. No extra dependency needed. */
export function getConfigDir(): string {
  const platform = process.platform
  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
    return path.join(appData, 'vhostctl')
  }
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'vhostctl')
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config')
  return path.join(xdgConfig, 'vhostctl')
}

export function getRegistryPath(): string {
  return path.join(getConfigDir(), 'vhosts.json')
}

export function getHostsFilePath(): string {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
    return path.join(systemRoot, 'System32', 'drivers', 'etc', 'hosts')
  }
  return '/etc/hosts'
}
