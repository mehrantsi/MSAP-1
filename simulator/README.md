# MSAP-1 Simulator

A digital twin of MSAP-1 rev.B: a cycle-accurate simulation of the real machine driven by the same microcode that is burned into the control EEPROMs, wrapped in a 3D/2D bench view with a built-in assembler, debugger, logic analyzer, electrical model, and KiCad export. Its purpose is to be the workbench for settling MSAP-2 before touching hardware.

## Run

```
npm install
npm run dev        # open the printed URL
npm test           # headless core self-test (assembles and runs every example program)
npm run build      # type-check + production build
```

## What is simulated, and how faithfully

- **Microcode**: `src/core/microcode.ts` is a port of the `UCODE_TEMPLATE` from the 8-bit_CPU_uCodes repo, including the four flag-bank variants and the `eepromImages()` function that reproduces the exact 1024-byte images the Arduino programmer writes. The simulator executes from these tables, not from a re-implementation of the instruction set.
- **Fetch reuse**: the JK opcode latch is modeled directly - `fetch` mode masks the opcode to `0000` so the control ROM executes the fetch slot, and the `RST` control bit collapses asynchronously (consuming no T state), resets the microstep counter, and toggles the latch, exactly like the hardware.
- **IR toggle**: the first `II` in a phase latches the opcode from `bus[4..7]`, the second latches the operand, and the toggle resets at T0 - mirroring the counter/demux mechanism.
- **ALU and flags**: subtraction is `A + (B xor 0xFF) + 1` with CF meaning no-borrow, ZF latched only on `EOFI`, and conditional jumps read the flag-banked microcode like the real EEPROM address lines.
- **Electrical layer**: `src/core/parts.ts` carries datasheet figures per part (Icc, VIH/VIL, VOH/VOL, input impedance, output drive, tPD, Cpd) and `src/core/electrical.ts` estimates live current: chip quiescent + HC dynamic dissipation (Cpd x Vcc^2 x f) + per-LED drive current ((Vcc - Vf) / (Rseries + Rout)) with the 7-segment display multiplexed across four digits. This is a digital simulation with an engineering-grade electrical estimate - it is not an analog transient (SPICE) simulator.

## Using it

