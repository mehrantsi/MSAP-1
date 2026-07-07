import { buildControlRom } from './microcode'
import { SIG } from './signals'

export interface TraceEntry {
  cycle: number
  phase: 'fetch' | 'exec'
  opcode: number
  step: number
  bus: number
  controlWord: number
  pc: number
  a: number
  b: number
  mar: number
  out: number
  carry: boolean
  zero: boolean
}

export interface Snapshot {
  bus: number
  pc: number
  a: number
  b: number
  mar: number
  irOpcode: number
  irOperand: number
  out: number
  carry: boolean
  zero: boolean
  step: number
  fetch: boolean
  halted: boolean
  controlWord: number
  aluOut: number
  cycle: number
  busConflict: boolean
  ram: Uint8Array
}

export const TRACE_SIZE = 2048

export class Machine {
  rom = buildControlRom()
  ram = new Uint8Array(256)

  bus = 0
  pc = 0
  a = 0
  b = 0
  mar = 0
  irOpcode = 0
  irOperand = 0
  out = 0
  carry = false
  zero = false
  step = 0
  fetch = true
  iiToggle = 0
  halted = false
  cycle = 0
  busConflict = false

  breakpoints = new Set<number>()
  trace: TraceEntry[] = []
  private traceHead = 0

  setTemplate(template: number[][]): void {
    this.rom = buildControlRom(template)
  }

  reset(): void {
    this.bus = 0
    this.pc = 0
    this.a = 0
    this.b = 0
    this.mar = 0
    this.irOpcode = 0
    this.irOperand = 0
    this.out = 0
    this.carry = false
    this.zero = false
    this.step = 0
    this.fetch = true
    this.iiToggle = 0
    this.halted = false
    this.cycle = 0
    this.busConflict = false
    this.trace = []
    this.traceHead = 0
  }

  loadImage(image: (number | null)[]): void {
    this.ram.fill(0)
    image.forEach((value, addr) => {
      if (value !== null && addr < this.ram.length) this.ram[addr] = value
    })
  }

  flagsIndex(): number {
    return (this.zero ? 2 : 0) | (this.carry ? 1 : 0)
  }

  controlWord(): number {
    return this.rom[this.flagsIndex()][this.fetch ? 0 : this.irOpcode][this.step]
  }

  private collapseReset(): number {
    let guard = 0
    for (;;) {
      const cw = this.controlWord()
      if (!(cw & SIG.RST) || guard++ > 4) return cw
      this.step = 0
      this.iiToggle = 0
      this.fetch = !this.fetch
    }
  }

  atInstructionBoundary(): boolean {
    return this.fetch && this.step === 0 && !this.halted
  }

  tick(): { hitBreakpoint: boolean } {
    if (this.halted) return { hitBreakpoint: false }

    const cw = this.collapseReset()

    const sub = (cw & SIG.SU) !== 0
    const sum = this.a + (this.b ^ (sub ? 0xff : 0)) + (sub ? 1 : 0)
    const aluValue = sum & 0xff
    const aluCarry = sum > 0xff
    const aluZero = aluValue === 0

    let drivers = 0
    let bus = 0
    if (cw & SIG.CO) {
      bus = this.pc
      drivers++
    }
    if (cw & SIG.RO) {
      bus = this.ram[this.mar]
      drivers++
    }
    if (cw & SIG.IO) {
      bus = this.irOperand
      drivers++
    }
    if (cw & SIG.AO) {
      bus = this.a
      drivers++
    }
    if (cw & SIG.EOFI) {
      bus = aluValue
      drivers++
    }
    this.bus = bus
    this.busConflict = drivers > 1

    this.pushTrace(cw)

    if (cw & SIG.MI) this.mar = bus
    if (cw & SIG.RI) this.ram[this.mar] = bus
    if (cw & SIG.II) {
      if (this.iiToggle === 0) this.irOpcode = (bus >> 4) & 0xf
      else this.irOperand = bus
      this.iiToggle++
    }
    if (cw & SIG.AI) this.a = bus
    if (cw & SIG.BI) this.b = bus
    if (cw & SIG.OI) this.out = bus
    if (cw & SIG.J) this.pc = bus
    if (cw & SIG.CE) this.pc = (this.pc + 1) & 0xff
    if (cw & SIG.EOFI) {
      this.carry = aluCarry
      this.zero = aluZero
    }
    if (cw & SIG.HLT) {
      this.halted = true
      return { hitBreakpoint: false }
    }

    this.step = (this.step + 1) & 7
    this.cycle++

    const boundary = this.willBeAtBoundary()
    const hitBreakpoint = boundary && this.breakpoints.has(this.pc)
    return { hitBreakpoint }
  }

  private willBeAtBoundary(): boolean {
    let step = this.step
    let fetch = this.fetch
    let guard = 0
    for (;;) {
      const cw = this.rom[this.flagsIndex()][fetch ? 0 : this.irOpcode][step]
      if (!(cw & SIG.RST) || guard++ > 4) break
      step = 0
      fetch = !fetch
    }
    return fetch && step === 0
  }

  stepInstruction(): void {
    let guard = 0
    do {
      this.tick()
      guard++
    } while (!this.halted && guard < 32 && !this.willBeAtBoundary())
  }

  private pushTrace(cw: number): void {
    const entry: TraceEntry = {
      cycle: this.cycle,
      phase: this.fetch ? 'fetch' : 'exec',
      opcode: this.irOpcode,
      step: this.step,
      bus: this.bus,
      controlWord: cw,
      pc: this.pc,
      a: this.a,
      b: this.b,
      mar: this.mar,
      out: this.out,
      carry: this.carry,
      zero: this.zero,
    }
    if (this.trace.length < TRACE_SIZE) {
      this.trace.push(entry)
    } else {
      this.trace[this.traceHead] = entry
      this.traceHead = (this.traceHead + 1) % TRACE_SIZE
    }
  }

  recentTrace(count: number): TraceEntry[] {
    const total = this.trace.length
    const take = Math.min(count, total)
    const out: TraceEntry[] = []
    for (let i = total - take; i < total; i++) {
      out.push(this.trace[(this.traceHead + i) % total])
    }
    return out
  }

  snapshot(): Snapshot {
    return {
      bus: this.bus,
      pc: this.pc,
      a: this.a,
      b: this.b,
      mar: this.mar,
      irOpcode: this.irOpcode,
      irOperand: this.irOperand,
      out: this.out,
      carry: this.carry,
      zero: this.zero,
      step: this.step,
      fetch: this.fetch,
      halted: this.halted,
      controlWord: this.halted ? 0 : this.collapsePreview(),
      aluOut: this.aluPreview(),
      cycle: this.cycle,
      busConflict: this.busConflict,
      ram: this.ram.slice(),
    }
  }

  private collapsePreview(): number {
    let step = this.step
    let fetch = this.fetch
    let guard = 0
    for (;;) {
      const cw = this.rom[this.flagsIndex()][fetch ? 0 : this.irOpcode][step]
      if (!(cw & SIG.RST) || guard++ > 4) return cw
      step = 0
      fetch = !fetch
    }
  }

  private aluPreview(): number {
    return (this.a + this.b) & 0xff
  }
}
