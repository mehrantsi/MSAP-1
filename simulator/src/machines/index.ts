import { msap1 } from './msap1'
import { MachineDefinition } from './types'

export const MACHINES: MachineDefinition[] = [msap1]

function loadMachineId(): string {
  try {
    const id = localStorage.getItem('msap1-machine')
    if (id && MACHINES.some((m) => m.id === id)) return id
  } catch {
    /* default */
  }
  return MACHINES[0].id
}

let activeId = loadMachineId()

export function currentMachine(): MachineDefinition {
  return MACHINES.find((m) => m.id === activeId) ?? MACHINES[0]
}

export function switchMachine(id: string): void {
  if (!MACHINES.some((m) => m.id === id)) return
  try {
    localStorage.setItem('msap1-machine', id)
  } catch {
    /* ignore */
  }
  window.location.reload()
}

export function storageKey(base: string): string {
  return activeId === 'msap1' ? base : `${base}:${activeId}`
}
