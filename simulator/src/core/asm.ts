import { findInstruction, instructionSize, Isa, MSAP1 } from './isa'

export interface AsmError {
  message: string
  line: number
  col: number
}

export interface AsmResult {
  image: (number | null)[]
  listing: { address: number; bytes: number[]; line: number }[]
  labels: Map<string, number>
}

type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'sym'; name: string; line: number; col: number }
  | { kind: 'neg'; inner: Expr }
  | { kind: 'add'; lhs: Expr; rhs: Expr }
  | { kind: 'sub'; lhs: Expr; rhs: Expr }

interface Operand {
  kind: 'address' | 'immediate'
  expr: Expr
  line: number
  col: number
}

type Stmt =
  | { kind: 'label'; name: string; line: number; col: number }
  | { kind: 'instr'; mnemonic: string; operands: Operand[]; line: number; col: number }
  | { kind: 'org'; addr: Expr; line: number; col: number }
  | { kind: 'byte'; values: Expr[]; line: number; col: number }
  | { kind: 'word'; values: Expr[]; line: number; col: number }
  | { kind: 'equ'; name: string; value: Expr; line: number; col: number }

interface Token {
  kind: 'ident' | 'number' | 'directive' | 'hash' | 'dollar' | 'comma' | 'colon' | 'plus' | 'minus' | 'newline' | 'eof'
  text: string
  value: number
  line: number
  col: number
}

class AsmFailure extends Error {
  constructor(public err: AsmError) {
    super(err.message)
  }
}

function fail(message: string, line: number, col: number): never {
  throw new AsmFailure({ message, line, col })
}

function lex(source: string): Token[] {
  const tokens: Token[] = []
  const lines = source.split('\n')
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    let i = 0
    while (i < line.length) {
      const c = line[i]
      const col = i + 1
      if (c === ' ' || c === '\t' || c === '\r') {
        i++
        continue
      }
      if (c === ';') break
      const single: Record<string, Token['kind']> = {
        '#': 'hash',
        $: 'dollar',
        ',': 'comma',
        ':': 'colon',
        '+': 'plus',
        '-': 'minus',
      }
      if (single[c]) {
        tokens.push({ kind: single[c], text: c, value: 0, line: li + 1, col })
        i++
        continue
      }
      if (c === '.') {
        i++
        const start = i
        while (i < line.length && /[A-Za-z0-9_]/.test(line[i])) i++
        const word = line.slice(start, i)
        if (!word) fail("expected a directive name after '.'", li + 1, col)
        tokens.push({ kind: 'directive', text: word.toLowerCase(), value: 0, line: li + 1, col })
        continue
      }
      if (/[0-9]/.test(c)) {
        const start = i
        while (i < line.length && /[A-Za-z0-9_]/.test(line[i])) i++
        const word = line.slice(start, i)
        let value: number
        if (/^0[xX][0-9a-fA-F]+$/.test(word)) value = parseInt(word.slice(2), 16)
        else if (/^0[bB][01]+$/.test(word)) value = parseInt(word.slice(2), 2)
        else if (/^[0-9]+$/.test(word)) value = parseInt(word, 10)
        else fail(`invalid number literal '${word}'`, li + 1, col)
        tokens.push({ kind: 'number', text: word, value, line: li + 1, col })
        continue
      }
      if (/[A-Za-z_]/.test(c)) {
        const start = i
        while (i < line.length && /[A-Za-z0-9_]/.test(line[i])) i++
        tokens.push({ kind: 'ident', text: line.slice(start, i), value: 0, line: li + 1, col })
        continue
      }
      fail(`unexpected character '${c}'`, li + 1, col)
    }
    tokens.push({ kind: 'newline', text: '', value: 0, line: li + 1, col: line.length + 1 })
  }
  tokens.push({ kind: 'eof', text: '', value: 0, line: lines.length, col: 1 })
  return tokens
}

class Parser {
  pos = 0
  constructor(private tokens: Token[]) {}

  peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]
  }

  advance(): Token {
    const tok = this.peek()
    if (this.pos < this.tokens.length - 1) this.pos++
    return tok
  }

  atLineEnd(): boolean {
    const k = this.peek().kind
    return k === 'newline' || k === 'eof'
  }

  parseTerm(): Expr {
    const tok = this.advance()
    if (tok.kind === 'number') return { kind: 'num', value: tok.value }
    if (tok.kind === 'ident') return { kind: 'sym', name: tok.text, line: tok.line, col: tok.col }
    if (tok.kind === 'minus') return { kind: 'neg', inner: this.parseTerm() }
    if (tok.kind === 'plus') return this.parseTerm()
    fail('expected a number or symbol', tok.line, tok.col)
  }

  parseExpr(): Expr {
    let lhs = this.parseTerm()
    for (;;) {
      const k = this.peek().kind
      if (k === 'plus') {
        this.advance()
        lhs = { kind: 'add', lhs, rhs: this.parseTerm() }
      } else if (k === 'minus') {
        this.advance()
        lhs = { kind: 'sub', lhs, rhs: this.parseTerm() }
      } else {
        return lhs
      }
    }
  }

  parseOperand(): Operand {
    const tok = this.peek()
    if (tok.kind === 'hash') {
      this.advance()
      return { kind: 'immediate', expr: this.parseExpr(), line: tok.line, col: tok.col }
    }
    if (tok.kind === 'dollar') {
      this.advance()
      return { kind: 'address', expr: this.parseExpr(), line: tok.line, col: tok.col }
    }
    return { kind: 'address', expr: this.parseExpr(), line: tok.line, col: tok.col }
  }

  parseValueList(): Expr[] {
    const values: Expr[] = []
    for (;;) {
      if (this.peek().kind === 'hash') this.advance()
      values.push(this.parseExpr())
      if (this.peek().kind === 'comma') this.advance()
      else return values
    }
  }

  expectLineEnd(): void {
    if (this.atLineEnd()) {
      this.advance()
      return
    }
    const tok = this.peek()
    fail('unexpected token at end of statement', tok.line, tok.col)
  }

  parseLine(out: Stmt[]): void {
    while (this.peek().kind === 'ident' && this.peek(1).kind === 'colon') {
      const tok = this.advance()
      this.advance()
      out.push({ kind: 'label', name: tok.text, line: tok.line, col: tok.col })
    }
    const tok = this.peek()
    if (tok.kind === 'newline' || tok.kind === 'eof') {
      this.advance()
      return
    }
    if (tok.kind === 'ident') {
      this.advance()
      const operands: Operand[] = []
      if (!this.atLineEnd()) {
        operands.push(this.parseOperand())
        while (this.peek().kind === 'comma') {
          this.advance()
          operands.push(this.parseOperand())
        }
      }
      out.push({ kind: 'instr', mnemonic: tok.text, operands, line: tok.line, col: tok.col })
    } else if (tok.kind === 'directive') {
      this.advance()
      if (tok.text === 'org') {
        out.push({ kind: 'org', addr: this.parseExpr(), line: tok.line, col: tok.col })
      } else if (tok.text === 'byte') {
        out.push({ kind: 'byte', values: this.parseValueList(), line: tok.line, col: tok.col })
      } else if (tok.text === 'word') {
        out.push({ kind: 'word', values: this.parseValueList(), line: tok.line, col: tok.col })
      } else if (tok.text === 'equ') {
        const nameTok = this.advance()
        if (nameTok.kind !== 'ident') fail('expected a symbol name after .equ', nameTok.line, nameTok.col)
        if (this.peek().kind === 'comma') this.advance()
        out.push({ kind: 'equ', name: nameTok.text, value: this.parseExpr(), line: tok.line, col: tok.col })
      } else {
        fail(`unknown directive '.${tok.text}'`, tok.line, tok.col)
      }
    } else if (tok.kind === 'hash') {
      this.advance()
      out.push({ kind: 'byte', values: this.parseValueList(), line: tok.line, col: tok.col })
    } else {
      fail('expected an instruction, directive, or label', tok.line, tok.col)
    }
    this.expectLineEnd()
  }
}

class Symbols {
  labels = new Map<string, number>()
  equs = new Map<string, Expr>()

  defineLabel(name: string, value: number, line: number, col: number): void {
    if (this.labels.has(name) || this.equs.has(name)) fail(`duplicate symbol '${name}'`, line, col)
    this.labels.set(name, value)
  }

  defineEqu(name: string, value: Expr, line: number, col: number): void {
    if (this.labels.has(name) || this.equs.has(name)) fail(`duplicate symbol '${name}'`, line, col)
    this.equs.set(name, value)
  }

  eval(expr: Expr, visiting: string[] = []): number {
    switch (expr.kind) {
      case 'num':
        return expr.value
      case 'sym': {
        const label = this.labels.get(expr.name)
        if (label !== undefined) return label
        const equ = this.equs.get(expr.name)
        if (equ !== undefined) {
          if (visiting.includes(expr.name)) fail(`circular definition of '${expr.name}'`, expr.line, expr.col)
          visiting.push(expr.name)
          const v = this.eval(equ, visiting)
          visiting.pop()
          return v
        }
        fail(`undefined symbol '${expr.name}'`, expr.line, expr.col)
      }
      case 'neg':
        return -this.eval(expr.inner, visiting)
      case 'add':
        return this.eval(expr.lhs, visiting) + this.eval(expr.rhs, visiting)
      case 'sub':
        return this.eval(expr.lhs, visiting) - this.eval(expr.rhs, visiting)
    }
  }
}

