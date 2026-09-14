---
title: "Building a CAN Controller Into a Cortex-M3 SoC From Scratch"
pubDate: 2026-07-09
tags: [fpga, Can, vhdl, firmware]
description: "Building a CAN bus controller into a Tang Nano 4K FPGA from the ground up, integrating an open-source core into a Cortex-M3 SoC, writing it's driver and then test it. "
---


# Adding CAN Bus to an FPGA That Doesn't Have It

*Building a CAN controller into a Cortex-M3 SoC — and hunting down the phantom frames it produced*

I wanted to understand CAN bus from the bottom up, not by wiring together
modules that already speak it, but by building the controller myself and
integrating it into a real system-on-chip.

The target was a Tang Nano 4K: a small, inexpensive FPGA board built around a
Gowin GW1NSR-4C, with a hard Cortex-M3 core on the die. The board has UART,
some GPIO, an on-chip CPU, but no CAN peripheral. That absence was the point.
On an FPGA, "this chip doesn't have that peripheral" isn't the end of the
conversation; it's an invitation to build the missing hardware yourself and
drop it into the system.

So the goal was concrete: take an open-source CAN controller core, integrate it into the Cortex-M3's bus so firmware could drive it like any other
memory-mapped (APB) peripheral, wire it to a real transceiver, and prove it works by
getting two independent nodes talking over an actual CAN bus, the FPGA on one
end, a Linux single-board computer on the other.

What follows is how that went: the setup, the architecture I ended up with, and
, the part I learned the most from, a bug that produced a flood of phantom CAN
frames and took several wrong theories to actually understand.



# The lab
Two nodes, one bus. That's the smallest setup that proves a CAN
implementation actually works — you need something on the other end to
receive your frames, acknowledge them, and send its own back.


<figure>
  <img
    src="/tang-nano-4k-apb-CAN/can-bench-annotated.jpg"
    alt="CAN bus test bench: the Tang Nano 4K FPGA board on the left, the Luckfox Lyra single-board computer on the right, joined by an SN65HVD230 transceiver and a two-wire CAN bus."
    width="1600"
    height="900"
    loading="lazy"
  />
  <figcaption>
    The test bench: Tang Nano 4K (left) and Luckfox Lyra (right), joined by an
    SN65HVD230 transceiver over a two-wire CAN bus.
  </figcaption>
</figure>

The cast:

- **Tang Nano 4K** — the node I'm building. The Gowin FPGA holds the CAN
  controller and my bridge; its on-chip Cortex-M3 runs the firmware that
  drives them. This is the side that didn't have CAN until I added it.
- **Luckfox Lyra** — a Linux single-board computer, and the *known-good*
  second node. It has a CAN peripheral and driver support baked in, so it
  can send and receive frames with standard Linux tooling. When something
  doesn't work, I can trust this side and look at mine.
- **SN65HVD230 transceiver** — the chip that turns the FPGA's plain digital
  `CAN_TX`/`CAN_RX` logic signals into the differential voltages that
  actually travel on the bus wires, and back again. CAN's robustness lives
  in that differential pair; the transceiver is what bridges logic-land and
  bus-land.
- **The bus** — two wires, CANH and CANL, with a 120 Ω termination resistor
  at each end.

- **A UART debug link** — separate from the CAN path entirely. The FPGA prints
  a running log over UART, and I wired that straight into the Luckfox so both
  the CAN traffic *and* the FPGA's own view of what it thinks is happening land
  in one place, timestamped together. That side-by-side turned out to matter a
  lot when things went wrong.

The full signal path, end to end, looks like this: firmware writes to
registers → those registers reach my bridge → the bridge hands whole frames
to the CAN core → the core serializes them onto `CAN_TX` → the transceiver
drives the differential bus → and on the Luckfox, the same chain runs in
reverse. Every later section is really about one link in that chain, so
it's worth holding the whole picture in mind.


## Setting it up

Getting two nodes to talk takes three things lining up: the physical wiring, the Linux side brought up correctly, and the FPGA side built and flashed. None of them are hard on their own, but each has a gotcha or two worth writing down.

### Wiring

The SN65HVD230 is a 3.3 V transceiver, and both boards drive 3.3 V logic, so `CAN_TX` and `CAN_RX` connect straight through with no level shifting. Per node:

- `CAN_TX` (FPGA) → transceiver `D` (driver input)
- `CAN_RX` (FPGA) ← transceiver `R` (receiver output)
- Transceiver `VCC` → 3.3 V, `GND` → ground, `Rs` → ground (high-speed mode)
- `CANH`/`CANL` → the two bus wires, shared between both nodes

Two things are easy to skip and will cost you an afternoon if you do. First, a **shared ground** between the boards. CAN is differential, but the transceivers still need a common reference, and two separately-powered boards don't have one until you wire it. Second, **120 Ω termination at each end of the bus**: not one resistor, one at each physical end. With only two nodes, that's simply one per node.

### The Linux side (Luckfox)

The Luckfox runs SocketCAN, so once the interface exists it behaves like any other network device. Bringing `can0` up at 500 kbit/s:

```sh
ip link set can0 down
ip link set can0 type can bitrate 500000 fd off loopback off
ip link set can0 up
```

From there, `cansend` and `candump` are all you need to inject and observe frames.

The real work on this board was getting `can0` to *exist* in the first place. The Luckfox's pins are multiplexed, so the same physical pin can be UART, SPI, CAN, or plain GPIO, and which function is active is set by a device-tree overlay driven by a tool called `luckfox-config`. Getting CAN onto the bus meant assigning the CAN peripheral to the specific pins I'd wired, then making sure that assignment actually took effect. A few things that tripped me up, in case they save you the same time:

