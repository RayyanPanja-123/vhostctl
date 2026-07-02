import { describe, expect, it } from 'vitest'
import type { VHost } from '../src/core/types.js'
import { renderApacheBlock } from '../src/stacks/apache/template.js'
import { renderNginxBlock } from '../src/stacks/nginx/template.js'

function makeVHost(overrides: Partial<VHost> = {}): VHost {
  return {
    name: 'myapp',
    domain: 'myapp.local',
    docRoot: '/sites/myapp',
    stack: 'apache',
    port: 80,
    enabled: true,
    subdomains: [],
    configFile: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('renderApacheBlock', () => {
  it('renders a VirtualHost block with ServerName and DocumentRoot', () => {
    const block = renderApacheBlock(makeVHost())

    expect(block).toContain('<VirtualHost *:80>')
    expect(block).toContain('ServerName myapp.local')
    expect(block).toContain('DocumentRoot "/sites/myapp"')
    expect(block).toContain('</VirtualHost>')
    expect(block).not.toContain('ServerAlias')
  })

  it('adds a ServerAlias line only when subdomains are present', () => {
    const block = renderApacheBlock(makeVHost({ subdomains: ['api.myapp.local', 'admin.myapp.local'] }))
    expect(block).toContain('ServerAlias api.myapp.local admin.myapp.local')
  })
})

describe('renderNginxBlock', () => {
  it('renders a server block listening on the configured port', () => {
    const block = renderNginxBlock(makeVHost({ port: 8080 }))

    expect(block).toContain('listen 8080;')
    expect(block).toContain('server_name myapp.local;')
    expect(block).toContain('root "/sites/myapp";')
  })

  it('includes subdomains in server_name', () => {
    const block = renderNginxBlock(makeVHost({ subdomains: ['api.myapp.local'] }))
    expect(block).toContain('server_name myapp.local api.myapp.local;')
  })
})