export function assemble(source: string, isa: Isa = MSAP1): { ok: true; result: AsmResult } | { ok: false; error: AsmError } {
  try {
    const tokens = lex(source)
    const parser = new Parser(tokens)
    const stmts: Stmt[] = []
    while (parser.peek().kind !== 'eof') parser.parseLine(stmts)

    const symbols = new Symbols()
    let pc = 0
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'label':
          symbols.defineLabel(stmt.name, pc, stmt.line, stmt.col)
          break
        case 'instr': {
          const def = findInstruction(isa, stmt.mnemonic)
          if (!def) fail(`unknown ${isa.name} instruction '${stmt.mnemonic}'`, stmt.line, stmt.col)
          if (stmt.operands.length !== def.operands.length)
            fail(`${def.mnemonic} expects ${def.operands.length} operand(s), found ${stmt.operands.length}`, stmt.line, stmt.col)
          pc += instructionSize(isa, def)
          break
        }
        case 'org':
          pc = symbols.eval(stmt.addr)
          break
        case 'byte':
          pc += stmt.values.length
          break
        case 'word':
          pc += 2 * stmt.values.length
          break
        case 'equ':
          symbols.defineEqu(stmt.name, stmt.value, stmt.line, stmt.col)
          break
      }
    }

    const space = 1 << isa.addressBits
    const image: (number | null)[] = new Array(space).fill(null)
    const listing: AsmResult['listing'] = []

    const writeByte = (addr: number, value: number, line: number, col: number) => {
      if (addr < 0 || addr >= space) fail(`address ${addr} is outside the ${space}-byte address space`, line, col)
      if (image[addr] !== null) fail(`address 0x${addr.toString(16).toUpperCase()} is written more than once`, line, col)
      image[addr] = value & 0xff
    }

    pc = 0
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'label':
        case 'equ':
          break
        case 'instr': {
          const def = findInstruction(isa, stmt.mnemonic)!
          const bytes = [def.opcode]
          for (let i = 0; i < stmt.operands.length; i++) {
            const operand = stmt.operands[i]
            const slot = def.operands[i]
            if (operand.kind === 'immediate' && slot === 'address')
              fail(`${def.mnemonic} expects an address here, found an immediate`, operand.line, operand.col)
            if (operand.kind === 'address' && slot === 'immediate')
              fail(`${def.mnemonic} expects an immediate '#' operand here`, operand.line, operand.col)
            const value = symbols.eval(operand.expr)
            if (slot === 'address') {
              if (value < 0 || value >= space)
                fail(`address ${value} is outside the ${space}-byte address space`, operand.line, operand.col)
              bytes.push(value)
            } else {
              if (value < -128 || value > 255)
                fail(`immediate ${value} does not fit in a byte (-128..255)`, operand.line, operand.col)
              bytes.push(value & 0xff)
            }
          }
          while (bytes.length < 1 + isa.minOperandBytes) bytes.push(0)
          bytes.forEach((b, i) => writeByte(pc + i, b, stmt.line, stmt.col))
          listing.push({ address: pc, bytes, line: stmt.line })
          pc += bytes.length
          break
        }
        case 'org':
          pc = symbols.eval(stmt.addr)
          break
        case 'byte': {
          const bytes: number[] = []
          for (const expr of stmt.values) {
            const value = symbols.eval(expr)
            if (value < -128 || value > 255) fail(`value ${value} does not fit in a byte (-128..255)`, stmt.line, stmt.col)
            bytes.push(value & 0xff)
          }
          bytes.forEach((b, i) => writeByte(pc + i, b, stmt.line, stmt.col))
          listing.push({ address: pc, bytes, line: stmt.line })
          pc += bytes.length
          break
        }
        case 'word': {
          const bytes: number[] = []
          for (const expr of stmt.values) {
            const value = symbols.eval(expr)
            if (value < -32768 || value > 65535) fail(`value ${value} does not fit in a word`, stmt.line, stmt.col)
            bytes.push(value & 0xff, (value >> 8) & 0xff)
          }
          bytes.forEach((b, i) => writeByte(pc + i, b, stmt.line, stmt.col))
          listing.push({ address: pc, bytes, line: stmt.line })
          pc += bytes.length
          break
        }
      }
    }

    return { ok: true, result: { image, listing, labels: symbols.labels } }
  } catch (e) {
    if (e instanceof AsmFailure) return { ok: false, error: e.err }
    throw e
  }
}
