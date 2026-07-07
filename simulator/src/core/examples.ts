export interface ExampleProgram {
  name: string
  source: string
  expects: string
}

export const EXAMPLES: ExampleProgram[] = [
  {
    name: 'Fibonacci',
    expects: 'Streams the Fibonacci series to the display, restarts on overflow',
    source: `loop:   lda x
        add y
        sta x
        jc  reset
        out
        sus y
        jmp loop
reset:  lds #0, x
        lds #1, y
        jmp loop
x:      .byte 1
y:      .byte 0
`,
  },
  {
    name: 'Bounce',
    expects: 'Counts 0..255 and back down, forever',
    source: `up:     out
        add one
        jc  down
        jmp up
down:   sub one
        out
        jz  up
        jmp down
one:    .byte 1
`,
  },
  {
    name: 'Division',
    expects: '63 / 9: halts showing quotient 7',
    source: `loop:      lda dividend
           sub divisor
           jc  step
           oth quotient
step:      sta dividend
           ldi #1
           ads quotient
           jmp loop
quotient:  .byte 0
dividend:  .byte 63
divisor:   .byte 9
`,
  },
  {
    name: 'Multiplication',
    expects: '3 x 42: halts showing 126',
    source: `loop:    lda count
         sub one
         jc  step
         oth result
step:    sta count
         lda value
         ads result
         jmp loop
one:     .byte 1
result:  .byte 0
count:   .byte 3
value:   .byte 42
`,
  },
  {
    name: 'SquareRoot',
    expects: 'sqrt(81): halts showing 9',
    source: `loop:    lda input
         sub odd
         jc  step
         oth root
step:    sta input
         ldi #2
         ads odd
         ldi #1
         ads root
         jmp loop
odd:     .byte 1
root:    .byte 0
input:   .byte 81
`,
  },
  {
    name: 'Factorial',
    expects: '5!: halts showing 120',
    source: `start:    lda n
          sta counter
outer:    lda counter
          sub one
          jz  done
          sta counter
inner:    lda n
          sub one
          jc  next
          lda acc
          sta n
          lds #0, acc
          jmp outer
next:     sta n
          lda counter
          ads acc
          jmp inner
done:     oth n
one:      .byte 1
acc:      .byte 0
n:        .byte 5 ;input
counter:  .byte 0
`,
  },
  {
    name: 'NthRoot',
    expects: 'cube root of 125: halts showing 5',
    source: `mul:      lda mulcount
          sub mulone
          jc  mulstep
          ldi #0
          sub oddcount
          jz  initodds
          jmp root
mulstep:  sta mulcount
          lda mulvalue
          ads mulacc
          jmp mul
mulone:   .byte 1
mulacc:   .byte 0
mulcount: .byte 2
mulvalue: .byte 3 ;nth root to find
oddcount: .byte 0
initodds: lda mulacc
          sta oddcount
root:     lda input
          sub odd
          jc  rootstep
          oth result
rootstep: sta input
          ldi #1
          ads result
          lda mulacc
          ads odd
          lda oddcount
          sta mulcount
          lds #0, mulacc
          lds #1, mulvalue
          lda result
          ads mulvalue
          jmp mul
odd:      .byte 1
result:   .byte 0 ;result
input:    .byte 125 ;input
`,
  },
  {
    name: 'GCD',
    expects: 'gcd(48, 36): halts showing 12',
    source: `loop:  lda a
       sub b
       jz  done
       jc  abig
       lda b
       sub a
       sta b
       jmp loop
abig:  sta a
       jmp loop
done:  oth a
a:     .byte 48
b:     .byte 36
`,
  },
  {
    name: 'PowersOfTwo',
    expects: 'Doubles A: 2, 4, ... 128, halts showing 128',
    source: `loop:  lda x
       add x
       jc  done
       sta x
       out
       jmp loop
done:  oth x
x:     .byte 1
`,
  },
]
