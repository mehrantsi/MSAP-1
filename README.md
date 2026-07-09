# MSAP-1 (Mehran's Simple as Possible) rev.B

An 8-bit discrete-logic CPU on breadboards - SAP-1 architecture, mainly inspired by Ben Eater's implementation, and the predecessor of [MSAP-2](https://github.com/mehrantsi/MSAP-2). It is built, running, and fully mirrored by a cycle-accurate simulator.

| Aspect | Description |
|---|---|
| Datapath | A and B registers (74HC173), 8-bit program counter, adder/subtractor ALU (74LS283 + 74HC86 two's complement) |
| Control | 2x AT28C16 microcode EEPROMs, 12-bit instruction register (4-bit opcode + 8-bit operand), JK-latched fetch reuse, flag-banked conditional jumps (CF/ZF) |
| Memory | 256 bytes of HM6116P SRAM with programmer/bus input multiplexing |
| I/O | 4-digit multiplexed 7-segment display with signed/unsigned mode, EEPROM segment decode |
| Clock | LM555 astable + mono/bi-stable switches, Schmitt-trigger debounce |
| Power | < 300 mA with all LEDs on (CMOS parts, high-efficiency LEDs) |
| Programming | [SD-card programmer](https://github.com/mehrantsi/8-bit_CPU_Programmer) + `msap-asm` assembler, [hardware debugger](https://github.com/mehrantsi/8-bit_CPU_Debugger), [microcode](https://github.com/mehrantsi/8-bit_CPU_uCodes) |

Notable differences from the classic SAP-1 build: latched instruction register that reuses the fetch microcode, automated RAM programming, Schmitt-trigger switch debouncing instead of SR latches, lower chip count and power, and noise management that allows faster clock speeds.

## Layout

- **[simulator/](simulator)** - the digital twin: executes the real microcode EEPROM images cycle-accurately in a 3D/2D bench view, with a built-in assembler, breakpoints, logic analyzer, oscilloscope, per-part electrical model, microcode editor, and KiCad netlist/PCB/schematic export. `npm run dev` to run, `npm test` for the headless self-test that executes every sample program.
- **[Schematics/](Schematics)** - the hand-captured rev.B KiCad project (source of truth for the hardware) with per-module walkthroughs and PNGs. See its README.

Sample programs (Bounce, Division, Multiplication, Fibonacci, SquareRoot, NthRoot, Factorial) live in the [programmer repo](https://github.com/mehrantsi/8-bit_CPU_Programmer/tree/main/Examples).

## Status

rev.B is complete and running on breadboards. The simulator is verified against it (headless self-test runs all sample programs on the real microcode images). Its successor, [MSAP-2](https://github.com/mehrantsi/MSAP-2), grew out of this workbench: microcoded 8-bit opcodes, 8KB memory, interrupts, stack, terminal, disk, and the [MOS operating system](https://github.com/mehrantsi/MOS-1).
