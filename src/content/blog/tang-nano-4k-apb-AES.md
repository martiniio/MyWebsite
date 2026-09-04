---
title: "Bridging an 8-bit AES Core to a Cortex-M3"
pubDate: 2026-09-03
tags: [fpga, vhdl, aes, cryptography, embedded, tang-nano]
description:: "Integrating a low-area open-source AES128 core ont a Tang Nano 4K, bridging it to a Cortex-M3 over APB, and the eight very real bugs that stood between 'it compiles' and '10/10 test vectors pass on real silicon'. "
---

# Bridging an 8-bit AES Core to a Cortex-M3

## 1. The Idea -- why encrypt in hardware, and why now

 <figure>
  <img
    src="/tang-nano-4k-apb-aes/initial.png"
    alt="Tang Nano 4k"
    width="100%"
  />
</figure>


Every time you load a webpage over HTTPS, unlock your phone, or send a message that isn't plaintext gossip for anyone with a packet sniffer, symmetric encryption is doing the actual heavy lifting underneath. Public-key cryptography gets the spotlight -- key exchange, signatures, the leegant math -- but it's to slow to encrypt the *bulk* of your data. So almost every secure channel does a handshake with something like RSA or ECDH, agrees on a shared secret, and then hands the real work to a smmetric cipher. Almost always, that cipher is AES.

AES - the Advanced Encryption Standart - won a public, multi-year NIST competition in 2001 against a field of serious competitors, and two and a half decades later it's still the default.

Here's the part that's les obvious if you ever called `AES.encrypt()` in software: *how* you implement AES matters almost as much as the algorithm itself, especially once you leave a general-purpose CPU. A software AES call on your laptop borrows a CPU core, some cache, and finishes in microseconds -- nobody cares about the joules. But push AES into a embedded context -- a sensor node, a smart card, a CAN-bus module, anything battery-powered or are constrained -- and suddently the *implementation* is the whole story: how many lgic cells does it cost, how many clock cycles per block, how much power per encryption.

That's the itch this project scratches. Not "does AES work" -- thats settled -- but "what does it actually take to get AES running as a dedicated hardware block, talking to a real microcontroller, on a genuinely tiny FPGA?" The honest answer turned out to be: a surpisingly small core, ans a much bigger bridge that I expected.

## 2. AES-128 in theory -- four operations you'lll see everywhere below


AES-128 encrypts a 128-bit block under a 128-bit key across 10 rounds. Every round applies the same four transformations, in this order:
- **SubBytes**: a fixed, nolinear byte substitution. Every byte of the state gets swapped for another byte via lookup defined by inversion in GF(2⁸) composed with an affine transform. This is the only nonlinear step in the whole cipher, and it's the step almost every harware implementation lives or dies by, because a naive 256-entry lookup table is expensive in area -- more on that in a moment.

- **ShiftRows** — a simple, cheap, *linear* byte-position permutation. Row *n* of the 4×4 state matrix gets cyclically shifted left by *n* bytes. Free in hardware, basically just wiring.

- **MixColumns** — a matrix multiplication over GF(2⁸) applied independently to each column of the state. This is what gives AES its diffusion — a single changed input bit spreads across the whole block within a couple of rounds.

- **AddRoundKey** — a bitwise XOR of the state with a round key, one of 11 keys derived from the original 128-bit key via the key schedule (key expansion).
 <figure>
  <img
    src="/tang-nano-4k-apb-aes/Aes_operations.png"
    alt="Tang Nano 4k"
    width="70%"
  />
  <figcaption><em>Figure 1 — AES round operations. THe indeces show how State is permuted during ShiftRows. After the AddRoundKey the indeces are reallocated (no permutations is performed)</em></figcaption>
</figure>

Ten rounds of this cycle (with MixCollumns dropped in the final round) is the entire cypher. Conceptually simple. The interesting engineering question -- the one this project is really about -- is: what does "do SubBytes" actually cost when you cant just write `sbox[byte]` and let a CPU's memory hierarchy handle it for you?


