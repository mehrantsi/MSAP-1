# MSAP-1 rev.B

## Overview

This project is an 8-bit discrete CPU based on SAP-1 architecture and mainly inspired by Ben Eater's implementation of it. The main differences in this design is as follows:

1. Using Schmitt Trigger Inverters instead of SR Latches that was creating some issues in certain situations.
2. 8-bit Porgram Counter.
3. 256 bytes of RAM.
4. 12-bit Instructions Register.
5. Latching mechanism for Instructions Register to enable reusing the Fetch flow in [uCodes](https://github.com/mehrantsi/8-bit_CPU_uCodes).
6. [Enabling automated RAM input for programming](https://github.com/mehrantsi/8-bit_CPU_Programmer)
7. Lower power consumption achieved by using CMOS chips instead of Low-Power Schottky, higher efficiency LEDs as well as using lower chip count in total, enabled by different debouncing circuit and non-inverting RAM. (200 mA including the programmer and all LEDs on)
8. Better noise management, allowing clock speeds of more than 1khz.

MSAP-2 will include:

1. MMU to enable RAM segmentation and support up to 2KB of RAM
2. More control signals by multiplexing the signals that are never enabled together
3. Better ALU with more advanceds operations
4. Interrupts
5. Stacks

## Clock Module

Main oscillator of the clock module is LM555 and it can be controlled with R1 potentiometer. The clock module contains two switches to enable bi-stable and mono-stable modes. The switches are debounced via 100K-10nF RC circuit connected to an input of U2, which is an Inverting Schmitt Trigger, enabling better noise control over the clock signal in faster clock speeds due to a possible higher mean time between bounces for mono-stable switch (SW2) for synchronously coupled chips, such as cascaded CMOS binary counters that rely on clean, corectly timed inputs. Failure to correctly debounce this switch causes all sort of unpredictable behaviors.

![CLK](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/Clock.PNG)

## Program Counter

This module contains two cascaded 4-bit, presettable binary counters (74HC161), creating an 8-bit binary counter.

![PC](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/Program%20Counter.PNG)

## General Purpose Registers (A and B)

These are two 8-bit registers, each created with two 4 bit D flip-flops (74HC173).

![A](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/A-Register.PNG)

![B](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/B-Register.PNG)

## ALU

This module contains two 4-bit full adders (74LS283) and two quad XORs (74HC86) to create 2's complement of second operand (coming from B register) to enable subtraction. This means that this module can add andsubtract two 8-bit numbers.

![ALU](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/ALU.PNG)

## RAM Module

This module contains an 8-bit register for the memory address, an HM6116P 2KB RAM with non-inverting I/O and circuitry for multiplexing data and address input from either the bus or programmer.
Theere are two discrete transistors in this module. Q1 is a NPN BJT transistor creating a buffer circuit to minimize the clock signal distortion caused by the RC circuit that is used for creating a pulse signal to synchronize RAM input. Q2 is a P-channel MOSFET used to disconnect power from the RAM input multiplexers to avoid them sinking current from RAM I/O pins, since 74LS/HC157 doesn't have a high impedence mode. Note that because I wanted to avoid using a MSOFET for each I/O pin, this circuit only works if U43 and U43 are Low-Power Schottky series and not CMOS, since CMOS chips will still be powered via their ESD protection diodes on their input pins.

![RAM](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/RAM.PNG)

## Instructions Register

This module contains a 4-bit register for OpCode and an 8-bit register for Operand. It works in such a way that it toggles between OpCode and Operand registers every time the II control signal is enabled and only enables the OpCode register output after a fetch cycle is done to next time that RST signal is enabled. The toggle mechanism is achieved by a 4 bit- presettable counter and a demultiplexer which keeps the IE pins high in between. The latching mechanism is achieved by a JK flip-flop that enables reusing fetch operation in uCodes.

![IR](https://github.com/mehrantsi/MSAP-1/blob/main/Schematics/PNGs/Instructions%20Register.PNG)
