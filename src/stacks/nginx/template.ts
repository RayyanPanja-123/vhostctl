import type { VHost } from '../../core/types.js'

export function renderNginxBlock(vhost: VHost): string {
  const serverNames = [vhost.domain, ...vhost.subdomains].join(' ')

  return [
    `server {`,
    `    listen ${vhost.port};`,
    `    server_name ${serverNames};`,
    `    root "${vhost.docRoot}";`,
    `    index index.php index.html index.htm;`,
    ``,
    `    location / {`,
    `        try_files $uri $uri/ /index.php?$query_string;`,
    `    }`,
    ``,
    `    location ~ \\.php$ {`,
    `        include fastcgi_params;`,
    `        fastcgi_pass 127.0.0.1:9000;`,
    `        fastcgi_index index.php;`,
    `        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;`,
    `    }`,
    ``,
    `    access_log "logs/${vhost.name}-access.log";`,
    `    error_log "logs/${vhost.name}-error.log";`,
    `}`,
  ].join('\n')
}
