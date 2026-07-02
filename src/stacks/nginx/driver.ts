import type { StackHandle, VHost } from '../../core/types.js'
import * as driverUtils from '../driver-utils.js'
import { renderNginxBlock } from './template.js'

export function write(stack: StackHandle, vhost: VHost): string {
  return driverUtils.writeVHostConfig(stack, vhost, renderNginxBlock)
}

export function remove(stack: StackHandle, vhost: VHost): void {
  driverUtils.removeVHostConfig(stack, vhost)
}

export function setEnabled(stack: StackHandle, vhost: VHost, enabled: boolean): void {
  driverUtils.setVHostEnabled(stack, vhost, enabled, renderNginxBlock)
}

export function exists(stack: StackHandle, name: string): boolean {
  return driverUtils.vhostConfigExists(stack, name)
}

export function configFilePath(stack: StackHandle, name: string): string {
  return driverUtils.getConfigFilePath(stack, name)
}

export { renderNginxBlock as render }
