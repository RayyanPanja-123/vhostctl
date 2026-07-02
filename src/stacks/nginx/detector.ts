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

export function detectNginxStacks(): StackHandle[] {
  if (process.platform === 'win32') {
    const root = 'C:\\nginx'
    if (!exists(path.join(root, 'conf', 'nginx.conf'))) return []
    return [
      {
        kind: 'nginx',
        label: 'nginx (Windows)',
        writeMode: 'per-site-file',
        sitesAvailableDir: path.join(root, 'conf', 'sites-available'),
        sitesEnabledDir: path.join(root, 'conf', 'sites-enabled'),
        enableMechanism: 'symlink',
        reloadCommand: [path.join(root, 'nginx.exe'), '-s', 'reload'],
        defaultDocroot: path.join(root, 'html'),
        installRoot: root,
      },
    ]
  }

  if (process.platform === 'darwin') {
    for (const root of ['/opt/homebrew/etc/nginx', '/usr/local/etc/nginx']) {
      if (!exists(path.join(root, 'nginx.conf'))) continue
      return [
        {
          kind: 'nginx',
          label: 'nginx (Homebrew)',
          writeMode: 'per-site-file',
          sitesAvailableDir: path.join(root, 'servers'),
          enableMechanism: 'comment-toggle',
          reloadCommand: ['nginx', '-s', 'reload'],
          defaultDocroot: path.join(root, 'html'),
          installRoot: root,
        },
      ]
    }
    return []
  }

  // Linux: Debian/Ubuntu style (sites-available + sites-enabled)
  if (exists('/etc/nginx/sites-available')) {
    return [
      {
        kind: 'nginx',
        label: 'nginx (Debian/Ubuntu)',
        writeMode: 'per-site-file',
        sitesAvailableDir: '/etc/nginx/sites-available',
        sitesEnabledDir: '/etc/nginx/sites-enabled',
        enableMechanism: 'symlink',
        reloadCommand: ['nginx', '-s', 'reload'],
        defaultDocroot: '/var/www/html',
        installRoot: '/etc/nginx',
      },
    ]
  }

  // Linux: RHEL/CentOS style (flat conf.d)
  if (exists('/etc/nginx/conf.d')) {
    return [
      {
        kind: 'nginx',
        label: 'nginx (RHEL/CentOS)',
        writeMode: 'per-site-file',
        sitesAvailableDir: '/etc/nginx/conf.d',
        enableMechanism: 'comment-toggle',
        reloadCommand: ['nginx', '-s', 'reload'],
        defaultDocroot: '/usr/share/nginx/html',
        installRoot: '/etc/nginx',
      },
    ]
  }

  return []
}
