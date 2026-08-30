/**
 * op_id / device_id / slug 생성.
 */

let seq = 0

export function newOpId(): string {
  seq += 1
  return `op-${Date.now().toString(36)}-${seq}`
}

export function newDeviceId(): string {
  return `mobile-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function slug(input: string): string {
  const s = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'item'
}