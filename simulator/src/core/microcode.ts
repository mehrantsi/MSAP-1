import { SIG } from './signals'

const { HLT, MI, RI, RO, IO, II, AI, AO, EOFI, SU, BI, OI, CE, CO, J, RST } = SIG

export const FLAGS_Z0C0 = 0
export const FLAGS_Z0C1 = 1
export const FLAGS_Z1C0 = 2
export const FLAGS_Z1C1 = 3

export const OP_JC = 0b1000
export const OP_JZ = 0b1001

export const UCODE_TEMPLATE: number[][] = [
  [MI | CO, RO | II | CE, MI | CO, RO | II | CE, RST, 0, 0, 0],
  [IO | MI, RO | AI, RST, 0, 0, 0, 0, 0],
  [IO | MI, RO | BI, EOFI | AI, RST, 0, 0, 0, 0],
  [IO | MI, RO | BI, EOFI | AI | SU, RST, 0, 0, 0, 0],
  [IO | MI, AO | RI, RST, 0, 0, 0, 0, 0],
  [IO | AI, RST, 0, 0, 0, 0, 0, 0],
  [IO | AI, MI | CO, RO | MI | CE, AO | RI, RST, 0, 0, 0],
  [IO | J, RST, 0, 0, 0, 0, 0, 0],
  [0, RST, 0, 0, 0, 0, 0, 0],
  [0, RST, 0, 0, 0, 0, 0, 0],
  [IO | MI, RO | BI, EOFI | RI, EOFI | AI, RST, 0, 0, 0],
  [IO | MI, RO | BI, EOFI | RI | SU, EOFI | AI | SU, RST, 0, 0, 0],
  [RST, 0, 0, 0, 0, 0, 0, 0],
  [RST, 0, 0, 0, 0, 0, 0, 0],
  [IO | MI, RO | OI, HLT, RST, 0, 0, 0, 0],
  [AO | OI, RST, 0, 0, 0, 0, 0, 0],
]

export function buildControlRom(template: number[][] = UCODE_TEMPLATE): number[][][] {
  const banks: number[][][] = []
  for (let flags = 0; flags < 4; flags++) {
    banks.push(template.map((steps) => [...steps]))
  }
  banks[FLAGS_Z0C1][OP_JC][0] = IO | J
  banks[FLAGS_Z1C0][OP_JZ][0] = IO | J
  banks[FLAGS_Z1C1][OP_JC][0] = IO | J
  banks[FLAGS_Z1C1][OP_JZ][0] = IO | J
  return banks
}

export function eepromImages(rom: number[][][]): { hi: Uint8Array; lo: Uint8Array } {
  const hi = new Uint8Array(1024)
  const lo = new Uint8Array(1024)
  for (let address = 0; address < 1024; address++) {
    const flags = (address & 0b1100000000) >> 8
    const byteSel = (address & 0b0010000000) >> 7
    const instruction = (address & 0b0001111000) >> 3
    const step = address & 0b0000000111
    const word = rom[flags][instruction][step]
    if (byteSel) {
      lo[address] = word & 0xff
    } else {
      hi[address] = (word >> 8) & 0xff
    }
  }
  return { hi, lo }
}
