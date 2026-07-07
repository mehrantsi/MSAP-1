import { findByOpcode, Isa, MSAP1 } from './isa'

export interface DisasmLine {
  address: number
  bytes: number[]
  text: string
}

export function disassemble(ram: Uint8Array, start: number, count: number, isa: Isa = MSAP1): DisasmLine[] {
  const lines: DisasmLine[] = []
  let addr = start
  while (lines.length < count && addr < ram.length) {
    const byte = ram[addr]
    const def = findByOpcode(isa, (byte >> 4) & 0xf)
    if (def && (byte & 0x0f) === 0) {
      const size = 1 + Math.max(def.operands.length, isa.minOperandBytes)
      const bytes: number[] = []
      for (let i = 0; i < size && addr + i < ram.length; i++) bytes.push(ram[addr + i])
      const args = def.operands.map((slot, i) => {
        const v = bytes[i + 1] ?? 0
        return slot === 'immediate' ? `#${v > 127 ? v - 256 : v}` : `$${v.toString(16).toUpperCase().padStart(2, '0')}`
      })
      lines.push({ address: addr, bytes, text: `${def.mnemonic}${args.length ? ' ' + args.join(', ') : ''}` })
      addr += size
    } else {
      lines.push({ address: addr, bytes: [byte], text: `.byte ${byte}` })
      addr += 1
    }
  }
  return lines
}

export function describeOpcode(opcodeNibble: number, isa: Isa = MSAP1): string {
  const def = findByOpcode(isa, opcodeNibble)
  return def ? def.mnemonic : `?${opcodeNibble.toString(2).padStart(4, '0')}`
}