## 3. From algorithm to silicon — there is no single "AES in hardware"

This is the part that surprised me most going in: there isn't one canonical way to build AES in an FPGA. There's a whole design space, and where you land on it depends entirely on what you're optimizing for.

At one end: **fully parallel, pipelined datapaths** -- the entire 128-bit state is processed at once, rounds pipelined so a new block can start every cycle. Blazing throughtput, but the SubBytes step alone needs 16 parallel S-boxes, and a naive S-box implementation (a 256-entry lookup table) multiplied by 16 gets expensive fast -- thousands of logic cells before you've even reached MixCollumns.

At the other end: **bit- or byte-serial datapths** -- process the state one byte (or even fewer bits) at a time, reuse the same small S-box logic sequentially across all 16 bytes. Dramatically smaller area, dramatically more cycles per block. For a chip that will spend most of its idle waiting for the next packet, and where board space (and power) is the scarce resource, that trade is usually the right one.

THe device I was targeting -- a Tang Nano 4K's GW1NSR-4C -- has **4608 LUT4 cells total**, shared with everything else on the chip design (Cortex-M3 support logic, APB fabric, UART, whatever lives alongside it). That number alone rules out most "reference" AES open-cores you'll find on Github before you've written a line of your own code -- which is exactly what happened.


## 4. Choosing a core — and rejecting two others on the way
 
The instinct is to grab the first open-source AES-128 core that compiles and move on. I tried that, and the numbers said no, twice, before I found one that fit:
 
| Core | Measured/published footprint | Fit on GW1NSR-4C (4,608 LUT4)? |
|---|---|---|
| Homer Hsing's AES (OpenCores) | 3,536 LUT (encrypt-only) | Yes -- very close to limit, |
| secworks/aes | ~5,497 LEs (encrypt-only) | No — exceeds the entire chip alone |
| **8-bit datapath (selected)** | **313 LUT** | Yes — roughly 7% of the chip |


