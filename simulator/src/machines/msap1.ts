import { EXAMPLES } from '../core/examples'
import { MSAP1 as MSAP1_ISA, findByOpcode } from '../core/isa'
import { Machine } from '../core/machine'
import { UCODE_TEMPLATE } from '../core/microcode'
import { CONNECTIONS, MODULES } from '../core/modules'
import { SIGNALS } from '../core/signals'
import { MachineDefinition, MachineExample } from './types'

const EXPECTATIONS: Record<string, number> = {
  Division: 7,
  Multiplication: 126,
  SquareRoot: 9,
  Factorial: 120,
  NthRoot: 5,
  GCD: 12,
  PowersOfTwo: 128,
}

const examples: MachineExample[] = EXAMPLES.map((example) => ({
  ...example,
  expect: EXPECTATIONS[example.name] !== undefined ? { out: EXPECTATIONS[example.name] } : undefined,
}))

export const msap1: MachineDefinition = {
  id: 'msap1',
  name: 'MSAP-1',
  subtitle: 'rev.B digital twin',
  isa: MSAP1_ISA,
  signals: SIGNALS,
  registers: [
    { name: 'PC', bits: 8, get: (s) => s.pc },
    { name: 'A', bits: 8, get: (s) => s.a },
    { name: 'B', bits: 8, get: (s) => s.b },
    { name: 'ALU', bits: 8, get: (s) => s.aluOut },
    { name: 'MAR', bits: 8, get: (s) => s.mar },
    {
      name: 'IR',
      bits: 12,
      get: (s) => (s.irOpcode << 8) | s.irOperand,
      format: (s) => `${s.irOpcode.toString(2).padStart(4, '0')} | 0x${s.irOperand.toString(16).toUpperCase().padStart(2, '0')}`,
    },
    { name: 'OUT', bits: 8, get: (s) => s.out },
    { name: 'BUS', bits: 8, get: (s) => s.bus },
  ],
  flags: [
    { name: 'CF', get: (s) => s.carry },
    { name: 'ZF', get: (s) => s.zero },
  ],
  modules: MODULES,
  connections: CONNECTIONS,
  examples,
  microcode: {
    steps: 8,
    opcodeLabel: (opcode) => {
      if (opcode === 0) return 'FETCH'
      return findByOpcode(MSAP1_ISA, opcode)?.mnemonic ?? opcode.toString(2).padStart(4, '0')
    },
    stockTemplate: () => UCODE_TEMPLATE.map((row) => [...row]),
  },
  createCore: () => new Machine(),
}
