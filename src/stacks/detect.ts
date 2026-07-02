import type { StackHandle, StackKind } from '../core/types.js'
import { detectApacheStacks } from './apache/detector.js'
import * as apacheDriver from './apache/driver.js'
import { detectNginxStacks } from './nginx/detector.js'
import * as nginxDriver from './nginx/driver.js'

export function detectAllStacks(): StackHandle[] {
  return [...detectApacheStacks(), ...detectNginxStacks()]
}

/** Returns the driver capable of writing/removing/enabling a vhost for the given stack kind. */
export function getDriver(kind: StackKind) {
  return kind === 'nginx' ? nginxDriver : apacheDriver
}
