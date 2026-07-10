import type { StackHandle } from '../core/types.js'
import { restoreFromBackup } from '../utils/fs-safe.js'
import { runCommand, type ExecResult } from '../utils/exec.js'

/** Runs the stack's config-test command, if it has one. Stacks without one are treated as always-valid. */
export function validateStack(stack: StackHandle): ExecResult {
  if (!stack.configTestCommand || stack.configTestCommand.length === 0) {
    return { ok: true, output: 'skipped: no config-test command for this stack' }
  }
  return runCommand(stack.configTestCommand)
}

export interface FileChange {
  path: string
  backupPath: string | null
}

/** Restores every changed file from its captured backup (or deletes it, if the backup is `null`). */
export function rollbackChanges(changes: FileChange[]): void {
  for (const change of changes) {
    restoreFromBackup(change.path, change.backupPath)
  }
}

/**
 * Validates the stack's config after a mutation; on failure, rolls back every `changes` entry
 * to its pre-mutation state and returns the failing result unchanged.
 */
export function validateOrRollback(stack: StackHandle, changes: FileChange[], skipValidate = false): ExecResult {
  if (skipValidate) return { ok: true, output: 'skipped: --skip-validate' }

  const result = validateStack(stack)
  if (!result.ok) {
    rollbackChanges(changes)
  }
  return result
}