- **Panels**: every panel (Program, Inspector, Sniffer, Scope, PSU) is draggable by its header, collapsible, and closable; toggle them from the top bar. Positions persist in localStorage.
- **Program panel**: pick an example or write your own in the msap-asm syntax (labels, `#` immediates, `.byte`/`.org`/`.equ`, `;` comments). Assemble + load writes RAM. Labels double as breakpoint buttons.
- **Transport** (bottom): Reset keeps RAM (like the hardware reset), Step T is the mono-stable clock, Step instr runs to the next instruction boundary, Run is the astable clock with a 1 Hz - 50 kHz log slider. The signed/unsigned toggle is SW3.
- **Logic analyzer**: live digital waveforms of all control signals plus bus values, and a decoded instruction/T-state feed like the hardware debugger's OLED. Drag to pan back through the 2048-T capture, wheel or the window select to zoom, lane-height control for density, and a hover cursor that highlights the matching decoded instruction in the feed.
- **Oscilloscope**: arm a channel (CH1-CH4), then click any chip pin in the scene to attach a probe. Signals are synthesized with analog behavior - family-specific rise times, overshoot and ringing, and a noise floor - on a timebase where one T state is one clock period, so zooming the timebase down to 100 ns/div shows real edge shapes. Controls: time/div, V/div, per-channel vertical position, horizontal position, edge trigger (auto/normal/off, source, slope, level, with the part's VIH/VIL thresholds drawn), run/stop hold, and a Hann-windowed FFT of the visible window with peak-frequency readout. Drag on the graticule to pan, wheel to change the timebase. Hovering a chip shows each pin's signal name.
- **Bench PSU**: output on/off, 3-6 V supply with live V/A readouts, a current limit that trips like a real supply (reset from the panel), warnings for parts outside their supply range (the LS parts complain first, correctly), and LED brightness/logic levels that follow VCC.
- **Wires**: harness-routed connections with per-class toggles in the top bar - bus ribbons (amber), control harness (blue), clock distribution (cyan). Wires glow when their signals are active in the current control word, so you can watch data flow while single-stepping.
- **Inspector**: registers and control word (State), RAM hex grid with PC/MAR highlights, click-to-toggle breakpoints and live disassembly (RAM), per-module current table (Power), and per-chip datasheet details - click any chip body (Chip).
- **View**: 3D/2D toggle in the top bar; zoom, fit, and orbit/pan drag-mode buttons bottom right.

## Exports

- **KiCad netlist** (`msap1.net`): components with correct DIP/TO footprints, plus VCC/GND for every chip and the bus/control/clock nets that are declared in the module registry. Import into pcbnew via File > Import Netlist.
- **KiCad PCB**: a single consolidated board - all components flow-packed into module-grouped rows with silkscreen region labels, net assignments, and a computed outline, unrouted, as a layout starting point. Two variants: through-hole (DIP/TO footprints) or SMD (SOIC/SOT/TO-263 equivalents).
- **Block SVG**: a printable module block diagram generated from the registry.

The netlist is a connectivity skeleton, not a transcription of the rev.B schematics (those live in `../Schematics` as the source of truth). Its value is that it is generated from the same registry the simulator runs on, so when you add MSAP-2 modules the export follows automatically.

## Modifying the machine

The **Schematic panel** (top bar > Schematic) draws the selected board as a KiCad-style schematic: chip and passive symbols with pin numbers and net-label flags colored by class (bus amber, control blue, clock cyan, power red/grey, custom green). Solid flags are declared wiring, dashed flags are derived from the simulation's signal model, and the base discrete wiring (555 timing network, debounce RCs, the RAM write-pulse chain, LED resistor networks, opcode pull-downs) is declared as an editable approximation of rev.B. The **Wires** toggle draws the actual same-net connections as routed curves (power stays label-only, KiCad style) and the **Wide** toggle switches to a four-column sheet in a wider panel. The schematic is a full design surface: add chips from the catalog and parts (resistors, caps, networks, pots, switches, single LEDs and 10-LED bars with color choice) to any board, create or remove boards, drag symbols to rearrange the sheet (positions persist; "auto place" restores), zoom with the +/- buttons, select a symbol to remove custom parts, and reset the whole design to stock rev.B - The panel window itself maximizes to full screen via the header button, and remembers per board whether wires are drawn, the zoom level, your symbol positions, and the maximized state across sessions. Click any pin to select it - its net highlights across the sheet and every member pin on that net (machine-wide) lists below, each clickable to jump boards. The editor row rewires the selected pin: type an existing or new net and Connect, NC marks a no-connect, and the revert arrow restores the base rev.B wiring. Clicking a chip pin in the 3D scene selects the same pin here. All edits flow through the same design layer as the Designer, so they land in the netlist, PCB exports, and inspector.

The schematic replaced the earlier Designer panel: selecting a chip symbol offers a part-swap dropdown (pin-compatible swaps keep their probe signals), the harness strip below the sheet adds/removes board-level bus/control/clock ribbons including the base ones (removable and restorable), passive values are edited in the inspector's Part tab, and everything persists in the browser with a one-click reset to stock rev.B.

For everything else, the registry in `src/core/modules.ts` is the source - there is no hand-placed scenery. Common changes:

- **Add a chip to an existing board**: append `{ ref: 'U60', part: '74HC161' }` to that module's `chips` array. It appears on the board (auto-packed with pins), in the power estimate, in the chip inspector, and in both KiCad exports. If the part is new, add it to `src/core/parts.ts` with its datasheet values (package, pins, Icc, thresholds, supply range) - that single entry drives the 3D size, the electrical model, the inspector card, and the PCB footprint.
- **Make pins probeable**: give the chip a `signals` map from pin number to `{ label, sample }`, where `sample` reads a `TraceEntry` (bus, registers, control word, step, flags...). The helpers at the top of `modules.ts` (`regQ`, `counterQ`, `busPins`, `ctl`, `bit`) cover the common shapes. Pins without a mapping still render and show "no signal model" on the scope.
- **Add passives**: append to the module's `passives` array with `kind: 'res' | 'cap' | 'rnet' | 'pot' | 'led' | 'switch'` and a value string. They render true to form and show a hover tooltip.
- **Add a whole new board**: add a `ModuleDef` with a free `position` slot and a `size` large enough for its parts, then wire it visually by adding entries to `CONNECTIONS` (kind `bus`/`ctl`/`clk`, plus an `activeMask` so the wire glows at the right time).
- **Declare nets for export**: entries in a chip's `pins` map (`{ '19': 'CTL_OE_1' }`) become netlist nodes and PCB pad nets; VCC/GND are added automatically from the part spec.

## Adding an MSAP-2 module

Four touch points, all data-driven:

1. `src/core/signals.ts` - add new control signal bits (the word is a plain number; widen past 16 bits freely).
2. `src/core/microcode.ts` - extend the template with the new instructions' steps.
3. `src/core/machine.ts` - add the module's state and its latch/drive behavior in `tick()`.
4. `src/core/modules.ts` - declare the board as above.

New instructions also need a line in `src/core/isa.ts` (and its Rust twin `8-bit_CPU_Programmer/assembler/src/isa.rs`) so the assembler and disassembler know them.

The 6116's A8-A10 are tied off in hardware and the RAM model is already 2KB-capable, so the MSAP-2 MMU can be introduced by driving those lines from a new module without touching the RAM model.

## Tests

`npm test` bundles `src/core/selftest.ts` with esbuild and runs it in node: every bundled example (the seven originals plus GCD and PowersOfTwo) is assembled with the built-in assembler and executed on the machine core, asserting halted outputs (63/9=7, 3x42=126, sqrt(81)=9, 5!=120, cbrt(125)=5, gcd(48,36)=12, 2^n to 128) and streamed sequences (Fibonacci, Bounce), plus EEPROM image generation, breakpoint, and trace behavior.