The core that actually fit — [`ChengluJin/8bit_datapath_AES`](https://github.com/ChengluJin/8bit_datapath_AES), MIT licensed, based on Hämäläinen et al.'s DSD 2006 low-area AES design — earns its tiny footprint with two decisions: an **8-bit-wide serial datapath** (one byte through the round logic per relevant cycle, not sixteen in parallel), and **Canright's minimal-area GF(2⁸) construction** for the S-box (2004) — computing the S-box via composite-field arithmetic instead of a lookup table, trading combinational logic depth for zero BSRAM usage. Measured footprint: 313 LUT / 316 registers isolated, 420 LUT / 324 registers once wired into the real bridge with real data flowing through it.

## 5. What the core actually exposes — and why that's a problem
 
Here's the catch with picking the smallest core available: it earns that size by doing *nothing* except the cipher itself. No register-mapped interface. No handshake. No concept of "here's a whole 128-bit block, go." It understands exactly one contract: hold reset, then feed it precisely one byte on `key_in` and one byte on `d_in` per clock, for 16 clocks straight, no pauses allowed, and then it starts processing on its own timeline.
 
Everything a piece of software actually wants — *write a key, write some plaintext, hit start, poll until done, read back the ciphertext* — does not exist on the core side. It has to be built, entirely, by something sitting between the core and the software. That something is the bridge, and it turned out to be a genuinely bigger design problem than the cipher itself.
 
Three more quirks made the bridge non-optional rather than a nice-to-have wrapper:
 
- `d_out` streams continuously and `d_vld` never clears once it first asserts — there's no "output ready, now go get it" window, you have to know in advance exactly how many cycles of valid output to capture and when they start.
- The core never returns to an idle state on its own. Once it starts a round sequence, it loops through rounds indefinitely; getting it back to a ready state for the *next* encryption requires an external reset, every single time, with no exceptions.
- None of this is documented anywhere in the core's own repository — footprint, timing window, and reset behavior were all things I had to establish myself, through simulation and then hardware measurement, before writing a single line of bridge logic.
## 6. Designing the bridge — a genuine protocol translator

 <figure>
  <img
    src="/tang-nano-4k-apb-aes/aes_bridge.png"
    alt="Tang Nano 4k"
    width="60%"
  />
  <figcaption><em>Figure 2 — Bridge block model.</em></figcaption>
</figure>

 
The bridge's job, stated plainly: take five APB registers and a two-bit status word on one side, and produce sixteen individually-timed byte transactions with a mandatory reset cycle between every use, on the other. That asymmetry is the whole design problem.

```vhdl
-- aes_bridge.vhd
-- Author S.Martini
--
-- Bridges the 8-bit datapath aes_8_bit core (Verilog) onto the APB
-- register bank. All timing decisions here are based on DIRECT SIMULATION
-- of the core (Icarus Verilog, classic AES-128 test vector), not
-- assumption:
--   - 16-cycle load phase, one byte per clock, MSB-first (matches the
--     core's own testbench convention)
--   - d_vld first asserts and the FIRST valid ciphertext byte both
--     appear on the SAME clock edge
--   - exactly 16 consecutive cycles from that edge carry valid output
--     bytes; d_vld never clears on its own and everything after byte #15
--     is garbage -- confirmed by running the core past that point
--   - the core never returns to its ready state by itself; it must be
--     re-reset (rst asserted, active-HIGH) before the next operation

LIBRARY ieee;
USE ieee.std_logic_1164.all;
USE ieee.numeric_std.all;

entity aes_bridge is
    port(
        clk, rstn : in std_logic;  -- system clock/reset (active-low)

        -- From regbank_outputs (MCU-writable, RW range 0x80-0xFC)
        ctrl_reg   : in std_logic_vector(31 downto 0); -- bit0=START
        key_word0  : in std_logic_vector(31 downto 0); -- key[127:96]
        key_word1  : in std_logic_vector(31 downto 0); -- key[95:64]
        key_word2  : in std_logic_vector(31 downto 0); -- key[63:32]
        key_word3  : in std_logic_vector(31 downto 0); -- key[31:0]
        data_word0 : in std_logic_vector(31 downto 0); -- plaintext[127:96]
        data_word1 : in std_logic_vector(31 downto 0); -- plaintext[95:64]
        data_word2 : in std_logic_vector(31 downto 0); -- plaintext[63:32]
        data_word3 : in std_logic_vector(31 downto 0); -- plaintext[31:0]

        -- To regbank_inputs (MCU-readable, RO range 0x00-0x7C)
        status_reg : out std_logic_vector(31 downto 0); -- bit0=BUSY bit1=DONE
        out_word0  : out std_logic_vector(31 downto 0); -- ciphertext[127:96]
        out_word1  : out std_logic_vector(31 downto 0); -- ciphertext[95:64]
        out_word2  : out std_logic_vector(31 downto 0); -- ciphertext[63:32]
        out_word3  : out std_logic_vector(31 downto 0)  -- ciphertext[31:0]
    );
end entity;

architecture rtl of aes_bridge is

    component aes_8_bit
        port(
            rst    : in  std_logic;  -- ACTIVE-HIGH (opposite of system convention)
            clk    : in  std_logic;
            key_in : in  std_logic_vector(7 downto 0);
            d_in   : in  std_logic_vector(7 downto 0);
            d_out  : out std_logic_vector(7 downto 0);
            d_vld  : out std_logic
        );
    end component;

    type state_t is (S_IDLE, S_LATCH, S_LOAD, S_WAIT_VALID, S_CAPTURE, S_DONE);
    signal state : state_t := S_IDLE;

    signal core_rst   : std_logic := '1';  -- active-high; core held in
                                            -- reset whenever idle
    signal core_d_out : std_logic_vector(7 downto 0);
    signal core_d_vld : std_logic;
    signal d_vld_prev : std_logic := '0';  -- for rising-edge detection

    -- Latched copies of key/plaintext. Captured ONE 32-bit WORD per
    -- clock, spread across the load phase (see S_LOAD below) -- NOT a
    -- single simultaneous 288-bit capture. The previous version latched
    -- all of key_word0..data_word3 in one clock edge on the CTRL rising
    -- edge; DATA3 (the farthest bit range, regbank_outputs(287:256))
    -- showed corruption specifically correlated with that edge on real
    -- hardware, consistent with a timing-margin issue on that widest,
    -- single-cycle capture -- invisible in behavioral simulation, which
    -- does not model routing delay at all. Spreading the capture across
    -- 8 separate cycles removes that single-edge bottleneck entirely.
    signal key_latched  : std_logic_vector(127 downto 0) := (others => '0');
    signal data_latched : std_logic_vector(127 downto 0) := (others => '0');
    signal out_reg      : std_logic_vector(127 downto 0) := (others => '0');

    signal load_idx : unsigned(3 downto 0) := (others => '0');
    signal cap_idx  : unsigned(3 downto 0) := (others => '0');
    signal word_idx : unsigned(2 downto 0) := (others => '0');  -- 0..7, one
                                                                  -- per 32-bit
                                                                  -- word capture

    signal ctrl_d      : std_logic := '0';  -- for START edge detection
    signal busy, done  : std_logic := '0';

    signal key_byte_mux, data_byte_mux : std_logic_vector(7 downto 0);

begin

    -- Combinational byte select for the load phase, MSB-first (byte 0 =
    -- bits [127:120], matching the confirmed order).
    key_byte_mux  <= key_latched(127  - to_integer(load_idx)*8 downto 120 - to_integer(load_idx)*8);
    data_byte_mux <= data_latched(127 - to_integer(load_idx)*8 downto 120 - to_integer(load_idx)*8);

    u_aes : aes_8_bit
    port map(
        rst    => core_rst,
        clk    => clk,
        key_in => key_byte_mux,
        d_in   => data_byte_mux,
        d_out  => core_d_out,
        d_vld  => core_d_vld
    );

    status_reg <= (1 => done, 0 => busy, others => '0');
    out_word0  <= out_reg(127 downto 96);
    out_word1  <= out_reg(95  downto 64);
    out_word2  <= out_reg(63  downto 32);
    out_word3  <= out_reg(31  downto 0);

    process(clk, rstn)
    begin
        if rstn = '0' then
            state        <= S_IDLE;
            core_rst     <= '1';
            ctrl_d       <= '0';
            busy         <= '0';
            done         <= '0';
            load_idx     <= (others => '0');
            cap_idx      <= (others => '0');
            word_idx     <= (others => '0');
            key_latched  <= (others => '0');
            data_latched <= (others => '0');
            out_reg      <= (others => '0');
            d_vld_prev   <= '0';

        elsif rising_edge(clk) then
            ctrl_d     <= ctrl_reg(0);
            d_vld_prev <= core_d_vld;

            case state is

                ----------------------------------------------------------
                -- IDLE: core held in reset. On START, begin the spread-
                -- out word capture (S_LATCH) rather than latching
                -- everything in one wide simultaneous assignment.
                ----------------------------------------------------------
                when S_IDLE =>
                    core_rst <= '1';
                    busy     <= '0';
                    load_idx <= (others => '0');
                    word_idx <= (others => '0');

                    if ctrl_reg(0) = '1' and ctrl_d = '0' then
                        busy  <= '1';
                        done  <= '0';
                        state <= S_LATCH;
                        -- core_rst stays '1' here -- not released until
                        -- the full key/data capture completes in S_LATCH
                    end if;

                ----------------------------------------------------------
                -- LATCH: capture key_word0..data_word3 ONE 32-bit word
                -- per clock (8 cycles total), instead of all 288 bits on
                -- a single edge. This is the fix for the timing-margin
                -- issue found on real hardware (see comment above).
                ----------------------------------------------------------
                when S_LATCH =>
                    core_rst <= '1';  -- core stays parked until capture done

                    case word_idx is
                        when "000" => key_latched(127 downto 96)  <= key_word0;
                        when "001" => key_latched(95  downto 64)  <= key_word1;
                        when "010" => key_latched(63  downto 32)  <= key_word2;
                        when "011" => key_latched(31  downto 0)   <= key_word3;
                        when "100" => data_latched(127 downto 96) <= data_word0;
                        when "101" => data_latched(95  downto 64) <= data_word1;
                        when "110" => data_latched(63  downto 32) <= data_word2;
                        when others => data_latched(31 downto 0)  <= data_word3;
                    end case;

                    if word_idx = 7 then
                        word_idx <= (others => '0');
                        core_rst <= '0';  -- release reset THIS edge, capture complete
                        state    <= S_LOAD;
                    else
                        word_idx <= word_idx + 1;
                    end if;

                ----------------------------------------------------------
                -- LOAD: 16 cycles, one byte per clock, MSB-first.
                -- load_idx and the core's own internal "cnt" stay in
                -- lockstep automatically since both start counting from
                -- the same reset-release edge.
                ----------------------------------------------------------
                when S_LOAD =>
                    core_rst <= '0';
                    if load_idx = 15 then
                        state <= S_WAIT_VALID;
                    else
                        load_idx <= load_idx + 1;
                    end if;

                ----------------------------------------------------------
                -- WAIT_VALID: core free-runs through key expansion + all
                -- 10 rounds with no further input needed. The FIRST valid
                -- ciphertext byte appears on the SAME edge d_vld first
                -- goes high (confirmed by simulation) -- captured here,
                -- not deferred to the next cycle.
                ----------------------------------------------------------
                when S_WAIT_VALID =>
                    core_rst <= '0';
                    if core_d_vld = '1' and d_vld_prev = '0' then
                        out_reg <= out_reg(119 downto 0) & core_d_out;  -- byte #0
                        cap_idx <= (others => '0');
                        state   <= S_CAPTURE;
                    end if;

                ----------------------------------------------------------
                -- CAPTURE: 15 more bytes (#1..#15), 16 total with the one
                -- captured above. d_vld stays high after this -- and the
                -- core just outputs garbage -- so this window is exact,
                -- not "wait for d_vld to clear" (it never does).
                ----------------------------------------------------------
                when S_CAPTURE =>
                    core_rst <= '0';
                    out_reg  <= out_reg(119 downto 0) & core_d_out;
                    if cap_idx = 14 then
                        state <= S_DONE;
                    else
                        cap_idx <= cap_idx + 1;
                    end if;

                ----------------------------------------------------------
                -- DONE: re-reset the core immediately (it never returns
                -- to a ready state on its own), latch DONE for the CPU to
                -- observe, return to IDLE for the next run.
                ----------------------------------------------------------
                when S_DONE =>
                    core_rst <= '1';
                    busy     <= '0';
                    done     <= '1';
                    state    <= S_IDLE;

            end case;
        end if;
    end process;

end architecture;
```
 
| | APB / software side | Core side |
|---|---|---|
| Data width | 32-bit registers, 8 of them (128+128 bits total) | 8-bit `key_in`/`d_in`, one byte at a time |
| Timing | Whenever software writes, arbitrary pace | Rigid: exactly 1 byte/clock for 16 clocks, no pause |
| Control model | Write registers, poll a status bit | No status output at all except `d_vld` |
| Reusability | Expected: write new data, trigger again | Requires a full external reset between every operation |
 
The state machine that resolves this:
 
 <figure>
  <img
    src="/tang-nano-4k-apb-aes/BridgeStateMachine.png"
    alt="Tang Nano 4k"
    width="60%"
  />
  <figcaption><em>Figure 3 — Bridge state-machine behavior model.</em></figcaption>
</figure>

The register map on the software-facing side stays deliberately boring — that's the point:
 
| Offset | Access | Contents |
|---|---|---|
| `0x00` | RO | STATUS: bit0=BUSY, bit1=DONE |
| `0x04`–`0x10` | RO | CIPHERTEXT_0..3 (MSB word first) |
| `0x80` | RW | CTRL: bit0=START (edge-triggered) |
| `0x84`–`0x90` | RW | KEY_0..3 (MSB word first) |
| `0x94`–`0xA0` | RW | DATA_0..3, plaintext (MSB word first) |
 
Software never sees a single byte, a load counter, or a reset pulse. It sees five registers and a status word. All 186 cycles of internal choreography above are completely invisible from the software side — which is exactly what a memory-mapped peripheral is supposed to feel like, no matter how much translation is happening underneath.
 
Here's the whole point of the bridge, made concrete: this is the *entire* C-side encrypt call, driving the register map above directly through `volatile uint32_t` writes:
 
```c

/*
    Note macro: #define AES_REG(offset)  (*(volatile uint32_t *)(APB2MASTER1_BASE + (offset)))
*/
void aes_start_encrypt(const uint8_t key[16], const uint8_t plaintext[16]) {
    AES_REG(AES_KEY0_OFFSET) = bytes_to_word(&key[0]);
    AES_REG(AES_KEY1_OFFSET) = bytes_to_word(&key[4]);
    AES_REG(AES_KEY2_OFFSET) = bytes_to_word(&key[8]);
    AES_REG(AES_KEY3_OFFSET) = bytes_to_word(&key[12]);
 
    AES_REG(AES_DATA0_OFFSET) = bytes_to_word(&plaintext[0]);
    AES_REG(AES_DATA1_OFFSET) = bytes_to_word(&plaintext[4]);
    AES_REG(AES_DATA2_OFFSET) = bytes_to_word(&plaintext[8]);
    AES_REG(AES_DATA3_OFFSET) = bytes_to_word(&plaintext[12]);
 
    AES_REG(AES_CTRL_OFFSET) = 1;  // rising edge -> START
    AES_REG(AES_CTRL_OFFSET) = 0;  // rearm for the next call
}
```
 
Four key-word writes, four plaintext-word writes, and a start pulse — that's it. Nothing in this function knows or cares that underneath it, the bridge is about to spend 8 cycles latching, 16 cycles feeding the core one byte at a time, ~145 cycles waiting on `d_vld`, and 15 more capturing ciphertext bytes one by one. That gap — eight lines of C hiding 186 cycles of choreography — is the entire reason the bridge exists, and it's worth noticing that the very last two lines are P6 fixed and made permanent: `CTRL=1` then `CTRL=0` in the same call, so the rearm bug from §7 can't recur by omission the next time this function is called.
 
Reading the result back is the mirror image — four register reads, reassembled into bytes:
 
```c
void aes_read_ciphertext(uint8_t ciphertext[16]) {
    uint32_t out0 = AES_REG(AES_OUT0_OFFSET);
    uint32_t out1 = AES_REG(AES_OUT1_OFFSET);
    uint32_t out2 = AES_REG(AES_OUT2_OFFSET);
    uint32_t out3 = AES_REG(AES_OUT3_OFFSET);
 
    word_to_bytes(out0, &ciphertext[0]);
    word_to_bytes(out1, &ciphertext[4]);
    word_to_bytes(out2, &ciphertext[8]);
    word_to_bytes(out3, &ciphertext[12]);
}
```
 
And the whole thing composed into one blocking call, the one an application actually reaches for:
 
```c
bool aes_encrypt_block(const uint8_t key[16], const uint8_t plaintext[16], uint8_t ciphertext[16]) {
    aes_start_encrypt(key, plaintext);
    if (!aes_wait_idle(100)) return false; //wait aes finished or a maximum of 100 ms.
    aes_read_ciphertext(ciphertext);
    return true;
}
```
 
`aes_wait_idle()` polls `STATUS` until `BUSY` clears and `DONE` sets, with a timeout — which means from the caller's perspective, encrypting a block on custom silicon looks exactly like calling a library function. That illusion is the payoff for every cycle spent designing the FSM in the previous section. key and plaintext words are latched into internal registers *inside* `S_LATCH`, one 32-bit word per cycle across 8 cycles, rather than reading the register bank live during the load phase or capturing all 288 bits (key + plaintext) in a single clock edge. That second option — one big simultaneous capture — is what I tried first, and it's directly responsible for the nastiest bug in the whole project. More on that next.
 
## 7. What went wrong — eight bugs, and the two that actually mattered
 
Debugging logs are usually the part of a writeup nobody wants to read. This one's worth reading, because the first six bugs are exactly what you'd expect, and the last two are a genuinely useful lesson about the limits of simulation.
 
**The expected bugs (P1, P2, P3, P4 — architectural facts about the core, not really "bugs" so much as things that had to be discovered and designed around):** no handshake, no published resource footprint, an undocumented output capture window, and a core that never autonomously returns to ready. All four are covered in sections 5–6 above — none of them were fixable, only accommodated.
 
**P5 — the byte-mux direction bug.** The bridge indexed bytes LSB→MSB where the core expected MSB→LSB. Consistent, silent, wrong ciphertext every single time — the kind of bug that's actually a relief to find, because it's deterministic and obvious once you look at a byte-by-byte diff against a known-answer vector.
 
**P6 — missing control-register rearm.** `aes_start_encrypt(const uint8_t key[16], const uint8_t plaintext[16])` wrote `CTRL=1` to trigger a run, but never wrote `CTRL=0` afterward. The result: the *second* call to encrypt something never actually started — the driver silently re-read stale ciphertext from the first operation and reported success. This is the kind of bug that passes a naive "does it return without erroring" test and fails a "run it twice with different inputs" test, which is exactly why the verification methodology in the next section insists on back-to-back reuse, not just a single clean run.
 
**P7 — the wide single-cycle latch, and the bug simulation couldn't see.** The original bridge captured all 288 bits of key + plaintext data in one clock edge. On hardware — not in simulation, only on hardware — `DATA3`, the register sitting on the longest routing path in that capture, showed corruption correlated specifically with that edge. Behavioral simulation (Icarus Verilog, Gowin's functional sim) models zero propagation delay and zero setup/hold timing by design; there is no amount of additional RTL simulation that would ever have surfaced this. It only showed up through direct hardware diagnostics: register readback verification and rapid stress sweeps built specifically because simulation had already told me everything it was capable of telling me. The fix was architectural, not cosmetic — spread the capture across 8 cycles (`S_LATCH`, one word per cycle) instead of one simultaneous 288-bit grab, which is the version described in section 6.
 
