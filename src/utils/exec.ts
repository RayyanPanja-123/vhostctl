import { spawnSync } from 'node:child_process'

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
