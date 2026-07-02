import type { VHost } from '../../core/types.js'

export function renderApacheBlock(vhost: VHost): string {
  const lines = [`<VirtualHost *:${vhost.port}>`, `    ServerName ${vhost.domain}`]

  if (vhost.subdomains.length > 0) {
    lines.push(`    ServerAlias ${vhost.subdomains.join(' ')}`)
  }

  lines.push(
    `    DocumentRoot "${vhost.docRoot}"`,
    `    <Directory "${vhost.docRoot}">`,
    `        Options Indexes FollowSymLinks`,
    `        AllowOverride All`,
    `        Require all granted`,
    `    </Directory>`,
    `    ErrorLog "logs/${vhost.name}-error.log"`,
    `    CustomLog "logs/${vhost.name}-access.log" common`,
    `</VirtualHost>`,
  )

  return lines.join('\n')
}
