import type { StackHandle, VHost } from '../../core/types.js'
import * as driverUtils from '../driver-utils.js'
import { renderApacheBlock } from './template.js'

export function write(stack: StackHandle, vhost: VHost): { configFile: string; backupPath: string | null } {
  return driverUtils.writeVHostConfig(stack, vhost, renderApacheBlock)
}

export function remove(stack: StackHandle, vhost: VHost): string | null {
  return driverUtils.removeVHostConfig(stack, vhost)
}

export function setEnabled(stack: StackHandle, vhost: VHost, enabled: boolean): string | null {
  return driverUtils.setVHostEnabled(stack, vhost, enabled, renderApacheBlock)
}

export function exists(stack: StackHandle, name: string): boolean {
  return driverUtils.vhostConfigExists(stack, name)
}

export function configFilePath(stack: StackHandle, name: string): string {
  return driverUtils.getConfigFilePath(stack, name)
}

export { renderApacheBlock as render }