**P8 — the clock frequency that was quietly too fast.** The design was first run at 108MHz — 4× the 27MHz reference clock. The result was universal, simultaneous, progressively-worsening register corruption, including register values that were logically impossible given the actual control flow. Timing closure simply hadn't been met at that frequency; the fix was dropping to 54MHz (2×), which is where the design lives now.
 
The thread connecting P7 and P8: **both are real-silicon timing phenomena, and both are structurally invisible to behavioral simulation.** That's not a knock on simulation — it caught the logic bugs (P5, P6) exactly the way it's supposed to. It's a reminder that "passes simulation" and "correct" are different claims, and the gap between them, on an FPGA, is exactly the domain of timing closure and physical routing — which is why the hardware diagnostics in the next section exist as a distinct verification layer, not a formality after simulation already "proved" things.
 
## 8. Verification — proving it, not just hoping it
 
Two independent layers, deliberately kept separate:
 
**Simulation, before hardware.** The bridge FSM was translated into an equivalent Verilog model and simulated directly against the real `aes_8_bit` core in Icarus Verilog — not reasoned about on paper. This confirmed the exact output byte-to-cycle window, MSB-first byte ordering, the full 186-cycle operation time, and — critically, given P6 — correct behavior across *back-to-back reuse*: two different key/plaintext pairs run consecutively with no manual reset in between.
 
