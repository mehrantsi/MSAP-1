# MSAP-1 (Mehran's Simple as Possible) rev.B

## Overview

This project is an 8-bit discrete CPU based on original SAP-1 architecture and mainly inspired by Ben Eater's implementation of it. The main differences in this design are as follows:

1. Using Schmitt Trigger Inverters instead of SR Latches for clock module switch debouncing, that was creating some issues in certain situations.
2. 8-bit Porgram Counter.
3. 256 bytes of RAM.
4. 12-bit Instructions Register.
5. Latching mechanism for Instructions Register to enable reusing the Fetch flow in [MSAP-1 uCodes](https://github.com/mehrantsi/8-bit_CPU_uCodes).
6. Enabling [automated RAM input for programming](https://github.com/mehrantsi/8-bit_CPU_Programmer)
7. Lower power consumption achieved by using CMOS chips instead of Low-Power Schottky, higher efficiency LEDs as well as using lower chip count in total, enabled by different debouncing circuit and non-inverting RAM. (<300 mA including the programmer and all LEDs on)
8. Better noise management, allowing faster clock speeds.

MSAP-2 will include:

1. MMU to enable RAM segmentation and support for up to 2KB of RAM
2. More control signals by multiplexing the signals that are never enabled together
3. Better ALU, supporting more operations
4. Interrupt support
5. Stack support

![MSAP1](https://github.com/mehrantsi/MSAP-1/blob/main/IMG_0575.jpeg)

## Clock Module

Main oscillator of the clock module is an LM555 chip and it can be controlled with R1 potentiometer. The clock module contains two switches to enable bi-stable and mono-stable modes. The switches are debounced via 100K-10nF RC circuit connected to an input of U2, which is an Inverting Schmitt Trigger, providing better noise control over the clock signal in faster clock speeds due to a possible higher mean time between bounces for mono-stable switch (SW2) for synchronously coupled chips, such as cascaded CMOS binary counters that rely on clean, corectly timed inputs. Failure to correctly debounce this switch causes all sorts of unpredictable behaviors.

![CLK](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/Clock.PNG)

## Program Counter

This module contains two cascaded 4-bit, presettable binary counters (74HC161), creating an 8-bit binary counter.

![PC](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/Program%20Counter.PNG)

## General Purpose Registers (A and B)

These are two 8-bit registers, each created with two 4 bit D flip-flops (74HC173).

![A](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/A-Register.PNG)

![B](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/B-Register.PNG)

## ALU

This module contains two 4-bit full adders (74LS283) and two quad XORs (74HC86) to create 2's complement of second operand (coming from B register) to enable subtraction. This means that this module can add and subtract two 8-bit numbers.

![ALU](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/ALU.PNG)

## RAM Module

This module contains two 4-bit register for the memory address, an HM6116P 2KB S-RAM with non-inverting I/O and circuitry for multiplexing data and address input from either the bus or the programmer.
There are two discrete transistors in this module. Q1 is an NPN BJT transistor creating a buffer circuit to minimize the clock signal distortion caused by the RC circuit that is used for creating a pulse signal to synchronize RAM input. Q2 is a P-channel MOSFET used to disconnect power from the RAM input multiplexers to avoid them sinking current from RAM I/O pins, because 74LS/HC157 doesn't have a high impedence mode. Note that since I wanted to avoid using a MSOFET for each I/O pin, this circuit only works if U42 and U43 are Low-Power Schottky series and not CMOS, since CMOS chips will still be powered via their ESD protection diodes on their pins.

This module also contains a switch that allows selection between program or run mode. In the program mode, the RAM input is connected to the [CPU programmer](https://github.com/mehrantsi/8-bit_CPU_Programmer) interface and in the run mode, it's connected to the bus.
There are two output signals here that are used by the programmer. One is the active-low MNW signal (Manual Write) and the other is active-high PM signal (Program Mode)

![RAM](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/RAM.PNG)

## Instructions Register

This module contains a 4-bit register for OpCode and an 8-bit register for Operand. It works in such a way that it toggles between OpCode and Operand registers every time the II control signal is enabled and only enables the OpCode register output after a fetch cycle is done, until the next time that asynchronous RST signal is enabled. The toggle mechanism is achieved by a 4 bit presettable counter and a demultiplexer which keeps the IE pins high in between. The latching mechanism is achieved by a JK flip-flop that enables reusing fetch operation in uCodes.
The input signal T0 which is active-low, is connected to the Control Logic's u-instruction step decoder chip, indicating step 0. This signal resets the toggle mechanism by resetting the 4-bit counter.

![IR](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/Instructions%20Register.PNG)

## Control Logic

This module contains a u-instruction step counter, created by a 4-bit counter and a 3 to 8 line demultiplexer which is connected to two 2Kx8-bit AT28C16 EEPROMs that contains the uCodes and two quad inverters to create the active-low signals. This is to keep the output of EEPROMs always active-high, regardless of the control signal.

![CL](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/Control%20Logic.PNG)

## Output Display and Register

This module contains an 8 bit register to store the output value, a 555 timer that with a dual JK flip-flp and a decoder, form a multiplexer for 4 seven segment displays. an AT28C16 EEPROM is used to store [Binary to 7-segment decoding logic](https://github.com/mehrantsi/Mux7-Segment). It also contains a switch (SW3) which allows switching between signed and unsigned presentation of the output.

![OD](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/Output%20Register%20and%20Display.PNG)

## Flags Register

This module contains a 4 bit D flip-flop to keep flags that can be used for conditional jumps in u-instructions and circuitry to check for zero sum out from ALU. currently it keeps carry flag (CF) and zero flag (ZF). The output of the register is connected to address lines of control logic EEPROMs, so the instructions executed for JC and JZ OpCodes changes.

![FR](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/Flags%20Register.PNG)

## Reset Circuit

This is a simple circuitry to rest all the modules by generating both active-low and active-high signals that are required to asynchronously reset the flip-flops and counters. It also used to generate the active-low, RSTSTP signal that is used to reset the u-instruction step counter as well as resetting the JK flip-flop that is used for latching the OpCodes in instructions register.

![RC](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/Reset%20Circuit.PNG)
