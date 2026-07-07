import { Snapshot, TraceEntry } from './machine'
import { SIG } from './signals'

export type LedColor = 'red' | 'yellow' | 'green' | 'blue'

export interface LedBarDef {
  label: string
  color: LedColor
  count: number
  seriesOhm: number
  value: (s: Snapshot) => number
}

export interface PinSignal {
  label: string
  sample: (t: TraceEntry) => number
}

export interface ChipDef {
  ref: string
  part: string
  pins?: Record<string, string>
  signals?: Record<string, PinSignal>
}

export type PassiveKind = 'res' | 'cap' | 'rnet' | 'pot' | 'led' | 'switch' | 'ledbar'

export interface PassiveDef {
  ref: string
  kind: PassiveKind
  value: string
  color?: string
  pins?: Record<string, string>
  hidden3d?: boolean
}

export interface ModuleDef {
  id: string
  name: string
  position: [number, number]
  size: [number, number]
  chips: ChipDef[]
  passives: PassiveDef[]
  leds: LedBarDef[]
  sevenSeg?: boolean
  description: string
}

const bus245 = (base: number): Record<string, string> => {
  const pins: Record<string, string> = {}
  for (let i = 0; i < 8; i++) pins[String(18 - i)] = `BUS${i}`
  pins['1'] = 'GND'
  pins['19'] = `CTL_OE_${base}`
  return pins
}

const ctl = (name: keyof typeof SIG, label = `CTL ${name}`): PinSignal => ({
  label,
  sample: (t) => ((t.controlWord & SIG[name]) !== 0 ? 1 : 0),
})

const clk: PinSignal = { label: 'CLK', sample: (t) => t.cycle & 1 }
const clkInv: PinSignal = { label: '~CLK', sample: (t) => 1 - (t.cycle & 1) }

const bit = (label: string, sel: (t: TraceEntry) => number, n: number): PinSignal => ({
  label: `${label}${n}`,
  sample: (t) => (sel(t) >> n) & 1,
})

const regQ = (label: string, sel: (t: TraceEntry) => number, base: number): Record<string, PinSignal> => ({
  '3': bit(label, sel, base),
  '4': bit(label, sel, base + 1),
  '5': bit(label, sel, base + 2),
  '6': bit(label, sel, base + 3),
  '7': clk,
})

const regD = (base: number): Record<string, PinSignal> => ({
  '14': bit('BUS', (t) => t.bus, base),
  '13': bit('BUS', (t) => t.bus, base + 1),
  '12': bit('BUS', (t) => t.bus, base + 2),
  '11': bit('BUS', (t) => t.bus, base + 3),
})

const counterQ = (label: string, sel: (t: TraceEntry) => number, base: number): Record<string, PinSignal> => ({
  '14': bit(label, sel, base),
  '13': bit(label, sel, base + 1),
  '12': bit(label, sel, base + 2),
  '11': bit(label, sel, base + 3),
  '2': clk,
})

const busPins = (side: 'A' | 'B', label: string, sel: (t: TraceEntry) => number): Record<string, PinSignal> => {
  const pins: Record<string, PinSignal> = {}
  for (let i = 0; i < 8; i++) {
    const pin = side === 'A' ? String(2 + i) : String(18 - i)
    pins[pin] = bit(side === 'B' ? 'BUS' : label, side === 'B' ? (t) => t.bus : sel, i)
  }
  return pins
}

const aluSum = (t: TraceEntry): number => {
  const sub = (t.controlWord & SIG.SU) !== 0
  return (t.a + (t.b ^ (sub ? 0xff : 0)) + (sub ? 1 : 0)) & 0xff
}

const aluCarry = (t: TraceEntry): number => {
  const sub = (t.controlWord & SIG.SU) !== 0
  return t.a + (t.b ^ (sub ? 0xff : 0)) + (sub ? 1 : 0) > 0xff ? 1 : 0
}

const xorB = (t: TraceEntry): number => {
  const sub = (t.controlWord & SIG.SU) !== 0
  return t.b ^ (sub ? 0xff : 0)
}

const ramData = (t: TraceEntry): number => ((t.controlWord & (SIG.RO | SIG.RI)) !== 0 ? t.bus : 0)

const irOperand = (t: TraceEntry): number => t.bus

