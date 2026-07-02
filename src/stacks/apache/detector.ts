import fs from 'node:fs'
import path from 'node:path'
import type { StackHandle } from '../../core/types.js'

function exists(candidate: string): boolean {
  try {
    return fs.existsSync(candidate)
  } catch {
    return false
  }
}

function latestSubdir(dir: string, prefix: string): string | null {
  if (!exists(dir)) return null
  const matches = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith(prefix))
    .map((entry) => entry.name)
    .sort()
    .reverse()
  return matches[0] ?? null
}

function detectXampp(): StackHandle | null {
  const root =
    process.platform === 'win32'
      ? 'C:\\xampp'
      : process.platform === 'darwin'
        ? '/Applications/XAMPP/xamppfiles'
        : '/opt/lampp'

  const vhostsFilePath = path.join(root, 'apache', 'conf', 'extra', 'httpd-vhosts.conf')
  if (!exists(vhostsFilePath)) return null

  const httpdBin =
    process.platform === 'win32' ? path.join(root, 'apache', 'bin', 'httpd.exe') : path.join(root, 'lampp')

  return {
    kind: 'xampp-apache',
    label: 'XAMPP (Apache)',
    writeMode: 'single-file',
    vhostsFilePath,
    enableMechanism: 'comment-toggle',
    reloadCommand: process.platform === 'win32' ? [httpdBin, '-k', 'restart'] : [httpdBin, 'reloadapache'],
    defaultDocroot: path.join(root, 'htdocs'),
    installRoot: root,
  }
}

function detectWamp(): StackHandle | null {
  if (process.platform !== 'win32') return null

  const roots = ['C:\\wamp64', 'C:\\wamp']
  for (const root of roots) {
    const apacheParent = path.join(root, 'bin', 'apache')
    const apacheDir = latestSubdir(apacheParent, 'apache')
    if (!apacheDir) continue

    const aliasDir = path.join(root, 'alias')
    if (!exists(aliasDir)) continue

    return {
      kind: 'wamp-apache',
      label: 'WAMP (Apache)',
      writeMode: 'per-site-file',
      sitesAvailableDir: aliasDir,
      enableMechanism: 'comment-toggle',
      reloadCommand: [path.join(apacheParent, apacheDir, 'bin', 'httpd.exe'), '-k', 'restart'],
      defaultDocroot: path.join(root, 'www'),
      installRoot: root,
    }
  }
  return null
}

function detectStandaloneApache(): StackHandle | null {
  if (process.platform === 'win32') {
    const root = 'C:\\Apache24'
    const vhostsFilePath = path.join(root, 'conf', 'extra', 'httpd-vhosts.conf')
    if (!exists(vhostsFilePath)) return null
    return {
      kind: 'apache',
      label: 'Apache (standalone)',
      writeMode: 'single-file',
      vhostsFilePath,
      enableMechanism: 'comment-toggle',
      reloadCommand: [path.join(root, 'bin', 'httpd.exe'), '-k', 'restart'],
      defaultDocroot: path.join(root, 'htdocs'),
      installRoot: root,
    }
  }

  if (process.platform === 'darwin') {
    for (const root of ['/opt/homebrew/etc/httpd', '/usr/local/etc/httpd']) {
      const vhostsFilePath = path.join(root, 'extra', 'httpd-vhosts.conf')
      if (exists(vhostsFilePath)) {
        return {
          kind: 'apache',
          label: 'Apache (Homebrew)',
          writeMode: 'single-file',
          vhostsFilePath,
          enableMechanism: 'comment-toggle',
          reloadCommand: ['apachectl', 'graceful'],
          defaultDocroot: path.join(root, 'htdocs'),
          installRoot: root,
        }
      }
    }
    return null
  }

  // Linux: Debian/Ubuntu style (sites-available + sites-enabled)
  if (exists('/etc/apache2/sites-available')) {
    return {
      kind: 'apache',
      label: 'Apache2 (Debian/Ubuntu)',
      writeMode: 'per-site-file',
      sitesAvailableDir: '/etc/apache2/sites-available',
      sitesEnabledDir: '/etc/apache2/sites-enabled',
      enableMechanism: 'symlink',
      reloadCommand: ['apache2ctl', 'graceful'],
      defaultDocroot: '/var/www/html',
      installRoot: '/etc/apache2',
    }
  }

  // Linux: RHEL/CentOS style (flat conf.d)
  if (exists('/etc/httpd/conf.d')) {
    return {
      kind: 'apache',
      label: 'httpd (RHEL/CentOS)',
      writeMode: 'per-site-file',
      sitesAvailableDir: '/etc/httpd/conf.d',
      enableMechanism: 'comment-toggle',
      reloadCommand: ['apachectl', 'graceful'],
      defaultDocroot: '/var/www/html',
      installRoot: '/etc/httpd',
    }
  }

  return null
}

export function detectApacheStacks(): StackHandle[] {
  return [detectXampp(), detectWamp(), detectStandaloneApache()].filter(
    (handle): handle is StackHandle => handle !== null,
  )
}
