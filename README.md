# vhostctl

[![npm version](https://img.shields.io/npm/v/%40superdevs%2Fvhostctl.svg)](https://www.npmjs.com/package/@superdevs/vhostctl)
[![npm downloads](https://img.shields.io/npm/dm/%40superdevs%2Fvhostctl.svg)](https://www.npmjs.com/package/@superdevs/vhostctl)
[![license](https://img.shields.io/npm/l/%40superdevs%2Fvhostctl.svg)](https://github.com/RayyanPanja-123/vhostctl/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/%40superdevs%2Fvhostctl.svg)](https://www.npmjs.com/package/@superdevs/vhostctl)

Stop hand-editing `httpd-vhosts.conf`, nginx server blocks, and your hosts file every time you spin up a new local site. **vhostctl** sets up a virtual host — config block, hosts entry, everything — with one command, and cleans it all back up with one more.

Works with **XAMPP**, **WAMP**, standalone **Apache**, and **Nginx**, on **Windows**, **macOS**, and **Linux**.

```
$ vhostctl
 __      ___               _        _  
 \ \    / / |             | |      | |
  \ \  / /| |__   ___  ___| |_ ___ | |_ ___| |
   \ \/ / | '_ \ / _ \/ __| __/ __| __/ __| |
    \  /  | | | | (_) \__ \ |_ (__| |_| (__| |
     \/   |_| |_|\___/|___/\__\___/ \__\___|_|

  Cross-platform virtual host manager
  XAMPP · WAMP · Apache · Nginx — Windows, macOS, Linux
```

## Requirements

- [Node.js](https://nodejs.org) 18 or newer
- One of XAMPP, WAMP, Apache, or Nginx already installed on your machine

## Install

Install it once, globally, and the `vhostctl` command is available everywhere on your machine:

```bash
npm install -g @superdevs/vhostctl
```

Check it worked:

```bash
vhostctl --version
```

## Getting started

**1. Find your web server.** vhostctl scans your machine for XAMPP, WAMP, Apache, and Nginx installs:

```bash
vhostctl detect
```

**2. Create a virtual host.** This sets up the config block and adds an entry to your hosts file so the domain resolves locally:

```bash
vhostctl add myapp --domain myapp.local --root "C:/path/to/myapp"
```

Leave off the flags and vhostctl will ask you for them interactively.

**3. Reload your web server** so the change takes effect:

```bash
vhostctl reload
```

**4. Visit your site** — `myapp.local` now points at your project.

## Everyday commands

| Command | What it does |
|---|---|
| `vhostctl add <name>` | Create a new virtual host |
| `vhostctl list` | List every site vhostctl manages |
| `vhostctl view <name>` | Show full details for one site (domain, folder, config file, hosts entries) |
| `vhostctl remove <name>` | Delete a site completely — config, hosts entry, and all |
| `vhostctl enable <name>` / `vhostctl disable <name>` | Turn a site on/off without deleting it |
| `vhostctl subdomain add <name> <sub>` | Point one or more comma-separated subdomains (e.g. `api,admin`) at an existing site, then reload automatically |
| `vhostctl subdomain remove <name> <sub>` | Unlink one or more subdomains, then reload automatically |
| `vhostctl subdomain list [name]` | List subdomains for one site, or every site if no name is given |
| `vhostctl apply <file>` | Create or update vhosts and subdomains from a JSON manifest — see [Deploy manifests](#deploy-manifests) |
| `vhostctl detect` | Scan your machine for installed web server stacks |
| `vhostctl reload` | Reload/restart your web server to apply changes |
| `vhostctl examples` | Print more real-world usage recipes |

Add `--help` after any command to see all of its options, e.g. `vhostctl add --help`.

### Useful options for `add`

| Option | Description |
|---|---|
| `-d, --domain <domain>` | Domain to use (defaults to `<name>.local`) |
| `-r, --root <path>` | Folder to serve as the document root |
| `-s, --stack <stack>` | Force a specific stack: `xampp-apache`, `wamp-apache`, `apache`, or `nginx` |
| `-p, --port <port>` | Port to listen on (default `80`) |
| `--no-hosts` | Skip editing your hosts file |
| `--dry-run` | Preview exactly what would change, without writing anything |

## Deploy manifests

For a project with several domains/subdomains, hand-running `add`/`subdomain add` on every server doesn't scale. Instead, commit a manifest describing the desired vhosts alongside the project, push it to the server, and run `vhostctl apply` — it creates whatever's missing and updates whatever's changed, non-interactively:

```bash
vhostctl apply ./deploy/vhosts.json
```

```json
{
  "defaults": { "stack": "nginx", "port": 80 },
  "vhosts": [
    {
      "name": "myapp",
      "domain": "myapp.com",
      "root": "/var/www/myapp",
      "subdomains": ["api", "admin", "app.myapp.com"]
    },
    {
      "name": "blog",
      "domain": "blog.myapp.com",
      "root": "/var/www/blog"
    }
  ]
}
```

- `name`, `domain`, and `root` are required per vhost. `stack` and `port` fall back to `defaults`, then (for a vhost that already exists) to its current value, then to port `80`.
- Bare subdomain labels (`"api"`) are expanded against that vhost's `domain`, same as `subdomain add`.
- `stack` must already be detected on the machine — run `vhostctl detect` first. `apply` never prompts; if a stack can't be resolved unambiguously, it errors out instead.

| Option | Description |
|---|---|
| `--dry-run` | Print what would be created/updated, without writing anything |
| `--hosts` | Also add entries to the OS hosts file (off by default — a real server resolves domains via DNS, not `/etc/hosts`) |
| `--prune` | Unlink any registered subdomain no longer listed in the manifest (default is additive-only — nothing is ever removed unless you pass this) |
| `--skip-validate` | Skip the config-test check after writing |
| `--no-reload` | Don't automatically reload affected stacks afterward |

`apply` is idempotent — re-running it with an unchanged manifest is a no-op, so it's safe to call from a deploy script on every release. A failure on one vhost (e.g. a bad config) rolls back just that vhost and continues with the rest; the process exits non-zero if anything failed, so CI can detect it.

## Good to know

- **It only touches what it creates.** Every config block and hosts-file line vhostctl adds is tagged, so `remove` and `subdomain remove` never disturb anything you wrote by hand.
- **It may ask for admin/sudo access.** Editing the hosts file or certain config locations requires elevated permissions — vhostctl will prompt for a UAC confirmation (Windows) or `sudo` (macOS/Linux) automatically when needed.
- **Preview before you commit.** Add `--dry-run` to `vhostctl add` to see exactly what would be written first.
- **Your data stays local.** vhostctl keeps track of the sites it manages in a small local file on your machine — nothing is sent anywhere.

## License

See [LICENSE](./LICENSE).