const rnet9 = (prefix: string): Record<string, string> => {
  const pins: Record<string, string> = { '1': 'GND' }
  for (let i = 0; i < 8; i++) pins[String(i + 2)] = `${prefix}${i}`
  return pins
}

const bar8 = (prefix: string): Record<string, string> => {
  const pins: Record<string, string> = {}
  for (let i = 0; i < 8; i++) pins[String(i + 1)] = `${prefix}${i}`
  return pins
}

const eepromByte =
  (high: boolean) =>
  (t: TraceEntry): number =>
    high ? (t.controlWord >> 8) & 0xff : t.controlWord & 0xff

const eepromPins = (high: boolean, label: string): Record<string, PinSignal> => {
  const dataPins = ['9', '10', '11', '13', '14', '15', '16', '17']
  const pins: Record<string, PinSignal> = {}
  dataPins.forEach((pin, i) => {
    pins[pin] = bit(label, eepromByte(high), i)
  })
  return pins
}

export const MODULES: ModuleDef[] = [
  {
    id: 'clock',
    name: 'CLOCK',
    position: [-3.2, -4.9],
    size: [2.7, 2.0],
    description: '555 astable oscillator, Schmitt-trigger debounced run/step switches, HLT gate',
    chips: [
      {
        ref: 'U1',
        part: 'LM555',
        pins: { '2': '555_THR', '3': '555_OUT', '5': '555_CV', '6': '555_THR', '7': '555_DIS' },
        signals: { '3': { label: '555 OUT', sample: (t) => t.cycle & 1 } },
      },
      { ref: 'U2', part: '74HC14', pins: { '1': 'SW2_DEB', '5': 'SW1_DEB' }, signals: { '2': clkInv, '4': clk, '8': clk } },
      { ref: 'U3', part: '74HC08', signals: { '8': clk, '11': clkInv, '1': ctl('HLT') } },
      { ref: 'U4', part: '74LS32', signals: { '3': clk } },
    ],
    passives: [
      { ref: 'R1', kind: 'pot', value: '1M', pins: { '1': '555_DIS', '2': '555_THR', '3': 'NC' } },
      { ref: 'R2', kind: 'res', value: '1K', pins: { '1': 'VCC', '2': '555_DIS' } },
      { ref: 'R3', kind: 'res', value: '100K', pins: { '1': 'VCC', '2': 'SW2_DEB' } },
      { ref: 'R4', kind: 'res', value: '100K', pins: { '1': 'VCC', '2': 'SW1_DEB' } },
      { ref: 'C1', kind: 'cap', value: '10nF', pins: { '1': '555_THR', '2': 'GND' } },
      { ref: 'C2', kind: 'cap', value: '100nF', pins: { '1': '555_CV', '2': 'GND' } },
      { ref: 'C3', kind: 'cap', value: '10nF', pins: { '1': 'SW2_DEB', '2': 'GND' } },
      { ref: 'C4', kind: 'cap', value: '10nF', pins: { '1': 'SW1_DEB', '2': 'GND' } },
      { ref: 'SW1', kind: 'switch', value: 'step', pins: { '1': 'SW1_DEB', '2': 'GND' } },
      { ref: 'SW2', kind: 'switch', value: 'mode', pins: { '1': 'SW2_DEB', '2': 'GND' } },
      { ref: 'D3', kind: 'led', value: 'clk', color: '#4c8dff', hidden3d: true, pins: { '1': 'CLK', '2': 'GND' } },
    ],
    leds: [{ label: 'CLK', color: 'blue', count: 1, seriesOhm: 470, value: (s) => (s.halted ? 0 : s.cycle & 1) }],
  },
  {
    id: 'pc',
    name: 'PROGRAM COUNTER',
    position: [3.2, -4.95],
    size: [2.7, 1.7],
    description: 'Two cascaded 74HC161 4-bit presettable counters form the 8-bit PC',
    chips: [
      {
        ref: 'U5',
        part: '74HC161',
        pins: { '2': 'CLK', '1': 'RST_L', '7': 'CTL_CE', '9': 'CTL_J_L' },
        signals: { ...counterQ('PC', (t) => t.pc, 0), '7': ctl('CE'), '9': ctl('J') },
      },
      { ref: 'U6', part: '74HC161', pins: { '2': 'CLK', '1': 'RST_L' }, signals: counterQ('PC', (t) => t.pc, 4) },
      { ref: 'U7', part: '74HC245', pins: bus245(1), signals: { ...busPins('A', 'PC', (t) => t.pc), ...busPins('B', 'PC', (t) => t.pc), '19': ctl('CO') } },
    ],
    passives: [
      { ref: 'RN1', kind: 'rnet', value: '470x9', pins: rnet9('PC') },
      { ref: 'LB1', kind: 'ledbar', value: 'PC', color: '#34c759', hidden3d: true, pins: bar8('PC') },
    ],
    leds: [{ label: 'PC', color: 'green', count: 8, seriesOhm: 470, value: (s) => s.pc }],
  },
  {
    id: 'ram',
    name: 'RAM 256B',
    position: [-3.2, -2.35],
    size: [2.8, 2.9],
    description: 'MAR, HM6116P SRAM, bus/programmer multiplexers with MOSFET power gating, RC write pulse',
    chips: [
      { ref: 'U36', part: '74HC173', pins: { '7': 'CLK', '15': 'RST' }, signals: { ...regQ('MAR', (t) => t.mar, 0), ...regD(0) } },
      { ref: 'U37', part: '74HC173', pins: { '7': 'CLK', '15': 'RST' }, signals: { ...regQ('MAR', (t) => t.mar, 4), ...regD(4) } },
      { ref: 'U38', part: '74HC157' },
      { ref: 'U39', part: '74HC157' },
      {
        ref: 'U40',
        part: 'HM6116P',
        pins: { '21': 'RAM_WE_L' },
        signals: {
          '9': bit('RAM', ramData, 0),
          '10': bit('RAM', ramData, 1),
          '11': bit('RAM', ramData, 2),
          '13': bit('RAM', ramData, 3),
          '14': bit('RAM', ramData, 4),
          '15': bit('RAM', ramData, 5),
          '16': bit('RAM', ramData, 6),
          '17': bit('RAM', ramData, 7),
          '18': ctl('RO', '~CE'),
          '21': { label: '~WE', sample: (t) => ((t.controlWord & SIG.RI) !== 0 && (t.cycle & 1) === 1 ? 0 : 1) },
        },
      },
      { ref: 'U41', part: '74HC245', pins: bus245(2), signals: { ...busPins('A', 'RAM', ramData), ...busPins('B', 'RAM', ramData), '19': ctl('RO') } },
      { ref: 'U42', part: '74LS157', pins: { '16': 'MUX_VCC' } },
      { ref: 'U43', part: '74LS157', pins: { '16': 'MUX_VCC' } },
      { ref: 'U44', part: '74HC157' },
      { ref: 'U45', part: '74HC00', pins: { '1': 'WE_BUF', '2': 'CTL_RI', '3': 'RAM_WE_L' }, signals: { '3': ctl('RI', 'WE gate') } },
      { ref: 'Q1', part: '2N2222A', pins: { '1': 'WE_BUF', '2': 'WE_PULSE', '3': 'VCC' } },
      { ref: 'Q2', part: 'IRF9540N', pins: { '1': 'PM', '2': 'MUX_VCC', '3': 'VCC' } },
    ],
    passives: [
      { ref: 'RN4', kind: 'rnet', value: '220x9', pins: rnet9('MAR') },
      { ref: 'RN5', kind: 'rnet', value: '220x9', pins: rnet9('RAM') },
      { ref: 'R14', kind: 'res', value: '220', pins: { '1': 'PM', '2': 'D1_A' } },
      { ref: 'R15', kind: 'res', value: '220', pins: { '1': 'RUN_MODE', '2': 'D2_A' } },
      { ref: 'R16', kind: 'res', value: '1K', pins: { '1': 'WE_BUF', '2': 'GND' } },
      { ref: 'R17', kind: 'res', value: '10K', pins: { '1': 'WE_PULSE', '2': 'GND' } },
      { ref: 'C7', kind: 'cap', value: '10nF', pins: { '1': 'CLK', '2': 'WE_PULSE' } },
      { ref: 'D1', kind: 'led', value: 'prog', color: '#ff453a', pins: { '1': 'D1_A', '2': 'GND' } },
      { ref: 'D2', kind: 'led', value: 'run', color: '#34c759', pins: { '1': 'D2_A', '2': 'GND' } },
      { ref: 'SW4', kind: 'switch', value: 'prog/run', pins: { '1': 'PM', '2': 'RUN_MODE' } },
      { ref: 'LB2', kind: 'ledbar', value: 'ADDR', color: '#ffd60a', hidden3d: true, pins: bar8('MAR') },
      { ref: 'LB3', kind: 'ledbar', value: 'DATA', color: '#ff453a', hidden3d: true, pins: bar8('RAM') },
    ],
    leds: [
      { label: 'ADDR', color: 'yellow', count: 8, seriesOhm: 220, value: (s) => s.mar },
      { label: 'DATA', color: 'red', count: 8, seriesOhm: 220, value: (s) => s.ram[s.mar] },
    ],
  },
  {
    id: 'a',
    name: 'A REGISTER',
    position: [3.2, -3.2],
    size: [2.7, 1.6],
    description: 'Two 74HC173 4-bit registers with 74HC245 bus interface',
    chips: [
      { ref: 'U8', part: '74HC173', pins: { '7': 'CLK', '15': 'RST' }, signals: { ...regQ('A', (t) => t.a, 0), ...regD(0) } },
      { ref: 'U9', part: '74HC173', pins: { '7': 'CLK', '15': 'RST' }, signals: { ...regQ('A', (t) => t.a, 4), ...regD(4) } },
      { ref: 'U10', part: '74HC245', pins: bus245(3), signals: { ...busPins('A', 'A', (t) => t.a), ...busPins('B', 'A', (t) => t.a), '19': ctl('AO') } },
    ],
    passives: [
      { ref: 'RN2', kind: 'rnet', value: '220x9', pins: rnet9('A') },
      { ref: 'LB4', kind: 'ledbar', value: 'A', color: '#ff453a', hidden3d: true, pins: bar8('A') },
    ],
    leds: [{ label: 'A', color: 'red', count: 8, seriesOhm: 220, value: (s) => s.a }],
  },
  {
    id: 'ir',
    name: 'INSTRUCTIONS REGISTER',
    position: [-3.2, 0.35],
    size: [2.8, 2.5],
    description: '4-bit opcode + 8-bit operand registers, toggle counter/decoder, JK opcode latch',
    chips: [
      { ref: 'U29', part: '74HC173', pins: { '7': 'CLK' }, signals: { ...regQ('OPR', (t) => t.bus, 0), ...regD(0) } },
      { ref: 'U30', part: '74HC173', pins: { '7': 'CLK' }, signals: { ...regQ('OPR', (t) => t.bus, 4), ...regD(4) } },
      { ref: 'U31', part: '74HC173', pins: { '7': 'CLK' }, signals: { ...regQ('OPC', (t) => t.opcode, 0), ...regD(4) } },
      {
        ref: 'U32',
        part: '74HC245',
        pins: bus245(4),
        signals: { ...busPins('A', 'OPR', irOperand), ...busPins('B', 'BUS', (t) => t.bus), '19': ctl('IO') },
      },
      { ref: 'U33', part: '74HC161', pins: { '1': 'CTL_T0_L' }, signals: { '2': ctl('II', 'II clk') } },
      { ref: 'U34', part: '74HC138' },
      {
        ref: 'U35',
        part: '74HC107',
        pins: { '13': 'RST_L' },
        signals: { '3': { label: 'OPC latch', sample: (t) => (t.phase === 'exec' ? 1 : 0) } },
      },
      { ref: 'Q3', part: '2N3906', pins: { '1': 'VCC', '2': 'Q3_B', '3': 'II_CLK' } },
    ],
    passives: [
      { ref: 'R8', kind: 'res', value: '10K', pins: { '1': 'OPC0', '2': 'GND' } },
      { ref: 'R9', kind: 'res', value: '10K', pins: { '1': 'OPC1', '2': 'GND' } },
      { ref: 'R10', kind: 'res', value: '10K', pins: { '1': 'OPC2', '2': 'GND' } },
      { ref: 'R11', kind: 'res', value: '10K', pins: { '1': 'OPC3', '2': 'GND' } },
      { ref: 'R12', kind: 'res', value: '1K', pins: { '1': 'VCC', '2': 'Q3_B' } },
      { ref: 'R13', kind: 'res', value: '1K', pins: { '1': 'CTL_II', '2': 'Q3_B' } },
      { ref: 'RN3', kind: 'rnet', value: '220x9', pins: rnet9('OPR') },
      { ref: 'LB5', kind: 'ledbar', value: 'OPC', color: '#4c8dff', hidden3d: true, pins: { '1': 'OPC0', '2': 'OPC1', '3': 'OPC2', '4': 'OPC3' } },
      { ref: 'LB6', kind: 'ledbar', value: 'OPR', color: '#ff453a', hidden3d: true, pins: bar8('OPR') },
    ],
    leds: [
      { label: 'OPC', color: 'blue', count: 4, seriesOhm: 470, value: (s) => s.irOpcode },
      { label: 'OPR', color: 'red', count: 8, seriesOhm: 220, value: (s) => s.irOperand },
    ],
  },
  {
    id: 'alu',
    name: 'ALU',
    position: [3.2, -1.15],
    size: [2.7, 2.0],
    description: "Two 74LS283 adders + two 74HC86 XOR banks for two's-complement subtraction",
    chips: [
      { ref: 'U11', part: '74HC86', signals: { '3': bit('XB', xorB, 0), '6': bit('XB', xorB, 1), '8': bit('XB', xorB, 2), '11': bit('XB', xorB, 3) } },
      { ref: 'U12', part: '74HC86', signals: { '3': bit('XB', xorB, 4), '6': bit('XB', xorB, 5), '8': bit('XB', xorB, 6), '11': bit('XB', xorB, 7) } },
      { ref: 'U13', part: '74LS283', signals: { '4': bit('SUM', aluSum, 0), '1': bit('SUM', aluSum, 1), '13': bit('SUM', aluSum, 2), '10': bit('SUM', aluSum, 3) } },
      {
        ref: 'U14',
        part: '74LS283',
        signals: {
          '4': bit('SUM', aluSum, 4),
          '1': bit('SUM', aluSum, 5),
          '13': bit('SUM', aluSum, 6),
          '10': bit('SUM', aluSum, 7),
          '9': { label: 'C4 carry', sample: aluCarry },
        },
      },
      { ref: 'U15', part: '74HC245', pins: bus245(5), signals: { ...busPins('A', 'SUM', aluSum), ...busPins('B', 'SUM', aluSum), '19': ctl('EOFI') } },
    ],
    passives: [
      { ref: 'RN6', kind: 'rnet', value: '220x9', pins: rnet9('SUM') },
      { ref: 'LB7', kind: 'ledbar', value: 'SUM', color: '#ff453a', hidden3d: true, pins: bar8('SUM') },
    ],
    leds: [{ label: 'SUM', color: 'red', count: 8, seriesOhm: 220, value: (s) => s.aluOut }],
  },
  {
    id: 'b',
    name: 'B REGISTER',
    position: [3.2, 0.65],
    size: [2.7, 1.5],
    description: 'Two 74HC173 4-bit registers, feeds ALU operand B',
    chips: [
      { ref: 'U16', part: '74HC173', pins: { '7': 'CLK', '15': 'RST' }, signals: { ...regQ('B', (t) => t.b, 0), ...regD(0) } },
      { ref: 'U17', part: '74HC173', pins: { '7': 'CLK', '15': 'RST' }, signals: { ...regQ('B', (t) => t.b, 4), ...regD(4) } },
    ],
    passives: [
      { ref: 'RN7', kind: 'rnet', value: '220x9', pins: rnet9('B') },
      { ref: 'LB8', kind: 'ledbar', value: 'B', color: '#ff453a', hidden3d: true, pins: bar8('B') },
    ],
    leds: [{ label: 'B', color: 'red', count: 8, seriesOhm: 220, value: (s) => s.b }],
  },
  {
    id: 'control',
    name: 'CONTROL LOGIC',
    position: [-3.2, 2.9],
    size: [2.8, 2.3],
    description: 'Microstep counter/decoder, two AT28C16 microcode EEPROMs, active-low signal inverters',
    chips: [
      { ref: 'U46', part: '74HC161', pins: { '2': 'CLK', '1': 'RSTSTP_L' }, signals: { '14': bit('STEP', (t) => t.step, 0), '13': bit('STEP', (t) => t.step, 1), '12': bit('STEP', (t) => t.step, 2), '2': clk } },
      {
        ref: 'U47',
        part: '74HC138',
        signals: {
          '15': { label: '~T0', sample: (t) => (t.step === 0 ? 0 : 1) },
          '14': { label: '~T1', sample: (t) => (t.step === 1 ? 0 : 1) },
          '13': { label: '~T2', sample: (t) => (t.step === 2 ? 0 : 1) },
          '12': { label: '~T3', sample: (t) => (t.step === 3 ? 0 : 1) },
          '11': { label: '~T4', sample: (t) => (t.step === 4 ? 0 : 1) },
        },
      },
      { ref: 'U48', part: 'AT28C16', signals: eepromPins(true, 'CW-HI') },
      { ref: 'U49', part: 'AT28C16', signals: eepromPins(false, 'CW-LO') },
      { ref: 'U50', part: '74HC04' },
      { ref: 'U51', part: '74HC04' },
    ],
    passives: [
      {
        ref: 'RN8',
        kind: 'rnet',
        value: '470x9',
        pins: { '1': 'GND', '2': '~T0', '3': '~T1', '4': '~T2', '5': '~T3', '6': '~T4' },
      },
      { ref: 'RN9', kind: 'rnet', value: '220x9', pins: rnet9('CW_LO') },
      { ref: 'LB9', kind: 'ledbar', value: 'STEP', color: '#34c759', hidden3d: true, pins: { '1': '~T0', '2': '~T1', '3': '~T2', '4': '~T3', '5': '~T4' } },
    ],
    leds: [{ label: 'STEP', color: 'green', count: 5, seriesOhm: 470, value: (s) => 1 << s.step }],
  },
  {
    id: 'output',
    name: 'OUTPUT DISPLAY',
    position: [3.2, 2.75],
    size: [2.7, 2.2],
    description: 'Output register, 555 scan clock, JK+decoder digit multiplexer, EEPROM 7-segment decode',
    chips: [
      { ref: 'U18', part: '74HC173', pins: { '7': 'CLK' }, signals: { ...regQ('OUT', (t) => t.out, 0), ...regD(0) } },
      { ref: 'U19', part: '74HC173', pins: { '7': 'CLK' }, signals: { ...regQ('OUT', (t) => t.out, 4), ...regD(4) } },
      {
        ref: 'U20',
        part: 'LM555',
        pins: { '2': 'SCAN_THR', '5': 'SCAN_CV', '6': 'SCAN_THR' },
        signals: { '3': { label: 'scan clk', sample: (t) => t.cycle & 1 } },
      },
      { ref: 'U21', part: '74HC107' },
      { ref: 'U22', part: '74HC138' },
      { ref: 'U23', part: 'AT28C16' },
    ],
    passives: [
      {
        ref: 'RN10',
        kind: 'rnet',
        value: '220x9',
        pins: { '1': 'GND', '2': 'SEG_A', '3': 'SEG_B', '4': 'SEG_C', '5': 'SEG_D', '6': 'SEG_E', '7': 'SEG_F', '8': 'SEG_G', '9': 'SEG_DP' },
      },
      { ref: 'C5', kind: 'cap', value: '10nF', pins: { '1': 'SCAN_THR', '2': 'GND' } },
      { ref: 'C6', kind: 'cap', value: '100nF', pins: { '1': 'SCAN_CV', '2': 'GND' } },
      { ref: 'SW3', kind: 'switch', value: 'sign', pins: { '1': 'SIGN_SEL', '2': 'GND' } },
    ],
    leds: [],
    sevenSeg: true,
  },
  {
    id: 'flags',
    name: 'FLAGS',
    position: [3.2, 4.6],
    size: [2.7, 1.3],
    description: 'Carry and zero flags latched on EOFI, addressed into the control EEPROMs',
    chips: [
      {
        ref: 'U24',
        part: '74HC173',
        pins: { '7': 'CLK', '15': 'RST' },
        signals: { '3': { label: 'CF', sample: (t) => (t.carry ? 1 : 0) }, '4': { label: 'ZF', sample: (t) => (t.zero ? 1 : 0) }, '7': clk },
      },
      { ref: 'U25', part: '74HC02' },
    ],
    passives: [
      { ref: 'R18', kind: 'res', value: '470', pins: { '1': 'CF', '2': 'GND' } },
      { ref: 'R19', kind: 'res', value: '470', pins: { '1': 'ZF', '2': 'GND' } },
      { ref: 'D4', kind: 'led', value: 'CF', color: '#34c759', hidden3d: true, pins: { '1': 'CF', '2': 'GND' } },
      { ref: 'D5', kind: 'led', value: 'ZF', color: '#34c759', hidden3d: true, pins: { '1': 'ZF', '2': 'GND' } },
    ],
    leds: [{ label: 'CF ZF', color: 'green', count: 2, seriesOhm: 470, value: (s) => (s.carry ? 1 : 0) | (s.zero ? 2 : 0) }],
  },
  {
    id: 'cw',
    name: 'CONTROL WORDS',
    position: [-3.2, 4.75],
    size: [2.8, 1.0],
    description: '16 control signals out of the microcode EEPROMs',
    chips: [],
    passives: [
      { ref: 'RN11', kind: 'rnet', value: '470x9', pins: rnet9('CW_HI') },
      { ref: 'RN12', kind: 'rnet', value: '470x9', pins: rnet9('CW_LO') },
      { ref: 'LB10', kind: 'ledbar', value: 'CW HI', color: '#4c8dff', hidden3d: true, pins: bar8('CW_HI') },
      { ref: 'LB11', kind: 'ledbar', value: 'CW LO', color: '#4c8dff', hidden3d: true, pins: bar8('CW_LO') },
    ],
    leds: [{ label: 'CW', color: 'blue', count: 16, seriesOhm: 470, value: (s) => s.controlWord }],
  },
  {
    id: 'bus',
    name: 'BUS',
    position: [0, -0.1],
    size: [0.95, 8.4],
    description: '8-bit shared data/address bus',
    chips: [],
    passives: [
      { ref: 'RN13', kind: 'rnet', value: '220x9', pins: rnet9('BUS') },
      { ref: 'LB12', kind: 'ledbar', value: 'BUS', color: '#ffd60a', hidden3d: true, pins: bar8('BUS') },
    ],
    leds: [{ label: 'BUS', color: 'yellow', count: 8, seriesOhm: 220, value: (s) => s.bus }],
  },
]