- **The config file is a record, not the live state.** `luckfox-config` writes your choices to `/etc/luckfox.cfg`, but editing that file by hand doesn't apply anything. The settings only take effect when the config is properly loaded (in my case, on reboot, after the overlay is regenerated). I spent a while confused by a config that *said* CAN was enabled while `can0` didn't exist, because a stale entry had been recorded but never applied.

- **Verify the interface actually came up**, don't assume. After configuring and rebooting:

```sh
ip -details link show can0
```

  This confirms `can0` exists *and* shows the bit-timing it actually negotiated. Worth checking, because a wrong sample point or a slightly-off bitrate here won't stop the interface from coming up, but will quietly break communication with the other node.

- **The pin assignment has to match your wiring exactly.** Obvious in hindsight, but the tool will happily configure CAN onto pins you didn't wire, and you'll get silence with no error.

The [Luckfox documentation](https://wiki.luckfox.com) covers `luckfox-config` and the pin map. Budget some time for this step. It's the kind of thing that's five minutes when it works and an afternoon when it doesn't.




## What CAN actually is
CAN, short for Controller Area Network, was born in 1980s cars. The problem it solved is one every complex machine eventually hits: you have dozens of small controllers scattered around (engine, brakes, dashboard, doors) and they all need to talk, but running a dedicated wire between every pair of them is a tangle nobody wants. CAN replaced that tangle with a single shared bus. Every controller hangs off the same two wires, and any message put on the bus is heard by every node at once.

That "everyone hears everything, nobody is in charge" arrangement is the first thing worth internalizing, because it shapes everything else. There is no master node handing out permission to speak. When a node has something to say it simply starts transmitting, and the protocol has a rule that resolves collisions when two nodes begin at the same time, without either message being lost.

The unit of communication is a *frame*: one message, built from a fixed sequence of fields. The diagram below is a real standard data frame, captured three ways at once. The top row is the raw bitstream, the green trace is the receiver's logic-level view of it, and the red and blue traces are the two physical bus wires, CANH and CANL. Reading it left to right walks you through the whole protocol.



<figure>
  <img
    src="/tang-nano-4k-apb-CAN/canbus_frame.png"
    alt="Protocol packet"
    width="4000"
    height="4000"
    loading="lazy"
  />
  <figcaption>
   The CanBus protocol packet.
  </figcaption>
</figure>





The frame is organized into phases, marked across the top of the capture.

**Arbitration** carries the identifier, and this is where the most elegant part of CAN happens. The identifier does two jobs at once. It names the *message* rather than any sender or receiver: a frame does not say "node 5 to node 12," it announces "here is message such-and-such," and every node configured to care about that identifier picks it up. Adding a new listener to the bus therefore changes nothing about the existing traffic.

That same identifier also decides who wins a collision. If two nodes start transmitting together, they each watch the bus while they drive it, comparing bit by bit. A `0` bit is *dominant* and a `1` bit is *recessive*, which is a deliberate choice: if one node drives a `0` while another drives a `1`, the whole bus reads `0`. So the moment a node transmits a recessive bit but sees a dominant one, it knows another node with a lower identifier is talking over it, and it quietly drops out. The winner never even notices; it keeps transmitting as if nothing happened. Lower identifier wins, higher priority for free, and no bandwidth wasted retransmitting the message that had right of way. The `RTR` bit at the end of arbitration marks whether this is a normal data frame or a request for someone else to send data.

**Control** describes the payload. The `IDE` bit distinguishes a standard 11-bit identifier from an extended 29-bit one, `r0` is reserved, and the four `DLC` (Data Length Code) bits give the number of data bytes that follow, from zero to eight. Classic CAN tops out at eight bytes of payload, which feels tiny until you remember these are short control messages, not file transfers.

**Data** is the payload itself, `DATA7` down to `DATA0` per byte, exactly as many bytes as the DLC promised.

**CRC** is a fifteen-bit checksum over everything before it. Every receiver computes the same checksum independently and compares; a mismatch means the frame was corrupted in flight, and the receivers reject it.

Then comes the part that matters most for the rest of this story: the **ACK** slot. After the CRC, the transmitter drives one recessive bit and listens. Any node that received the frame with a matching checksum pulls that bit dominant. So the transmitter sending a `1` and reading back a `0` is good news: it means at least one other node heard the message cleanly. If it reads back its own `1`, nobody acknowledged, and it knows the message landed nowhere. This has a consequence worth keeping in mind: a CAN transmission only completes successfully if another node acknowledges it. A node talking to a bus with nobody else listening never gets that acknowledgment, no matter how correctly it transmits. It is one of the reasons a single node cannot really be tested alone.

**End of frame** closes things out with a fixed pattern of recessive bits, and a short gap before the bus is free again.

One more mechanism is visible in the capture and worth naming, because it surprises people: **bit stuffing**, marked as `stuff bit` at a few points. CAN encodes no separate clock; receivers recover timing from the transitions in the data itself. A long run of identical bits has no transitions, so after five bits of the same value the transmitter inserts one bit of the opposite value purely to keep everyone synchronized. Receivers know the rule and silently discard those stuffed bits. It is invisible at the message level but very much present on the wire, which is exactly why it shows up in a real capture like this one.

Underneath all of it sits the physical trick that lets CAN survive a car engine bay. Look at the CANH and CANL traces: they are mirror images. A bit is not "is this one wire high," it is the *difference* between the two wires. Electrical noise tends to strike both wires nearly equally, so it largely cancels in the difference. That differential encoding is what keeps CAN reliable in electrically hostile places where a single-ended signal would be hopeless, and converting between the FPGA's plain logic levels (the green trace) and this differential pair (red and blue) is the entire job of the transceiver chip.



## The catch: no CAN on board

Here is the problem. The Tang Nano 4K has UART, it has GPIO, it has an on-chip Cortex-M3 processor. What it does not have is a CAN peripheral. There is no CAN controller sitting in the silicon waiting to be switched on.

On an ordinary microcontroller that would be the end of the road. A fixed-function chip has exactly the peripherals its designers baked in, and if CAN is not among them, the chip cannot speak CAN. You would go buy a different part.

But this is an FPGA, and an FPGA plays by different rules. Its logic is not decided at the factory. You describe the hardware you want in a hardware description language, and the chip configures itself to *become* that hardware. A missing peripheral is not a wall, it is an empty space you are allowed to fill. If the board has no CAN controller, I can describe one and drop it in, and from that point on the chip genuinely has a CAN controller, as real as if it had been there all along.

That still leaves the question of where the CAN controller comes from. I could describe one from scratch, but CAN is a protocol with a lot of fiddly corners: bit timing, arbitration, error handling, the stuffing rule from the last section, and much more. Getting all of it right is a serious project in its own right, and it is a wheel that has already been invented many times. The sensible move is to reach for an *IP core*: a ready-made, reusable block of hardware description that implements a function, the hardware world's equivalent of pulling in a library instead of rewriting it yourself. Someone has already written and debugged a CAN controller in VHDL; I can integrate their core into my design rather than start from a blank file.

Of course, building on someone else's hardware means trusting it, and understanding its contract well enough to use it correctly. That trust turns out to matter later. But the starting point was clear: I went looking for a CAN IP core I could drop into the Tang Nano.


## Meet CanLite

The core I settled on is [CanLite](https://github.com/bggardner/can-lite-vhdl), an open-source CAN controller written in VHDL. It has a long lineage: it descends from the CAN controller work published on OpenCores years ago, which has been used and adapted many times over. I treated it the way you should treat a mature building block. I read its interface closely enough to drive it correctly, but I did not rewrite its internals. As far as this project is concerned, CanLite is the trusted component that knows how to speak CAN, and my job is to use it correctly.

What it gives you is the entire protocol engine from the previous section, packaged up. You hand it a whole frame, an identifier plus a length plus some data bytes, and it does everything needed to put that frame on the wire: arbitration, bit stuffing, the CRC, listening for the acknowledgment, the exact bit timing. In the other direction it watches the bus, reassembles incoming bits into complete frames, and hands them back to you. All the fiddly detail lives inside the core. You get to think in messages.

The cleanest way to see what "talk to it" means is to look at the core's actual interface. Here is the entity declaration, which is simply the list of wires going in and out.

```vhdl
entity CanLite is
    generic (
        BAUD_RATE_PRESCALAR         : positive range 1 to 64 := 1;
        SYNCHRONIZATION_JUMP_WIDTH  : positive range 1 to 4  := 3;
        TIME_SEGMENT_1              : positive range 1 to 16 := 9;
        TIME_SEGMENT_2              : positive range 1 to 8  := 2;
        TRIPLE_SAMPLING             : boolean := true
    );
    port (
        Clock               : in  std_logic; --clock
        Reset_n             : in  std_logic; 

        CanRx               : in  std_logic;   -- from the transceiver
        CanTx               : out std_logic;   -- to the transceiver

        RxFrame             : out CanBus.Frame; -- a received frame
        RxFifoWriteEnable   : out std_logic;    -- "here is one for you"
        RxFifoFull          : in  std_logic;    -- "no room, I have to drop it"

        TxFrame             : in  CanBus.Frame;  -- a frame to send
        TxFifoReadEnable    : out std_logic;     -- "give me the next one"
        TxFifoEmpty         : in  std_logic;     -- "nothing queued"
        TxAck               : out std_logic;     -- "it was acknowledged"

        Status              : out CanBus.Status  -- bus state, errors
    );
end entity CanLite;
```

The ports fall into four natural groups, and the block diagram below arranges them the same way.


<figure>
  <img
    src="/tang-nano-4k-apb-CAN/canlite_block.png"
    alt="CANLITE_BLOCK"
    width="1000"
    height="8"
    loading="lazy"
  />
  <figcaption>
   The CanLite block ip core.
  </figcaption>
</figure>

The **generics** at the top are configuration set once when the core is built: they define the bit timing, how the CAN bit rate is derived from the input clock. Set them correctly for your clock and desired bus speed and then forget them.

The **CAN pins**, `CanRx` and `CanTx`, are the simple side. They connect to the transceiver and, through it, to the physical bus. Two wires, nothing subtle.

The **frame interface** is where you can see the core's whole philosophy. Notice the type: `RxFrame` and `TxFrame` are not bits or bytes, they are `CanBus.Frame` records, a complete structured message with its identifier, length, and data. You never deal with the core at the level of individual bits. You give it a `Frame` and you get back a `Frame`.

The **handshake signals** are the part that actually matters, and the part I want to flag now because the rest of this story lives here. The core coordinates with pulses. On receive, it raises `RxFifoWriteEnable` for a moment to say "here is a frame, take it." On transmit, it raises `TxFifoReadEnable` to say "give me the next frame to send," and it pulses `TxAck` when a frame it sent was acknowledged on the bus. These are not requests you can answer whenever you feel like it; they happen on the core's schedule, and honoring them correctly is the contract you sign when you use CanLite.

Finally, `Status` reports the health of the bus: whether the node is active, whether errors are piling up, and so on.

And here is the tell, sitting right there in the port names. Look at `RxFifoFull` and `TxFifoEmpty`. The core is asking about FIFOs. It expects, on the receive side, to be told when there is no room so it can register an overflow, and on the transmit side, to be told when the queue of outgoing frames is empty. In other words, CanLite is a CAN *engine*, not a finished peripheral. It knows how to turn frames into bus traffic and back, but it assumes something outside it is holding the frames, keeping the queues, and answering its handshake in real time. It hands you raw frames and expects you to keep up.

That expectation, and what it costs, is the next thing to look at.


## Why it needs a bridge

At this point CanLite can do the hard part, the actual CAN protocol, but there is a real distance between what the core offers and what a piece of firmware can actually use. That distance has two parts, and seeing both is what makes the solution obvious.

The first part is the one the last section ended on. CanLite has no memory of its own. Those `TxFifoEmpty` and `RxFifoFull` signals in its ports are not a buffer inside the core; they are how the core coordinates with a buffer it expects someone else to provide. CanLite is the controller half of a controller-and-buffer pair, and it leaves the buffer half out on purpose. The reason is size. Storage costs FPGA resources, and how much you need depends entirely on the application. A core with a large buffer baked in would waste space for someone who only ever handles one frame at a time, and still not be enough for someone who needs to absorb long bursts. So the core stays lean and generic, and each design adds exactly the buffering it needs. That minimalism is a large part of why a core like this fits on a board as small as the Tang Nano in the first place.

But leaving the buffer out means the buffer still has to exist somewhere, because without it the system barely functions. Consider the timing. When a frame arrives, the core hands it over and immediately turns its attention to the next one on the bus. When it is ready to transmit, it asks for the next outgoing frame on its own schedule, not yours. At CAN bus speed a whole frame comes and goes in well under a millisecond. If the firmware had to personally catch every single frame inside that slice of time, it could never do anything else, and the moment it looked away it would miss traffic. Buffering is what breaks that coupling. It lets a short burst of frames queue up so the processor can deal with them when it gets a chance, instead of being chained to the bus's timing. So the missing buffer is not optional; something has to supply the FIFOs the core keeps asking about.

The second part of the distance is a difference in language. CanLite speaks in whole frames and coordinating pulses, on its own clock. Firmware does not speak that language at all. A processor talks to its peripherals by reading and writing registers: put a value at this address, read a value from that one, set a bit to start something. It has no notion of a `Frame` record arriving on a wire, or of a one-clock pulse it has to answer in real time. Handed CanLite's raw interface directly, firmware would have nothing to grab onto.

So there are two gaps. The core needs buffering it does not contain, and firmware needs registers the core does not offer. Both gaps sit in exactly the same place, between the bare CAN engine and the processor, and that is precisely where I put the piece that closes them. It is buffer and translator at once: on one side it presents a small set of registers that firmware can read and write like any ordinary peripheral, and on the other it holds the FIFOs the core wants and answers the core's handshake in real time. Firmware writes a frame into a few registers and pulses a bit; the bridge catches that, queues it, feeds it to the core when the core asks, and reports back when it has been sent. Incoming frames run the same path in reverse. Everything from here on is about building that piece, and, eventually, about the subtle ways it went wrong.



## Building the bridge

Before any code, it helps to have the shape of the thing in mind. The bridge sits in one specific place: between the register bank that faces the processor and the bare CanLite core that faces the bus. Everything it does is in service of connecting those two worlds, which speak very different languages.

Here is the whole arrangement at a glance.

<figure>
  <img
    src="/tang-nano-4k-apb-CAN/mcu_apb_canbridge_canlite.png"
    alt="Architecture"
    width="1000"
    height="8"
    loading="lazy"
  />
  <figcaption>
   SImple soft abstract illustration of the desired architecture.
  </figcaption>
</figure>



Read it left to right. The Cortex-M3 talks to the register bank over APB, exactly as it would to any peripheral. The register bank, which already existed, turns those bus transactions into plain register words and hands them to the bridge. Inside the bridge live the two things the core cannot supply for itself: a pair of FIFOs, one per direction, and the logic that drives the CanLite core's real-time handshake. The core does the actual CAN protocol and drives the transceiver pins. The bridge is everything between the register words and the core.

With that picture in place, the interface makes sense on sight. Here is the bridge's entity, and it is worth putting next to CanLite's from earlier, because the contrast is the entire point.

```vhdl
library ieee;
    use ieee.std_logic_1164.all;
    use ieee.numeric_std.all;
    use work.CanBus;

entity CanLite_Bridge is
    generic (
        -- CanLite bit-timing. Defaults give 500 kbit/s at 54 MHz:
        --   54e6 / 2 / PRESCALAR / (1 + SEG1 + SEG2)
        --   = 54e6 / 2 / 6 / 9 = 500 kbit/s, sample point 77.8%
        G_PRESCALAR : positive range 1 to 64 := 6;
        G_SJW       : positive range 1 to 4  := 2;
        G_SEG1      : positive range 1 to 16 := 6;
        G_SEG2      : positive range 1 to 8  := 2;
        G_TRIPLE_SAMPLING : boolean := true;

        -- FIFO depths (frames). Must be a power of two.
        G_TX_DEPTH  : positive := 4;
        G_RX_DEPTH  : positive := 4
    );
    port (
        clk   : in  std_logic;  -- APB/core clock (shared)
        rstn  : in  std_logic;  -- active-low reset (shared)

        -- CAN transceiver pins
        can_rx : in  std_logic;
        can_tx : out std_logic;
        ---------------------------------------------------------------
        -- APB register interface (all 32-bit, addresses shown are the
        -- byte offsets the APB slave decodes)
        ---------------------------------------------------------------
        -- MCU -> HW (regbank outputs)
        tx_id_reg    : in  std_logic_vector(31 downto 0); -- 0x80
        tx_ctrl_reg  : in  std_logic_vector(31 downto 0); -- 0x84
        tx_data0_reg : in  std_logic_vector(31 downto 0); -- 0x88
        tx_data1_reg : in  std_logic_vector(31 downto 0); -- 0x8C
        ctrl_reg     : in  std_logic_vector(31 downto 0); -- 0x90 (pulses)

        -- HW -> MCU (regbank inputs)
        rx_id_reg    : out std_logic_vector(31 downto 0); -- 0x00
        rx_ctrl_reg  : out std_logic_vector(31 downto 0); -- 0x04
        rx_data0_reg : out std_logic_vector(31 downto 0); -- 0x08
        rx_data1_reg : out std_logic_vector(31 downto 0); -- 0x0C
        status_reg   : out std_logic_vector(31 downto 0); -- 0x10
        -- Level interrupt (OR of attention conditions). Leave open if
        -- unused; it adds no register cost.
        -- TODO: able to add interrupt logic in order to scale to event driven design :)
        irq : out std_logic
    );
end entity CanLite_Bridge;
```


<figure>
  <img
    src="/tang-nano-4k-apb-CAN/canlite_bridge.png"
    alt="CANLITE_BRIDGE"
    width="1000"
    height="8"
    loading="lazy"
  />
  <figcaption>
   The CanLite Bridge block ip core.
  </figcaption>
</figure>
Where CanLite's interface was full of `Frame` records and real-time handshake pulses, the bridge's is almost entirely plain 32-bit register words, each tagged with the address firmware sees it at. That is the translation made concrete: the raw core faces one way, the ordinary register world faces the other, and the bridge stands between them. Notice the FIFO depths sitting up in the generics, four frames each by default. The buffering the core wanted is now a thing with a size I chose.

Internally the bridge does three jobs.

### One: give the registers meaning

On the transmit side, firmware fills in a handful of registers: an identifier, a control word holding the length and a couple of flags, and two words of data payload. To the register bank these are just bits at addresses. The bridge is what reads those bits and assembles them into a `Frame` the core understands, picking the identifier out of one register, the length and flags out of specific bit positions of another, the eight data bytes out of the two payload words. The receive side does the reverse: when a frame arrives, the bridge lays its fields back out across the read-only registers so firmware can pick them up. A single 32-bit status register carries the rest of what firmware needs to know: whether a frame is waiting, whether there is room to send, whether the last send was acknowledged, and the health of the bus.

One design decision here is worth calling out, because it prevents a whole class of bug. The commands that firmware issues, "send this frame now" and "I have taken the received frame, release it," live in their own dedicated register at address `0x90`, separate from the registers that hold the frame data. They work as pulses: firmware writes a bit high, then low, and the bridge acts on the rising edge. Keeping the command bits in their own register means that acknowledging a received frame can never accidentally disturb the fields of a frame being set up for transmission. The two concerns do not share storage, so they cannot interfere.

### Two: the FIFOs

This is the buffering CanLite deliberately left out. The bridge holds a small queue in each direction, four frames deep, built as a ring: a block of storage with a write pointer and a read pointer that chase each other around. Firmware pushes an outgoing frame onto the tail of the transmit queue; the core pulls from the head when it is ready. Incoming frames go onto the tail of the receive queue as the core delivers them; firmware reads from the head. A count of how full each queue is tells the bridge when a queue is full (so it can flag a dropped frame rather than corrupt one) and when it is empty (so it can tell the core there is nothing to send). This is what breaks the coupling between the bus's timing and the processor's: a short burst can sit in the queue, waiting, instead of being lost.

### Three: answer the core in real time

The third job is the one that has to be exactly right. CanLite drives its handshake on its own schedule, and the bridge has to respond correctly every time. When the core pulses "give me the next frame," the bridge must present the right frame from the transmit queue. When the core pulses "here is a received frame," the bridge must capture it that cycle. When the core reports an acknowledgment, the bridge must latch it for firmware to read.

One requirement inside this handshake deserves stating on its own, because it is subtle and the bridge has to honor it exactly. When the bridge hands the core a frame to transmit, the core does not copy it and work from a copy. It reads the frame continuously, straight out of wherever the bridge is pointing it, for the entire time it is shifting that frame onto the wire, which at bus speed is a long stretch of clock cycles. So the frame the bridge presents has to stay perfectly still from the moment the core picks it up until the moment it finishes sending it. If that value changes midway through, the tail of the frame on the wire is built from whatever the new value is, and the message goes out corrupted.

That is the contract the transmit path has to satisfy. With the three jobs in place, the hardware side of the bridge is complete: registers in, frames buffered, the core fed and answered in real time. What was still missing was the other end, the firmware that would actually drive all of this.




## The driver

The hardware gives firmware a set of registers. What it does not give is a pleasant way to use them. Nobody writing an application wants to remember that the transmit identifier lives at offset `0x80`, that the data-length code sits in bits five through two of the control word, or that a send is triggered by pulsing a particular bit high then low. That is what the driver is for: a thin layer of C that hides the register map behind a handful of functions that speak in whole frames.

A frame, on the firmware side, is just a struct.

```c
typedef struct {
    uint32_t id;        /* 11-bit standard or 29-bit extended */
    bool     extended;  /* true = 29-bit ID */
    bool     rtr;       /* remote transmission request */
    uint8_t  dlc;       /* number of data bytes, 0..8 */
    uint8_t  data[8];
} can_frame_t;
```

And the API is small enough to take in at a glance.

```c
void can_send(const can_frame_t *frame);
bool can_send_blocking(const can_frame_t *frame, uint32_t timeout_polls);
bool can_receive(can_frame_t *frame);

bool can_tx_ready(void);      /* room in the transmit queue? */
bool can_rx_available(void);  /* a received frame waiting?   */
bool can_tx_acked(void);      /* did the last send get acknowledged? */
bool can_tx_dropped(void);    /* was a send lost to a full queue?    */
```

That is the whole surface an application sees. Fill in a `can_frame_t`, call `can_send`. Poll `can_rx_available`, and when it is true, call `can_receive` to get the frame. The register offsets, the bit positions, the pulse timing, none of it leaks out.

All of that rests on one small piece of plumbing. The bridge's registers live at fixed addresses in the processor's memory map, and reaching them from C is a single macro.

```c
#define CAN_REG(off)  (*(volatile uint32_t *)(APB2MASTER1_BASE + (off)))
```

It takes a register offset, adds it to the base address of the peripheral, treats the result as a pointer to a 32-bit hardware register, and dereferences it. The `volatile` keyword is the important part: it tells the compiler that this location can change on its own and must never be optimized away or cached in a CPU register. Every `CAN_REG(...)` in the driver is, quite literally, one load or store to a hardware address. That is the whole mechanism by which firmware and the bridge talk.

The interesting part is what one of the functions does with it, because that is where the register map from the last section turns into real accesses, and where the frame fields get shuffled into the exact bit positions the hardware expects. Here is `can_send` in full.

```c
void can_send(const can_frame_t *frame)
{
    uint32_t ctrl = 0;
    if (frame->rtr)      ctrl |= CAN_CTRL_RTR;                     /* bit 0   */
    if (frame->extended) ctrl |= CAN_CTRL_IDE;                    /* bit 1   */
    ctrl |= ((uint32_t)(frame->dlc & 0xF)) << CAN_CTRL_DLC_SHIFT; /* bits 5:2 */

    uint32_t data0 = (uint32_t)frame->data[0]
                   | ((uint32_t)frame->data[1] << 8)
                   | ((uint32_t)frame->data[2] << 16)
                   | ((uint32_t)frame->data[3] << 24);
    uint32_t data1 = (uint32_t)frame->data[4]
                   | ((uint32_t)frame->data[5] << 8)
                   | ((uint32_t)frame->data[6] << 16)
                   | ((uint32_t)frame->data[7] << 24);

    /* Load the frame registers first, then pulse the request. */
    CAN_REG(CAN_TX_ID_OFFSET)    = frame->id & 0x1FFFFFFFu;
    CAN_REG(CAN_TX_CTRL_OFFSET)  = ctrl;
    CAN_REG(CAN_TX_DATA0_OFFSET) = data0;
    CAN_REG(CAN_TX_DATA1_OFFSET) = data1;

    CAN_REG(CAN_CTRL_OFFSET) = CAN_CMD_TX_REQUEST;  /* pulse high */
    CAN_REG(CAN_CTRL_OFFSET) = 0;                    /* then low   */
}
```

The first block is where the translation actually happens, and it is worth slowing down on. A `can_frame_t` keeps its fields as separate, friendly struct members: a boolean for the remote-transmission flag, a boolean for extended addressing, a small integer for the length. The hardware does not want them that way. It wants them packed into one 32-bit control word at specific bit positions, because that is the layout the bridge reads back. So the flags are folded into single bits with a bitwise OR, and the length is shifted left into bits five through two with `<< CAN_CTRL_DLC_SHIFT`. These are the same fields from the frame anatomy in the primer, the identifier, the RTR and IDE bits, the data length code, now being written into the exact positions the bridge will later pull them out of. The `IDE` bit in particular carries real weight: it is the single bit that tells the core whether to send an 11-bit standard identifier or a 29-bit extended one, so setting it correctly here is what decides the shape of the frame that goes on the wire.

The two data words are the same idea applied to the payload: eight separate bytes shifted into their byte lanes within two 32-bit words, byte zero in the low eight bits, byte one shifted up by eight, and so on up to byte seven in the top eight bits of the second word. The bridge unpacks them in exactly this order on the other side.

Then come the register writes, and they read as three steps. The packed values go into the frame registers first. Only after all the frame data is in place does the code pulse the request bit in the command register, high then low, which is the rising edge the bridge watches for. That ordering is not incidental. The bridge samples the frame registers at the instant it sees the request edge, so the data has to be sitting there first. Load, then fire.

Before sending, though, an application usually wants to know there is room. That is what `can_tx_ready` is for: it reads a single bit in the status register that reflects whether the transmit queue has a free slot, so firmware can avoid overrunning it. For callers that would rather wait than check, `can_send_blocking` wraps the send in a short loop that spins on that bit until a slot opens.

```c
bool can_send_blocking(const can_frame_t *frame, uint32_t timeout_polls)
{
    uint32_t i = 0;
    while (!can_tx_ready()) {
        if (++i >= timeout_polls) {
            return false;      /* gave up waiting for a free slot */
        }
    }
    can_send(frame);
    return true;
}
```

It is a thin wrapper, but it captures a real choice. `can_tx_ready` is a question; `can_send_blocking` is a question that waits for the answer it wants, up to a caller-supplied limit so it can never spin forever. If a slot opens in time, the frame goes out and it returns success. If the limit runs out first, it gives up and returns failure rather than blocking the whole system on a queue that is not draining. Which one an application reaches for depends on whether it would rather poll and move on, or wait.

Receiving is the mirror image, and it is worth seeing too, because it shows the same discipline from the other direction.

```c
bool can_receive(can_frame_t *frame)
{
    if (!can_rx_available()) {
        return false;               /* nothing waiting */
    }

    uint32_t id_reg   = CAN_REG(CAN_RX_ID_OFFSET);
    uint32_t ctrl_reg = CAN_REG(CAN_RX_CTRL_OFFSET);
    uint32_t data0    = CAN_REG(CAN_RX_DATA0_OFFSET);
    uint32_t data1    = CAN_REG(CAN_RX_DATA1_OFFSET);

    frame->extended = (ctrl_reg & CAN_CTRL_IDE) != 0;
    frame->rtr      = (ctrl_reg & CAN_CTRL_RTR) != 0;
    frame->dlc      = (uint8_t)((ctrl_reg & CAN_CTRL_DLC_MASK) >> CAN_CTRL_DLC_SHIFT);
    frame->id       = id_reg & (frame->extended ? 0x1FFFFFFFu : 0x7FFu);

    frame->data[0] = (uint8_t)(data0 >> 0);
    frame->data[1] = (uint8_t)(data0 >> 8);
    frame->data[2] = (uint8_t)(data0 >> 16);
    frame->data[3] = (uint8_t)(data0 >> 24);
    frame->data[4] = (uint8_t)(data1 >> 0);
    frame->data[5] = (uint8_t)(data1 >> 8);
    frame->data[6] = (uint8_t)(data1 >> 16);
    frame->data[7] = (uint8_t)(data1 >> 24);

    CAN_REG(CAN_CTRL_OFFSET) = CAN_CMD_RX_ACK;  /* release the slot */
    CAN_REG(CAN_CTRL_OFFSET) = 0;

    return true;
}
```

It starts with the same kind of guard `can_tx_ready` gives the transmit side: `can_rx_available` checks a status bit, and if no frame is waiting the function returns immediately. When there is one, it reads the four registers holding the received frame and unpacks them back into a `can_frame_t`, undoing exactly what `can_send` packed on the other end. The control word is taken apart the same way it was assembled: the IDE bit decides whether the identifier is masked to 11 bits or kept at the full 29, the length comes back out of bits five through two, and the eight payload bytes are pulled from their lanes in the two data words. Then, last, it pulses the acknowledge bit. That pulse tells the bridge the firmware is done with this frame and the slot can be released, letting the next queued frame move to the front. The shape is identical to sending: read what you need first, then pulse the command bit once the data is safely in hand. Fire last, always.
Everything, in the end, is reads and writes to those few addresses, dressed up as something an application can actually reason about.



## Testing it

A single frame echoing back is a nice first sign of life, but it proves almost nothing. It exercises one identifier, one length, a couple of data bytes, one frame at a time, on a calm bus. Plenty of real behavior hides outside that narrow path, and the whole point of building the FIFOs and the careful handshake was to handle exactly the cases a lazy echo never reaches. So the real test was a suite that deliberately went after those cases.

The setup is the same two nodes from the start: the FPGA runs a small responder, and the Luckfox drives the tests over SocketCAN and checks what actually comes back on the wire. That second part matters. The FPGA can report what it thinks it did over its debug UART, but it cannot verify itself; only an independent node watching the bus can confirm that a frame truly went out, correct, in the right order. The Luckfox is that independent witness.

Each test targets one specific behavior:

- **Data integrity.** Send a known eight-byte pattern and confirm it comes back byte for byte identical. This checks that the driver packs the payload into the register words and the bridge unpacks it, in both directions, without a single byte landing in the wrong lane.
- **Every data length.** Reply with one frame for each valid length from zero to eight bytes, and verify each arrives with the right length and the right contents. Off-by-one handling of the length field lives here.
- **Standard and extended identifiers, including the edges.** Beyond an ordinary extended frame, this fires the boundary values: the smallest identifier, the largest 11-bit standard one, the largest 29-bit extended one, and the first value that no longer fits in eleven bits. Each has to arrive with the exact identifier and the correct standard-or-extended flag. This is the test I most wanted, because a masking mistake at exactly these boundaries had bitten me before, and I wanted it locked down for good.
- **Remote frames.** A remote-transmission-request frame carries no data, just the request flag. The driver handles that flag but nothing else exercised it, so this confirms it survives the round trip.
- **Back-to-back bursts.** Six frames queued as fast as the FIFO allows, with distinct identifiers and payloads, checked for all six arriving, intact, and in order. This is the important one. It is the exact scenario that had exposed the transmit-corruption bug, so watching six frames go out clean and in sequence is the direct confirmation, on real hardware, that the fix holds.
- **Overfilling the transmit queue.** Deliberately push more frames than the four-deep queue can hold, without waiting for room, and confirm the bridge reports a dropped frame rather than silently corrupting one. The queue is allowed to be full; it is not allowed to lie about it.
- **A long sequential run.** Send two hundred frames carrying an incrementing counter, and verify every count arrives exactly once and in order. Two hundred frames through a four-deep ring wraps its pointers around roughly fifty times, which is where subtle wraparound bugs would surface. A six-frame burst cannot reach that; a two-hundred-frame run does.

All of them pass.


```sh
#luckfox lyra plus linux board output
[PASS] ECHO
[PASS] DATA_INTEGRITY   (sent=[DE AD BE EF 01 23 45 67] got=[DE AD BE EF 01 23 45 67])
[PASS] DLC_SWEEP        (all 0..8 correct)
[PASS] EXTENDED_ID      (id 0x12345678, correct)
[PASS] STATUS_REPORT
[PASS] BURST_TX         (ids 0x100..0x105, all once, in order)
[PASS] FILL_TX_DROP     (5 frames on the bus from an overfilled 4-deep queue)
[PASS] ID_BOUNDARY      (all edge IDs correct)
[PASS] RTR_ROUNDTRIP
[PASS] SEQUENTIAL_200   (200/200)

10/10 passed
```
The sequential run is the one I find most reassuring. Six frames staying intact could, in principle, be luck. Two hundred frames arriving in perfect order, with the queue wrapping fifty times underneath, is much harder to pass by accident. It is the difference between "it worked this time" and "it works."

It is worth being equally clear about what these tests do not cover, because a test suite that oversells itself is worse than an honest one. Everything above runs on a quiet bench: two nodes, short wires, no competition for the bus. I did not test arbitration, two nodes transmitting at the same instant and one having to yield. I did not test recovery from bus errors, or sustained traffic for hours, or a third node contending. And one path inside the design, the receive queue overflowing, I left deliberately untested, because the firmware drains received frames continuously and so never lets that queue back up in the first place. That path exists in the hardware, but this firmware cannot trigger it, and I would rather say so plainly than write a test that quietly proves nothing.

What the suite does establish is real: correct data, every length, the full identifier range including its edges, remote frames, burst stability, honest overflow reporting, and sustained in-order delivery through many FIFO wraps. On a two-node bench, talking to an independent node that checks every frame on the wire, the design does what it claims.






## What I learned, and where it landed

The goal at the start was simple to state: give a board with no CAN peripheral the ability to speak CAN, and prove it against a real second node. That happened. The FPGA now carries a full CAN controller integrated into its on-chip processor as an ordinary memory-mapped peripheral, buffered, register-mapped, driven by a small C library, and verified talking to a Linux node that checks every frame on the wire.

But the interesting part was never the CAN protocol itself. The core handled that. Almost everything I actually spent time on lived in the space around the core: the buffering it deliberately left out, the translation from raw frames into registers a processor could use, and the one contract that had to be exactly right.

That contract is worth dwelling on, because it produced the hardest bug in the project and taught the most. The rule was the one from building the transmit path: while the core is shifting a frame onto the wire, it reads that frame continuously, so the frame has to stay perfectly still until it finishes. My first FIFO pointed the core straight at its internal storage. Most of the time that was fine. A single frame sent on its own never moved, so it transmitted correctly by luck rather than design. But under back-to-back traffic, when a second frame arrived mid-transmission, the value under the core's nose changed, and the frame on the bus came out with one head and a different tail. Corrupted, intermittently, with nothing in the register interface to say why. The fix was to stop pointing the core at live storage and instead copy each frame into a dedicated holding register the moment the core takes it, frozen until the transmission ends. That single change turned rare, inexplicable corruption into a link that simply works, and the burst test in the last section is what confirmed it on hardware.

The pattern underneath that bug held throughout the whole project, and it is the thing I would carry to the next one. The core worked. My logic worked. What went wrong lived in the contract between them, an assumption about a signal I thought was stable that was not, a handshake I read one way that the core meant another. When two correct pieces are joined, the surprises hide at the interface, and reading that interface exactly, not approximately, is most of the work. The CAN protocol was the part that was already solved. The engineering was everything around it.

Where it stands now is honest: it works on a two-node bench, broadly tested, with its limits stated plainly rather than papered over. It is not a product, and there is real work left before it would survive a live industrial bus, arbitration under contention, error recovery, sustained load. But as a way to understand CAN from the silicon up, by building the missing hardware and then chasing down the one subtle thing that hid inside it, it did exactly what I hoped.

## Credits and references

This project stands on work by others, and it would be wrong not to name it.

- **CanLite**, the CAN controller core, by Brandon Gardner: [github.com/bggardner/can-lite-vhdl](https://github.com/bggardner/can-lite-vhdl). Licensed under the GNU LGPL v2.1. The core itself descends from the CAN protocol controller originally published on OpenCores, and I used it essentially unmodified as the protocol engine at the heart of the design.
- **The Tang Nano 4K** board and its Gowin GW1NSR-4C FPGA, from Sipeed. Board documentation: [wiki.sipeed.com](https://wiki.sipeed.com/hardware/en/tang/Tang-Nano-4K/Nano-4K.html).
- **The Luckfox Lyra** single-board computer, used as the independent second CAN node, with its SocketCAN support and the `luckfox-config` pin-muxing tool. Documentation: [wiki.luckfox.com](https://wiki.luckfox.com).
- **SocketCAN** and the `can-utils` tools (`cansend`, `candump`), the Linux CAN subsystem that made the second node straightforward to drive and observe.
- **python-can**, used for the structured host-side test suite.
- **The SN65HVD230** 3.3 V CAN transceiver from Texas Instruments, which bridges the FPGA's logic signals and the differential bus.

The CAN protocol itself was developed by Robert Bosch GmbH. Any mistakes in how I have described it, or in the design around the core, are my own.





## SIMPLE PLAY EXAMPLE  (led toggle)
By receiving frame with id =0x200 the led is toggled.






























## The bug that hid in plain sight

The requirement from the last section sounds easy: hold the outgoing frame still while the core transmits it. My first version got it wrong in a way that took a while to even see, because most of the time it worked.

The bridge presented the outgoing frame to the core by pointing at the current slot in the transmit FIFO. That seems reasonable, but it quietly breaks the one rule that matters. The core reads that frame continuously for the entire time it is shifting bits onto the wire. If, partway through a transmission, firmware queued another frame, or the internal read position advanced, the value under the core's nose changed. The first part of the frame on the bus came from the old data, the tail came from the new. A corrupted frame went out, failed its checksum at the receiver, and nothing in the register interface gave any hint why.

What made it maddening is that it usually did not happen. A single frame, sent on its own, transmits fine: nothing disturbs it mid-flight, so the value stays still by luck rather than by design. The corruption only appeared under back-to-back traffic, when a second frame arrived during the first one's transmission window, which at bus speed is a sliver of time. Rare enough to look like noise, common enough to be real.

The fix was to stop pointing the core at live storage. Instead, the bridge copies the frame into a dedicated holding register the moment the core takes it, and the core reads only from that register. Once a transmission starts, that value is frozen by construction. Nothing that happens in the FIFO behind it, another push, the read position moving, can touch what the core is currently sending. The frame the core sees at the start is exactly the frame it finishes with.

That single change, a stable register between the queue and the core, is what turned intermittent, inexplicable corruption into a link that simply works.


## What it taught me

Nearly every hard problem in this project lived in the same place: not inside CanLite, not inside my logic, but in the contract between them. The core worked. My FIFO worked. What went wrong was an assumption about how the two fit together, a signal I thought was stable that was not, a timing I read one way that the core meant another. The bug above is the sharpest example, but the pattern held throughout. When two correct pieces are joined, the interface between them is where the surprises hide, and reading that contract carefully, exactly, is most of the work.

