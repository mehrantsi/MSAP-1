import { useMemo, useState } from 'react'
import { findByOpcode } from '../core/isa'
import { buildControlRom, eepromImages } from '../core/microcode'
import { downloadText } from '../export/download'
import { currentMachine } from '../machines'
import { activeIsa, useSim } from '../state/store'

const OPERAND_SHAPES: { id: string; label: string; operands: ('address' | 'immediate')[] }[] = [
  { id: 'none', label: 'no operand', operands: [] },
  { id: 'addr', label: '$address', operands: ['address'] },
  { id: 'imm', label: '#immediate', operands: ['immediate'] },
  { id: 'imm-addr', label: '#imm, $addr', operands: ['immediate', 'address'] },
]

function isaFileText(isa: ReturnType<typeof activeIsa>): string {
  const lines = [`name ${isa.name}`, `addressbits ${isa.addressBits}`, `minoperandbytes ${isa.minOperandBytes}`]
  for (const def of isa.instructions) {
    const ops = def.operands.length === 0 ? '-' : def.operands.join(',')
    lines.push(`${def.mnemonic} 0x${def.opcode.toString(16).toUpperCase().padStart(2, '0')} ${ops}`)
  }
  return lines.join('\n') + '\n'
}

function downloadBinary(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes.slice().buffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function MicrocodePanel() {
  const microcode = useSim((s) => s.microcode)
  const setMicrocodeWord = useSim((s) => s.setMicrocodeWord)
  const resetMicrocode = useSim((s) => s.resetMicrocode)
  const runMicrocodeTests = useSim((s) => s.runMicrocodeTests)
  const microTests = useSim((s) => s.microTests)
  const snap = useSim((s) => s.snap)
  const isaEdits = useSim((s) => s.isaEdits)
  const setIsaEdit = useSim((s) => s.setIsaEdit)

  const definition = currentMachine()
  const isa = activeIsa()
  const signals = definition.signals
  const steps = definition.microcode.steps
  const stock = useMemo(() => definition.microcode.stockTemplate(), [definition])

  const [sel, setSel] = useState<{ op: number; step: number } | null>(null)
  const [opSel, setOpSel] = useState<number | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [shapeDraft, setShapeDraft] = useState('addr')

  const opLabel = (op: number): string => {
    if (op === 0) return 'FETCH'
    return findByOpcode(isa, op)?.mnemonic ?? op.toString(2).padStart(4, '0')
  }

  const pickOp = (op: number) => {
    if (op === 0) return
    if (opSel === op) {
      setOpSel(null)
      return
    }
    setOpSel(op)
    const def = findByOpcode(isa, op)
    setNameDraft(def?.mnemonic ?? '')
    const shape = OPERAND_SHAPES.find(
      (s) => JSON.stringify(s.operands) === JSON.stringify(def?.operands ?? ['address']),
    )
    setShapeDraft(shape?.id ?? 'addr')
  }

  const liveOp = snap.halted ? -1 : snap.fetch ? 0 : snap.irOpcode
  const liveStep = snap.step

  const signalNames = (word: number): string[] =>
    signals.filter((sig) => (word & sig.bit) !== 0).map((sig) => sig.name)

  const selWord = sel ? microcode[sel.op][sel.step] : 0

  const exportEeprom = () => {
    const { hi, lo } = eepromImages(buildControlRom(microcode))
    downloadBinary('msap1-ucode-hi.bin', hi)
    downloadBinary('msap1-ucode-lo.bin', lo)
  }

  const exportJson = () => {
    downloadText('msap1-microcode.json', JSON.stringify(microcode), 'application/json')
  }

  return (
    <div className="microcode">
      <div className="designer-row">
        <button className="primary" onClick={runMicrocodeTests} title="Assemble and run every example program on the current microcode">
          Run examples
        </button>
        <button onClick={exportEeprom} title="Download the two 1KB EEPROM images your Arduino programmer burns">
          Export EEPROM .bin
        </button>
        <button onClick={exportJson}>Export .json</button>
        <button onClick={() => downloadText('custom.isa', isaFileText(isa))} title="ISA file for msap-asm --isa-file">
          Export .isa
        </button>
        <button
          className="danger"
          onClick={() => {
            if (window.confirm('Discard microcode edits and restore the stock rev.B microcode?')) resetMicrocode()
          }}
        >
          Stock
        </button>
      </div>

      {microTests && (
        <div className="micro-tests">
          {microTests.map((t) => (
            <span key={t.name} className={t.pass ? 'micro-test pass' : 'micro-test fail'}>
              {t.pass ? '✓' : '✗'} {t.name}
              {!t.pass && ` (got ${t.actual === null ? 'no halt' : t.actual}, want ${t.expected})`}
            </span>
          ))}
        </div>
      )}

      <div className="micro-grid-wrap">
        <table className="micro-grid">
          <thead>
            <tr>
              <th></th>
              {Array.from({ length: steps }, (_, i) => (
                <th key={i}>T{i}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {microcode.map((row, op) => (
              <tr key={op}>
                <td className="micro-op">
                  <button
                    className={opSel === op ? 'micro-op-btn sel' : 'micro-op-btn'}
                    onClick={() => pickOp(op)}
                    title={op === 0 ? 'Fetch slot (fixed)' : 'Rename or define this opcode'}
                  >
                    {opLabel(op)}
                  </button>
                </td>
                {row.map((word, step) => {
                  const isSel = sel?.op === op && sel.step === step
                  const isLive = liveOp === op && liveStep === step
                  const modified = stock[op][step] !== word
                  const names = signalNames(word)
                  const classes = ['micro-cell']
                  if (isSel) classes.push('sel')
                  if (isLive) classes.push('live')
                  if (modified) classes.push('modified')
                  return (
                    <td key={step}>
                      <button className={classes.join(' ')} onClick={() => setSel(isSel ? null : { op, step })}>
                        {names.length === 0 ? '·' : names.join(' ')}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {opSel !== null && (
        <div className="schematic-editor">
          <span className="sch-sel-badge">opcode {opSel.toString(2).padStart(4, '0')}</span>
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 6))}
            placeholder="mnemonic"
            aria-label="Mnemonic"
          />
          <select value={shapeDraft} onChange={(e) => setShapeDraft(e.target.value)} aria-label="Operand shape">
            {OPERAND_SHAPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            className="primary"
            onClick={() => {
              if (!nameDraft.trim()) return
              const clash = isa.instructions.some((d) => d.mnemonic === nameDraft && d.opcode >> 4 !== opSel)
              if (clash) {
                window.alert(`Mnemonic ${nameDraft} is already used by another opcode.`)
                return
              }
              setIsaEdit(opSel, {
                mnemonic: nameDraft,
                operands: OPERAND_SHAPES.find((s) => s.id === shapeDraft)!.operands,
              })
              setOpSel(null)
            }}
          >
            Apply
          </button>
          {isaEdits[opSel] && (
            <button
              onClick={() => {
                setIsaEdit(opSel, null)
                setOpSel(null)
              }}
              title="Revert to stock name"
            >
              ↺
            </button>
          )}
        </div>
      )}

      {sel && (
        <div className="micro-editor">
          <span className="sch-sel-badge">
            {opLabel(sel.op)} T{sel.step} · 0x{selWord.toString(16).toUpperCase().padStart(4, '0')}
            {stock[sel.op][sel.step] !== selWord ? ' (modified)' : ''}
          </span>
          <div className="signal-grid micro-signals">
            {signals.map((sig) => {
              const on = (selWord & sig.bit) !== 0
              return (
                <button
                  key={sig.name}
                  className={on ? 'sig on' : 'sig'}
                  title={sig.description}
                  onClick={() => setMicrocodeWord(sel.op, sel.step, selWord ^ sig.bit)}
                >
                  {sig.name}
                </button>
              )
            })}
          </div>
          {stock[sel.op][sel.step] !== selWord && (
            <button onClick={() => setMicrocodeWord(sel.op, sel.step, stock[sel.op][sel.step])} title="Restore this word to stock">
              ↺ word
            </button>
          )}
        </div>
      )}

      <div className="prop-note">
        The machine runs on this table live; the glowing cell is the executing microstep. JC/JZ flag-bank patches apply
        automatically on top. Edits persist in this browser.
      </div>
    </div>
  )
}