export interface ConnectionDef {
  from: string
  to: string
  kind: 'bus' | 'ctl' | 'clk'
  activeMask?: number
}

export const CONNECTIONS: ConnectionDef[] = [
  { from: 'pc', to: 'bus', kind: 'bus', activeMask: SIG.CO | SIG.J },
  { from: 'ram', to: 'bus', kind: 'bus', activeMask: SIG.RO | SIG.RI | SIG.MI },
  { from: 'a', to: 'bus', kind: 'bus', activeMask: SIG.AO | SIG.AI },
  { from: 'alu', to: 'bus', kind: 'bus', activeMask: SIG.EOFI },
  { from: 'b', to: 'bus', kind: 'bus', activeMask: SIG.BI },
  { from: 'ir', to: 'bus', kind: 'bus', activeMask: SIG.IO | SIG.II },
  { from: 'output', to: 'bus', kind: 'bus', activeMask: SIG.OI },
  { from: 'control', to: 'pc', kind: 'ctl', activeMask: SIG.CE | SIG.J | SIG.CO },
  { from: 'control', to: 'ram', kind: 'ctl', activeMask: SIG.MI | SIG.RI | SIG.RO },
  { from: 'control', to: 'a', kind: 'ctl', activeMask: SIG.AI | SIG.AO },
  { from: 'control', to: 'b', kind: 'ctl', activeMask: SIG.BI },
  { from: 'control', to: 'alu', kind: 'ctl', activeMask: SIG.EOFI | SIG.SU },
  { from: 'control', to: 'ir', kind: 'ctl', activeMask: SIG.II | SIG.IO },
  { from: 'control', to: 'output', kind: 'ctl', activeMask: SIG.OI },
  { from: 'control', to: 'flags', kind: 'ctl', activeMask: SIG.EOFI },
  { from: 'clock', to: 'pc', kind: 'clk' },
  { from: 'clock', to: 'ram', kind: 'clk' },
  { from: 'clock', to: 'a', kind: 'clk' },
  { from: 'clock', to: 'b', kind: 'clk' },
  { from: 'clock', to: 'ir', kind: 'clk' },
  { from: 'clock', to: 'control', kind: 'clk' },
  { from: 'clock', to: 'output', kind: 'clk' },
  { from: 'clock', to: 'flags', kind: 'clk' },
]

export function moduleById(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id)
}

export function findChip(ref: string): { module: ModuleDef; chip: ChipDef } | undefined {
  for (const module of MODULES) {
    const chip = module.chips.find((c) => c.ref === ref)
    if (chip) return { module, chip }
  }
  return undefined
}

export function controlSignalNets(): string[] {
  return Object.keys(SIG).map((name) => `CTL_${name}`)
}