**Hardware diagnostics, built specifically for this project, once simulation had done everything it could:**
 
| Test | Purpose |
|---|---|
| Register readback verification | Confirms writes actually landed before trusting anything downstream |
| Rapid back-to-back stress sweep (1000 cycles × 9 registers) | Isolates whether an issue is register-specific, sequence-specific, or global timing |
| Before/after-CTRL readback comparison | Isolated whether corruption was tied to AES core activity specifically (this is what found P7) |
| Byte-level mismatch reporting | Diagnoses *how* a result is wrong, not just whether it is |
 
**Known-answer test vectors.** Ten vectors, each independently double-verified before use — once against pycryptodome (an independent, trusted AES implementation) and again against simulation of the actual bridge FSM plus the real core:
 
| Source | Count |
|---|---|
| FIPS-197 Appendix B | 1 |
| Classic Rijndael reference vector | 1 |
| NIST SP 800-38A Appendix F.1.1 (Blocks 1–4) | 4 |
| Independently generated random vectors | 4 |


<figure>
  <img
    src="/tang-nano-4k-apb-aes/aes_uart_results.png"
    alt="Tang Nano 4k"
    width="60%"
  />
  <figcaption><em>Figure 4 — Uart results.</em></figcaption>
</figure>


 
**Result: 10 out of 10 passing on real hardware at 54MHz.**
 
