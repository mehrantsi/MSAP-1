export const SIG = {
  HLT: 1 << 15,
  MI: 1 << 14,
  RI: 1 << 13,
  RO: 1 << 12,
  IO: 1 << 11,
  II: 1 << 10,
  AI: 1 << 9,
  AO: 1 << 8,
  EOFI: 1 << 7,
  SU: 1 << 6,
  BI: 1 << 5,
  OI: 1 << 4,
  CE: 1 << 3,
  CO: 1 << 2,
  J: 1 << 1,
  RST: 1 << 0,
} as const

export type SignalName = keyof typeof SIG

export interface SignalInfo {
  name: SignalName
  bit: number
  activeLow: boolean
  description: string
}

export const SIGNALS: SignalInfo[] = [
  { name: 'HLT', bit: SIG.HLT, activeLow: true, description: 'Halt the clock' },
  { name: 'MI', bit: SIG.MI, activeLow: true, description: 'Memory address register in' },
  { name: 'RI', bit: SIG.RI, activeLow: true, description: 'RAM data in' },
  { name: 'RO', bit: SIG.RO, activeLow: true, description: 'RAM data out' },
  { name: 'IO', bit: SIG.IO, activeLow: true, description: 'Instruction register operand out' },
  { name: 'II', bit: SIG.II, activeLow: true, description: 'Instruction register in (opcode/operand toggle)' },
  { name: 'AI', bit: SIG.AI, activeLow: true, description: 'A register in' },
  { name: 'AO', bit: SIG.AO, activeLow: true, description: 'A register out' },
  { name: 'EOFI', bit: SIG.EOFI, activeLow: false, description: 'ALU out + flags in' },
  { name: 'SU', bit: SIG.SU, activeLow: false, description: 'ALU subtract' },
  { name: 'BI', bit: SIG.BI, activeLow: false, description: 'B register in' },
  { name: 'OI', bit: SIG.OI, activeLow: false, description: 'Output register in' },
  { name: 'CE', bit: SIG.CE, activeLow: false, description: 'Program counter enable' },
  { name: 'CO', bit: SIG.CO, activeLow: false, description: 'Program counter out' },
  { name: 'J', bit: SIG.J, activeLow: true, description: 'Jump (program counter in)' },
  { name: 'RST', bit: SIG.RST, activeLow: true, description: 'Reset microstep counter, toggle fetch latch' },
]

export const BUS_DRIVERS = [SIG.CO, SIG.RO, SIG.IO, SIG.AO, SIG.EOFI]
