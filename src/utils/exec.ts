import { spawnSync } from 'node:child_process'
import path from 'node:path'

export interface ExecResult {
  ok: boolean
  output: string
}

export function runCommand(command: string[]): ExecResult {
  const [cmd, ...args] = command
  if (!cmd) {
    return { ok: false, output: 'No command configured for this stack' }
  }
  const result = spawnSync(cmd, args, { encoding: 'utf8' })
  if (result.error) {
    return { ok: false, output: result.error.message }
  }
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  return { ok: result.status === 0, output }
}

/**
 * `httpd -k restart` only works when Apache is registered as a Windows service (named "Apache2.4"
 * by default). XAMPP/WAMP normally run Apache as a plain foreground process instead, in which case
 * `-k restart` fails with AH00436 "No installed service named...". This restarts that kind of
 * standalone Apache by killing the running process (matched by exact executable path, so it doesn't
 * touch unrelated httpd.exe instances) and launching a fresh instance in its place, then confirms the
 * new process actually stayed alive — a bad config or a port conflict makes httpd exit right back out,
 * and without this check that would still be reported as a successful restart.
 */
export function restartStandaloneApacheWindows(httpdBin: string): ExecResult {
  const escapedPath = httpdBin.replace(/'/g, "''")
  const escapedCwd = path.dirname(path.dirname(httpdBin)).replace(/'/g, "''")
  const script = `
$matchesPath = { $_.ExecutablePath -eq '${escapedPath}' }
$existing = Get-CimInstance Win32_Process -Filter "Name='httpd.exe'" | Where-Object $matchesPath
if ($existing) { $existing | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Start-Sleep -Milliseconds 500 }

Start-Process -FilePath '${escapedPath}' -WorkingDirectory '${escapedCwd}' -WindowStyle Hidden
Start-Sleep -Milliseconds 750

$running = Get-CimInstance Win32_Process -Filter "Name='httpd.exe'" | Where-Object $matchesPath
if (-not $running) { exit 1 }
`
  const result = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' })
  if (result.error) {
    return { ok: false, output: result.error.message }
  }
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  if (result.status !== 0) {
    return {
      ok: false,
      output: output || 'Apache did not stay running after the restart — check its error log for details.',
    }
  }

  return { ok: true, output: 'Restarted as a standalone process (no Windows service installed).' }
}