## 9. The numbers, at the end


<figure>
  <img
    src="/tang-nano-4k-apb-aes/synthesis_results.png"
    alt="Tang Nano 4k"
    width="100%"
  />
  <figcaption><em>Figure 5 — Synthesis resources.</em></figcaption>
</figure>


 
| Parameter | Value |
|---|---|
| Clock frequency | 54MHz (reduced from 108MHz — root cause of the P8 investigation) |
| Total design utilization | 1,639 / 4,608 LUT (35.6%) |
| Cycles per operation | 186 |
| Known-answer vectors passing | 10 / 10 |
 
A full AES-128 encryption, key-to-ciphertext, memory-mapped for a Cortex-M3 to use like any other peripheral, in roughly a third of a genuinely tiny FPGA's fabric.
 
## 10. What this actually taught me
 
- **The bridge's complexity is a direct, unavoidable reflection of the core's interface — not over-engineering.** Every state in the FSM exists because of a specific, named limitation of the core underneath it. None of it is incidental, and I'd be suspicious of a simpler bridge that claimed to wrap the same core.
- **A resource footprint claim is only as good as the stimulus used to measure it.** `avs_aes` looked small right up until it was exercised with real data instead of synthetic stimulus the synthesizer could quietly prune.
- **Behavioral simulation cannot substitute for hardware timing validation.** The two most serious bugs in this project were both real-silicon timing phenomena that no amount of additional RTL simulation could ever have caught — simulation and hardware diagnostics are genuinely different verification tools, not a "quick check" followed by a "real check."
- **A "100% passing" test suite can still hide real coverage gaps.** My original rapid-stress test only ever happened to exercise register index 0; the actual failure mode needed every register the design used, swept, before it would show itself.
- **AES on hardware is a different subject than AES the algorithm.** The math is a solved, settled thing. What isn't settled — what's genuinely a design space with real trade-offs, mistakes, and lessons — is what happens the moment you decide the math has to run on 4,608 logic cells and talk to a Cortex-M3 over a bus.
---
 
*Core used: [`ChengluJin/8bit_datapath_AES`](https://github.com/ChengluJin/8bit_datapath_AES) (MIT licensed), based on Hämäläinen et al., DSD 2006. Full project source and this report: [tang-nano-apb-AES](https://github.com/martiniio/tang-nano-apb-AES).*