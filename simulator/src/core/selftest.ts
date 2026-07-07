import { assemble } from './asm'
import { EXAMPLES } from './examples'
import { Machine } from './machine'
import { buildControlRom, eepromImages } from './microcode'

export interface TestReport {
  passed: string[]
  failed: { name: string; reason: string }[]
}

function loadProgram(name: string): Machine {
  const example = EXAMPLES.find((e) => e.name === name)
  if (!example) throw new Error(`no example named ${name}`)
  const result = assemble(example.source)
  if (!result.ok) throw new Error(`${name} failed to assemble: ${result.error.message} at ${result.error.line}:${result.error.col}`)
  const machine = new Machine()
  machine.loadImage(result.result.image)
  return machine
}

function runToHalt(machine: Machine, maxCycles: number): number[] {
  const outputs: number[] = []
  let lastOut = machine.out
  for (let i = 0; i < maxCycles && !machine.halted; i++) {
    machine.tick()
    if (machine.out !== lastOut) {
      lastOut = machine.out
      outputs.push(lastOut)
    }
  }
  return outputs
}

function expectHaltShowing(name: string, expected: number, maxCycles = 200000): void {
  const machine = loadProgram(name)
  runToHalt(machine, maxCycles)
  if (!machine.halted) throw new Error(`${name}: did not halt within ${maxCycles} cycles`)
  if (machine.out !== expected) throw new Error(`${name}: halted showing ${machine.out}, expected ${expected}`)
}

function expectPrefix(name: string, prefix: number[], maxCycles: number): void {
  const machine = loadProgram(name)
  const outputs = runToHalt(machine, maxCycles)
  for (let i = 0; i < prefix.length; i++) {
    if (outputs[i] !== prefix[i]) {
      throw new Error(`${name}: output ${i} was ${outputs[i]}, expected ${prefix[i]} (saw ${outputs.slice(0, 12).join(',')})`)
    }
  }
}

const CASES: { name: string; run: () => void }[] = [
  {
    name: 'microcode EEPROM images are populated',
    run: () => {
      const { hi, lo } = eepromImages(buildControlRom())
      const nonZero = (arr: Uint8Array) => arr.some((b) => b !== 0)
      if (!nonZero(hi) || !nonZero(lo)) throw new Error('EEPROM images are empty')
    },
  },
  {
    name: 'Fibonacci matches the legacy assembler byte layout',
    run: () => {
      const example = EXAMPLES.find((e) => e.name === 'Fibonacci')!
      const result = assemble(example.source)
      if (!result.ok) throw new Error(result.error.message)
      const expected = [0x10, 22, 0x20, 23, 0x40, 22, 0x80, 14, 0xf0, 0, 0xb0, 23, 0x70, 0, 0x60, 0, 22, 0x60, 1, 23, 0x70, 0, 1, 0]
      const actual = result.result.image.slice(0, expected.length)
      expected.forEach((byte, i) => {
        if (actual[i] !== byte) throw new Error(`byte ${i}: got ${actual[i]}, expected ${byte}`)
      })
    },
  },
  { name: 'Division: 63 / 9 halts showing 7', run: () => expectHaltShowing('Division', 7) },
  { name: 'Multiplication: 3 x 42 halts showing 126', run: () => expectHaltShowing('Multiplication', 126) },
  { name: 'SquareRoot: sqrt(81) halts showing 9', run: () => expectHaltShowing('SquareRoot', 9) },
  { name: 'Factorial: 5! halts showing 120', run: () => expectHaltShowing('Factorial', 120) },
  { name: 'NthRoot: cbrt(125) halts showing 5', run: () => expectHaltShowing('NthRoot', 5, 2000000) },
  { name: 'GCD: gcd(48, 36) halts showing 12', run: () => expectHaltShowing('GCD', 12) },
  { name: 'PowersOfTwo: halts showing 128', run: () => expectHaltShowing('PowersOfTwo', 128) },
  {
    name: 'PowersOfTwo: streams 2, 4, ..., 64 first',
    run: () => expectPrefix('PowersOfTwo', [2, 4, 8, 16, 32, 64], 10000),
  },
  {
    name: 'Fibonacci: streams 1, 2, 3, 5, 8, 13, 21, 34, 55, 89',
    run: () => expectPrefix('Fibonacci', [1, 2, 3, 5, 8, 13, 21, 34, 55, 89], 20000),
  },
  {
    name: 'Bounce: climbs to 255 and returns to 0',
    run: () => {
      const machine = loadProgram('Bounce')
      const outputs = runToHalt(machine, 80000)
      const peak = outputs.indexOf(255)
      if (peak === -1) throw new Error('never reached 255')
      if (!outputs.slice(peak).includes(0)) throw new Error('never came back down to 0')
    },
  },
  {
    name: 'breakpoints pause at instruction boundaries',
    run: () => {
      const machine = loadProgram('Fibonacci')
      machine.breakpoints.add(8)
      let hits = 0
      for (let i = 0; i < 5000 && hits === 0; i++) {
        if (machine.tick().hitBreakpoint) hits++
      }
      if (hits === 0) throw new Error('breakpoint at 0x08 never hit')
      if (machine.pc !== 8) throw new Error(`paused with pc=${machine.pc}, expected 8`)
    },
  },
  {
    name: 'trace records fetch and execute phases',
    run: () => {
      const machine = loadProgram('Bounce')
      for (let i = 0; i < 64; i++) machine.tick()
      const trace = machine.recentTrace(64)
      if (!trace.some((t) => t.phase === 'fetch')) throw new Error('no fetch phases in trace')
      if (!trace.some((t) => t.phase === 'exec')) throw new Error('no exec phases in trace')
    },
  },
]

export function runSelfTest(): TestReport {
  const report: TestReport = { passed: [], failed: [] }
  for (const testCase of CASES) {
    try {
      testCase.run()
      report.passed.push(testCase.name)
    } catch (e) {
      report.failed.push({ name: testCase.name, reason: e instanceof Error ? e.message : String(e) })
    }
  }
  return report
}
