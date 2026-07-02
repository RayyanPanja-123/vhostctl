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
| `vhostctl subdomain add <name> <sub>` | Point a subdomain (e.g. `api.myapp.local`) at an existing site |
| `vhostctl subdomain remove <name> <sub>` | Unlink a subdomain |
| `vhostctl subdomain list <name>` | List subdomains linked to a site |
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

## Good to know

- **It only touches what it creates.** Every config block and hosts-file line vhostctl adds is tagged, so `remove` and `subdomain remove` never disturb anything you wrote by hand.
- **It may ask for admin/sudo access.** Editing the hosts file or certain config locations requires elevated permissions — vhostctl will prompt for a UAC confirmation (Windows) or `sudo` (macOS/Linux) automatically when needed.
- **Preview before you commit.** Add `--dry-run` to `vhostctl add` to see exactly what would be written first.
- **Your data stays local.** vhostctl keeps track of the sites it manages in a small local file on your machine — nothing is sent anywhere.

## License

See [LICENSE](./LICENSE).
