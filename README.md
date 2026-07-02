# vhostctl

[![npm version](https://img.shields.io/npm/v/vhostctl.svg)](https://www.npmjs.com/package/vhostctl)
[![npm downloads](https://img.shields.io/npm/dm/vhostctl.svg)](https://www.npmjs.com/package/vhostctl)
[![license](https://img.shields.io/npm/l/vhostctl.svg)](https://github.com/RayyanPanja-123/vhostctl/blob/main/LICENSE)
[![node](https://img.shields.io/node/v/vhostctl.svg)](https://www.npmjs.com/package/vhostctl)

**vhostctl** is a cross-platform CLI for managing local development virtual hosts and custom domains across **XAMPP**, **WAMP**, and standalone **Apache**/**Nginx** — on **Windows**, **macOS**, and **Linux**. It creates and removes vhost config blocks and hosts-file entries for you, so you never have to hand-edit `httpd-vhosts.conf`, nginx server blocks, or your OS hosts file again.

```
$ vhostctl
 __      ___               _        _  
 \ \    / / |             | |      | |
  \ \  / /| |__   ___  ___| |_ ___ | |_ ___| |
   \ \/ / | '_ \ / _ \/ __| __/ __| __/ __| |
    \  /  | | | | (_) \__ \ |_ (__| |_| (__| |
     \/   |_| |_|\___/|___/\__\___/ \__\___|_|

  Cross-platform virtual host manager · v0.1.0
  XAMPP · WAMP · Apache · Nginx — Windows, macOS, Linux
```

## Install

```bash
npm install
npm run build
npm link      # makes the `vhostctl` command available globally for local testing
```

Requires Node.js 18+.

## Quick start

```bash
vhostctl detect                                    # find installed stacks (XAMPP/WAMP/Apache/Nginx)
vhostctl add myapp --domain myapp.local             # create a vhost (interactive if flags are omitted)
vhostctl list                                       # see everything vhostctl manages
vhostctl view myapp                                 # full detail: docroot, stack, config file, hosts entries
vhostctl subdomain add myapp api                    # links api.myapp.local to the same vhost
vhostctl reload                                     # restart/reload the web server to apply changes
```

Run `vhostctl examples` for more real-world recipes, or `vhostctl <command> --help` for flags on any command.

## Commands

| Command | Description |
|---|---|
| `add <name>` | Create a new virtual host (`--domain`, `--root`, `--stack`, `--port`, `--no-hosts`, `--dry-run`) |
| `list` (`ls`) | List all registered vhosts |
| `view <name>` (`show`, `info`) | Show full details for one vhost |
| `remove <name>` (`rm`) | Delete a vhost's config block, hosts entries, and registry entry |
| `enable <name>` / `disable <name>` | Toggle a vhost without deleting it |
| `subdomain add\|remove\|list <name> [sub]` | Manage subdomains linked to a vhost |
| `detect` (`doctor`) | Scan the machine for XAMPP/WAMP/Apache/Nginx installs |
| `reload` (`restart`) | Reload/restart the detected web server(s) |
| `examples` | Print common recipes |

## How it works

- **Detection**: `vhostctl detect` probes known install locations for XAMPP, WAMP (Windows), and standalone Apache/Nginx (Homebrew on macOS, Debian/Ubuntu and RHEL/CentOS conventions on Linux), and caches what it finds.
- **Config writing**: each vhost's Apache/Nginx block is wrapped in `# vhostctl:<name>:start` / `:end` markers, so vhostctl can find, replace, or remove exactly what it created without disturbing anything you wrote by hand. Stacks that use one file per site (WAMP, Debian/RHEL Apache/Nginx) get their own `<name>.conf`; stacks that share one file (XAMPP, standalone Apache) get a block appended to it.
- **Hosts file**: each managed line gets an inline `# vhostctl:<name>` tag, so `remove`/`subdomain remove` only ever touch lines vhostctl itself added.
- **Elevation**: if the hosts file or a config path isn't writable by the current user, vhostctl re-launches itself elevated (UAC prompt on Windows, `sudo` on macOS/Linux) rather than failing outright. Use `--dry-run` on `add` to preview changes first.
- **State**: vhostctl keeps its own registry (`vhosts.json` under your OS's app-config directory) independent of the underlying server config, so `list`/`view` stay accurate even if you edit the generated files by hand afterward.

## Development

```bash
npm run dev -- <command>   # run the CLI from source via tsx, no build step
npm test                   # run the vitest unit test suite
npm run typecheck          # tsc --noEmit
```

Unit tests cover the pure logic (config templates, marker-based block editing, hosts-file editing, the registry, and stack detection) against temp files/mocked fs — they never touch your real Apache/Nginx install or hosts file. Before relying on `add`/`remove`/`subdomain` against a real stack, run them with `--dry-run` first to review the generated block and hosts-file lines.
