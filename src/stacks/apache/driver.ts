import type { StackHandle, VHost } from '../../core/types.js'
import * as driverUtils from '../driver-utils.js'
import { renderApacheBlock } from './template.js'

export function write(stack: StackHandle, vhost: VHost): string {
  return driverUtils.writeVHostConfig(stack, vhost, renderApacheBlock)
}

export function remove(stack: StackHandle, vhost: VHost): void {
  driverUtils.removeVHostConfig(stack, vhost)
}

export function setEnabled(stack: StackHandle, vhost: VHost, enabled: boolean): void {
  driverUtils.setVHostEnabled(stack, vhost, enabled, renderApacheBlock)
}

export function exists(stack: StackHandle, name: string): boolean {
  return driverUtils.vhostConfigExists(stack, name)
}

export function configFilePath(stack: StackHandle, name: string): string {
  return driverUtils.getConfigFilePath(stack, name)
}

export { renderApacheBlock as render }
