export type OperandSlot = 'address' | 'immediate'

export interface InstructionDef {
  mnemonic: string
  opcode: number
  operands: OperandSlot[]
  description: string
}

export interface Isa {
  name: string
  addressBits: number
  minOperandBytes: number
  instructions: InstructionDef[]
}

export const MSAP1: Isa = {
  name: 'msap1',
  addressBits: 8,
  minOperandBytes: 1,
  instructions: [
    { mnemonic: 'LDA', opcode: 0b0001_0000, operands: ['address'], description: 'Load A from address' },
    { mnemonic: 'ADD', opcode: 0b0010_0000, operands: ['address'], description: 'A = A + [addr], sets flags' },
    { mnemonic: 'SUB', opcode: 0b0011_0000, operands: ['address'], description: 'A = A - [addr], sets flags' },
    { mnemonic: 'STA', opcode: 0b0100_0000, operands: ['address'], description: 'Store A to address' },
    { mnemonic: 'LDI', opcode: 0b0101_0000, operands: ['immediate'], description: 'Load immediate into A' },
    { mnemonic: 'LDS', opcode: 0b0110_0000, operands: ['immediate', 'address'], description: 'Store immediate to address via A' },
    { mnemonic: 'JMP', opcode: 0b0111_0000, operands: ['address'], description: 'Jump' },
    { mnemonic: 'JC', opcode: 0b1000_0000, operands: ['address'], description: 'Jump if carry' },
    { mnemonic: 'JZ', opcode: 0b1001_0000, operands: ['address'], description: 'Jump if zero' },
    { mnemonic: 'ADS', opcode: 0b1010_0000, operands: ['address'], description: 'A = [addr] = A + [addr], sets flags' },
    { mnemonic: 'SUS', opcode: 0b1011_0000, operands: ['address'], description: 'A = [addr] = A - [addr], sets flags' },
    { mnemonic: 'OTH', opcode: 0b1110_0000, operands: ['address'], description: 'Output [addr] and halt' },
    { mnemonic: 'OUT', opcode: 0b1111_0000, operands: [], description: 'Output A' },
  ],
}

export function findInstruction(isa: Isa, mnemonic: string): InstructionDef | undefined {
  const upper = mnemonic.toUpperCase()
  return isa.instructions.find((d) => d.mnemonic === upper)
}

export function findByOpcode(isa: Isa, opcodeNibble: number): InstructionDef | undefined {
  return isa.instructions.find((d) => d.opcode >> 4 === opcodeNibble)
}

export function instructionSize(isa: Isa, def: InstructionDef): number {
  return 1 + Math.max(def.operands.length, isa.minOperandBytes)
}
