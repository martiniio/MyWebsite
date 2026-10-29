---
title: "Stage Control: Modelling a Planar Precision Stage from First Principles"
pubDate: 2026-11-09
tags: [control-theory, system-modeling, dynamic-systems, mechatronics]
description: "Building a simplified 3-DOF planar XY-θz positioning stage from geometry and physics upward — with every number traced to an assumption, a derivation, or a published source."
---
## 1. Introduction: Taking a Precision Stage Apart — Without Touching It

Some machines are so precise that they feel closer to physics experiments than to everyday engineering. Semiconductor lithography, wafer inspection and wafer handling all depend on one deceptively simple idea: move a delicate object with extreme accuracy, without ever touching it. Here is what that looks like in one of the most advanced machines ever built:

<div style="display:flex; justify-content:center; margin:1.5rem 0;">
  <iframe
    style="width:100%; aspect-ratio:16 / 9; border:0; border-radius:6px;"
    src="https://www.youtube-nocookie.com/embed/v9Pg92cdJa4"
    title="Why is the wafer stage important in High NA EUV lithography? | ASML"
    loading="lazy"
    referrerpolicy="strict-origin-when-cross-origin"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen>
  </iframe>
</div>

If you have just watched that, it is a good moment to lower your expectations bro :. We are not going to build that machine, or anything close to it. Its stage has more degrees of freedom,thermal management,flexible structural dynamics and overall complexity.

What we *can* do is take the core idea apart and rebuild it ourselves, from first principles: a simplified planar stage, small enough to reason about from end to end, with plenty of assumptions to keep the scope manageable. The point is to learn, to understand how such a system works from the inside and to exercise our engineering skills on a problem that deserves them.

### 1.1 What we want to achieve

1. **Understand the machine.** How a contactless precision stage holds its position at all: what pushes it, what measures it, and why it needs feedback.
2. **Model it from first principles.** Start from geometry, magnets and Newton, not from a transfer function someone hands us, and arrive at the equations of motion.
3. **Trust the model.** Check it against situations whose answer we already know, before using it for anything.
4. **Control it.** Use the model to try simple control ideas and see what each one buys.
5. **Keep it honest.** Every number traced to its source; every simplification stated, so we know what the results are worth.

### 1.2 What we keep, and what we leave out

We keep only the essential in-plane problem of a wafer-type stage, a simplified 3-DOF $XY\text{-}\theta_z$ positioning stage:

- Move in $x$.
- Move in $y$.
- Rotate slightly in $\theta_z$.
- Do it contactlessly.
- Know where you are.
- Control it.

Everything else like the vertical directions, the flexible structure, heat, the real sensor electronics, are left out on purpose.

### 1.3 The one rule

The rule for the whole project is simple: **no mystery numbers**. Every value is either assumed with a reason, derived from physics or geometry, derived from an assumption, or taken from a published source (section 3).

<blockquote>
  <strong>Before controlling a precision stage, understand where its forces enter, where its measurements come from, and how its geometry becomes dynamics.</strong>
</blockquote>

## 2. Why Model a Wafer-Type Stage?

Wafer stages are easy to underestimate. From the outside, they look like a platform that slides around. From the inside, they are one of the most demanding mechatronic systems you can build.

A modern semiconductor machine needs to position a wafer with extreme accuracy while moving quickly, settling quickly and avoiding contact. It cannot rely on mechanical rails, gears or friction in the usual sense. Instead, it floats, pushes and measures continuously.

The core ingredients are always the same:

- **A light, stiff moving body**, because every gram must be accelerated and stopped precisely.
- **Contactless guidance**, often an air bearing, which supports the payload without mechanical contact.
- **Contactless actuation**, often voice coils, which convert current directly into force.
- **High-resolution encoders**, because a controller can only regulate what it can measure.
- **Feedback control**, because with no meaningful mechanical stiffness in the plane, nothing holds the stage still by itself.

That last point is the interesting one. The air bearing supports the stage vertically and constrains tilt, but in the plane it provides almost no stiffness. If you want the stage to stay at a position, you cannot rely on the bearing. You need sensors, actuators and feedback, and that is the problem the rest of this post works through.

## 3. The Rule: Every Number Has a Story

Engineering models fail in a quiet way. A number appears in a spreadsheet, gets copied into a simulation, then gets copied into a report. Eventually, nobody remembers where it came from, or whether it was ever justified.

This project tries to avoid that.

Every quantity in the model belongs to one of four categories:

| Category | What it means |
|---|---|
| **A — Assumed** | A design choice made on purpose, with a stated reason. |
| **DE — Derived** | A result calculated directly from geometry or an exact physical law — nothing approximated on the way. |
| **DFA — Derived-from-assumed** | A calculated result that also rests on a modelling assumption — a material value, a simplification, a mass split. |
| **P — Published** | A value taken from a datasheet, patent, paper or standard, with its source and version recorded. |

These categories matter because they tell you how much to trust a number.

An **assumed** value is a design decision. It may be reasonable, but it is still a choice.

A **derived** value follows from something already known: geometry, a physical law, or a documented calculation.

A **derived-from-assumed** value is more subtle. It may be calculated correctly, but its accuracy is limited by the assumptions behind it. For example, a computed magnetic force constant can be perfectly consistent with the assumed magnet grade, gap and coil geometry — while still being wrong if the real magnetic circuit differs.

A **published** value comes from an external source. It is useful, but it still needs context: which document, which version, which operating condition, and which definition of the quantity.

This discipline is not bureaucracy. It is what makes the model honest.

It also makes the project easier to improve. Later, when an assumed magnet grade is replaced with a real one, or an estimated inertia is replaced with a CAD-derived value, we know exactly which results are affected.

<blockquote>
  A model is not just a set of equations. It is a chain of decisions and every decision should be visible.
</blockquote>

From here, the actual work begins: the system and its design values (section 4), how a voice coil turns current into force (section 5), and how the whole plate moves (section 6).

## 4. The System Being Modelled

This section lists the parts and every design choice, and says where each one comes from. Tags as in section 3: **[A]** assumed, **[P]** published, **[DE]** derived from geometry or an exact law, **[DFA]** derived but resting on a modelling assumption. The sheets show only what is needed to follow the text; everything else is worked out below.

<figure>
  <img src="/planar_stage_system/sheet1a_top_view.png" alt="Sheet 1a — top view of the stage" />
</figure>

### 4.1 The parts

- **Platform.** A square plate, 150 mm wide and 25 mm thick **[A]**, pocketed underneath to save mass. It is the only part that moves.
- **Air bearings.** Four pads under the plate blow a thin film of air between plate and base ([air bearing](https://en.wikipedia.org/wiki/Air_bearing)). The film carries the weight and keeps the plate flat ($z$, $\theta_x$, $\theta_y$). In the plane it gives no spring and almost no friction (section 6.6), nothing holds $x$, $y$ and $\theta_z$ except the coils and the encoders.
- **Voice coils.** Four of them, two pushing along $x$ (X1, X2) and two along $y$ (Y1, Y2). The coil rides on an arm fixed to the plate; the magnets and steel stand on the base. Each coil pushes along a line at distance $a = 55$ mm from the centre **[A]** (red dotted lines on sheet 1a). The layout of one actuator is a flat coil between two rows of magnets of opposite polarity, inside a steel core, which is a common one; inspired from ASML's Lorentz-actuator patent [1].
- **Encoders.** Four heads, E1–E4, sit in the plate's underside where the coil lines cross, at the corners $(\pm a, \pm a)$. Each looks down at a grid plate fixed in the base and reads how far its own point has moved in $x$ and in $y$. The idea of four two-axis heads reading a grid plate is taken from ASML's NXT wafer stages [2].

<figure>
  <img src="/planar_stage_system/sheet1b_section.png" alt="Sheet 1b — section A–A through coil X1 and encoder heads E2, E1" />
</figure>

The section shows two details the model relies on. The coil pushes at the height of the centre of mass $G$, so its force cannot tip the plate, only push it in the plane. And the heads move with the plate while the grid plates stay with the base, so each head measures the plate's motion directly.

### 4.2 Where the design values come from

| Value | Choice | Why |
|---|---|---|
| Plate size $L$ | 150 mm **[A]** | Room for four heads and four coil arms, while keeping the coils in proportion to the plate. |
| Coil lines $a$ | 55 mm **[A]** | Far from the centre, a longer lever arm gives more turning moment per coil — while leaving the corners for the encoder heads. |
| Moving mass $m$ | 1 kg **[A]** | A pocketed light-alloy plate with its coils and heads; checked in 6.7. |
| Travel in $x$, $y$ | ±2.5 mm **[A]** | A *fine* stage: in a real machine a coarse stage does the long moves and the fine stage corrects the last few millimetres. |
| Rotation $\theta_z$ | ±1.5 mrad **[A]** | Only small corrections are needed; lithography encoder heads are designed for about this much rotation [3]. |
| Encoder step | 20 nm **[A]** | Between a catalogue two-axis grid encoder, finest step 50 nm [4], and lithography encoders, below 1 nm [2]. |

Why two-axis heads and not ordinary linear scales: a linear readhead must stay within about ±0.5 mm of its scale's centre line [5]. Our stage moves ±2.5 mm sideways, so a linear scale would lose its signal. A grid lets the head move freely in both directions.

## 5. How a Voice Coil Makes Force

Before we can write down how the plate moves, we need the law that turns a coil current into a force. This section builds it from the magnets up.

<figure>
  <img src="/planar_stage_system/sheet2a_field.png" alt="Sheet 2a — voice coil X1, detail of section A–A with computed flux lines, and the coil from above" />
</figure>

### 5.1 What we assume

Every number in this section comes from this list.

| Assumption | Value | Why |
|---|---|---|
| Magnet material | NdFeB, grade N42 **[A]** | a common, strong grade ([neodymium magnet](https://en.wikipedia.org/wiki/Neodymium_magnet)) |
| Magnet remanence $B_r$ | 1.3 T at 20 °C **[A]** | typical for N42; suppliers list about 1.28–1.32 T ([remanence](https://en.wikipedia.org/wiki/Remanence)) |
| Magnet relative permeability $\mu_r$ | 1.05 **[A]** | typical for NdFeB: a magnet lets flux through almost like air |
| Magnet block | 18 × 5 mm, 40 mm long **[A]** | four blocks: two above, two below the coil |
| Gap between the N and S blocks | 4 mm **[A]** | separates the two field directions |
| Gap between magnet faces | 5 mm **[A]** | 3 mm coil + 1 mm clearance on each side |
| Steel plates | 12 mm thick, $\mu_r = 2000$, no saturation **[A]** | ordinary soft steel, checked in 5.3 |
| Coil legs | 10 × 3 mm **[A]** | narrower than the 18 mm magnets, so they can move and stay over them |
| Leg length over the magnets $l$ | 30 mm **[A]** | |
| Wire | 0.3 mm copper **[A]** | a common size for small coils |
| Copper fill of a leg | 55 % **[A]** | the rest is insulation and gaps between round wires |
| Copper resistivity $\rho$, density | $1.72 \times 10^{-8}$ Ω·m, 8960 kg/m³ **[P]** | material data at 20 °C ([resistivity](https://en.wikipedia.org/wiki/Electrical_resistivity_and_conductivity)) |

### 5.2 The force on one coil

A straight wire of length $l$ carrying current $i$ across a magnetic field $B$ at right angles feels a force $i\,l\,B$, perpendicular to both — the [Lorentz force](https://en.wikipedia.org/wiki/Lorentz_force) on a current. The coil has $N$ turns, so each leg carries $N i$. Under the left leg the field points up, under the right leg down — and the current also runs in opposite directions in the two legs, into the page on the left and out on the right. Both reverse together, so both legs push the same way:

$$
F = N\, i\, l\, B_{\text{left}} - N\, i\, l\, B_{\text{right}} = \underbrace{N\, l\,(B_{\text{left}} - B_{\text{right}})}_{K_f}\; i
$$

($B_{\text{right}}$ is negative, so the minus sign adds the two pushes.) $K_f$ is the **force constant**, in newtons per ampere. We need two things for it: the field under each leg, and the number of turns.

<!-- TODO fig: one coil from the side, the two legs with ⊗ / ⊙ current, B up under the left leg and down under the right, and the two equal force arrows. -->

### 5.3 The field by hand

Follow the flux around one loop in sheet 2a: up through the left magnet pair and its gap, across the top steel, down through the right pair and its gap, back through the bottom steel, a [magnetic circuit](https://en.wikipedia.org/wiki/Magnetic_circuit). There is no current along that loop, so by [Ampère's law](https://en.wikipedia.org/wiki/Amp%C3%A8re%27s_circuital_law) the field strength $H$ adds up to zero around it. Three simplifications make this solvable by hand:

1. the steel is perfect, so it needs no $H$;
2. no flux leaks out of the loop;
3. magnets and gaps have the same cross-section, so the flux density $B$ is the same in all of them.

Along the loop there are two gaps ($\sum g = 10$ mm) and four magnets ($\sum t_m = 20$ mm):

- in a gap, $H = B/\mu_0$;
- in a magnet, the flux density is its own remanence plus what the field adds, $B = \mu_0\mu_r H + B_r$, so $H = (B - B_r)/(\mu_0\mu_r)$.

Adding $H$ times length around the loop and setting it to zero:

$$
\frac{B}{\mu_0}\sum g + \frac{B - B_r}{\mu_0 \mu_r}\sum t_m = 0 \quad\Rightarrow\quad B_g = B_r\,\frac{\sum t_m}{\sum t_m + \mu_r \sum g} = 1.3 \times \frac{20}{20 + 1.05 \times 10} \approx 0.85\ \text{T} \quad \textbf{[DFA]}
$$

Checking simplification 1: all the flux of an 18 mm wide magnet passes along the 12 mm thick steel plate, so the steel carries $0.85 \times 18/12 \approx 1.3$ T, below the roughly 1.5 T where soft steel starts to saturate. Perfect steel is a fair simplification.

What the hand calculation cannot give is the *shape* of the field: simplifications 2 and 3 make it the same everywhere in the gap. Near the magnet edges it actually fades, and that is what matters once the coil moves. For the shape we compute the field.

<!-- TODO fig: sheet 2a with the one flux loop of the hand calculation highlighted, labelled with Σg and Σt_m. -->

### 5.4 The field by computer

**The idea.** Sheet 2a is a slice through the actuator along the force. The magnets are 40 mm long into the page, eight times the gap, so the field is nearly the same in every such slice and one slice is enough. In a slice the whole field can be described by one number per point, the [magnetic vector potential](https://en.wikipedia.org/wiki/Magnetic_vector_potential) $A$. Two facts make it useful: the flux lines are the lines where $A$ is constant, and the field is its slope,

$$
B_x = \frac{\partial A}{\partial y}, \qquad B_y = -\frac{\partial A}{\partial x}
$$

**What is solved.** The same Ampère's law as in 5.3 — but around every small square of the slice instead of once around the big loop. Cover the slice with 0.2 mm squares and give each its material from 5.1. For each square, $H$ summed around its four edges must equal the current inside it. With $H$ written through $A$, that is one linear equation linking the square to its four neighbours. There is no coil current in this solve; the only "currents" are the magnets' own — a magnet behaves like a thin sheet of current along its left and right sides, which is what makes it a source. About 300 000 squares give 300 000 linear equations, solved together in a few seconds ([finite differences](https://en.wikipedia.org/wiki/Finite_difference_method)). On the outer edge of the window $A = 0$, which means no flux crosses it; the window is far enough out that this does not change the result.

**What comes out.** Everything on sheets 2a and 2b is computed this way; only the outline of the parts is drawn by hand:

- the flux lines on sheet 2a are lines of constant $A$ at equal steps, so the same flux runs between neighbouring lines and where they crowd the field is strong;
- the field along the coil on sheet 2b (top) is $B_y$ along the coil's middle line;
- the force constant on sheet 2b (bottom) comes from that same field, as described in 5.6.

**Does it agree with the hand calculation?** Averaged over each coil leg, the solver gives $B_{\text{left}} = 0.82$ T and $B_{\text{right}} = -0.82$ T **[DFA]**; the hand calculation gave 0.85 T. They match. The solver is about 4 % lower because it drops simplification 2 and sees the little flux that leaks around the magnet edges instead of crossing the gap. (A grid twice as fine gives the same result, so 0.2 mm is fine enough.)

<!-- TODO fig: one grid square with its four neighbours, H along each edge, and the magnet edge acting as a current sheet. -->

The full solver is short enough to show:

<details>
<summary>Python: 2-D field of one voice coil and its force constant (≈ 60 lines)</summary>

```python
# 2-D field of one voice coil (slice along the force) and its force constant K_f(dx).
import numpy as np, scipy.sparse as sp, scipy.sparse.linalg as spla

MU0 = 4e-7 * np.pi
h = 0.2e-3                                   # grid step [m]: 0.2 mm, lines up with every part edge
BR, MU_MAG, MU_FE = 1.3, 1.05, 2000.0        # magnet remanence [T], magnet and steel relative permeability
W_M, T_M, GAP_NS, GAP = 18e-3, 5e-3, 4e-3, 5e-3   # magnet width, thickness, N-S gap, gap between magnet faces
T_FE, X_FE = 12e-3, 30e-3                    # steel plate thickness, half length
W_C, T_C, L_LEG, N = 10e-3, 3e-3, 30e-3, 233 # coil leg width, thickness, length over the magnets, turns
PITCH = W_M + GAP_NS                         # distance between the two magnet columns (= between coil legs)

# 1. grid and materials
x = np.arange(-70e-3, 70e-3 + h / 2, h); y = np.arange(-45e-3, 45e-3 + h / 2, h)
X, Y = np.meshgrid(x, y); ny, nx = X.shape
yb, yt = -GAP / 2 - T_M, GAP / 2 + T_M                       # outer faces of the bottom / top magnets
steel = (np.abs(X) <= X_FE) & (((Y >= yb - T_FE) & (Y < yb)) | ((Y > yt) & (Y <= yt + T_FE)))
steel |= (X >= -X_FE - 6e-3) & (X < -X_FE) & (Y >= yb - T_FE) & (Y <= yt + T_FE)        # back wall
nu = np.full(X.shape, 1 / MU0); nu[steel] = 1 / (MU0 * MU_FE)
Br = np.zeros(X.shape)                                       # built-in field of the magnets (+ up, - down)
for xc, sign in ((-PITCH / 2, +1), (PITCH / 2, -1)):
    mag = (np.abs(X - xc) <= W_M / 2) & (((Y >= yb) & (Y <= -GAP / 2)) | ((Y >= GAP / 2) & (Y <= yt)))
    nu[mag] = 1 / (MU0 * MU_MAG); Br[mag] = sign * BR

# 2. Ampère's law around every square: H around its edges = current inside (here: only the magnets' edges)
idx = np.arange(nx * ny).reshape(ny, nx)
rows, cols, vals, diag = [], [], [], np.zeros(nx * ny)
for p, q, w in ((idx[:, :-1], idx[:, 1:], 2 / (1 / nu[:, 1:] + 1 / nu[:, :-1])),      # nu at each face:
                (idx[:-1, :], idx[1:, :], 2 / (1 / nu[1:, :] + 1 / nu[:-1, :]))):     # harmonic mean of the two cells
    p, q, w = p.ravel(), q.ravel(), w.ravel() / h**2
    rows += [p, q]; cols += [q, p]; vals += [-w, -w]
    np.add.at(diag, p, w); np.add.at(diag, q, w)
K = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(nx * ny,) * 2) + sp.diags(diag)
nB = nu * Br
src = np.zeros((ny, nx)); src[:, 1:-1] = (nB[:, 2:] - nB[:, :-2]) / (2 * h)  # magnet edges act as current sheets

# 3. A = 0 on the outer edge; solve the rest in one go
inner = np.ones((ny, nx), bool); inner[[0, -1], :] = False; inner[:, [0, -1]] = False; inner = inner.ravel()
A = np.zeros(nx * ny); A[inner] = spla.spsolve(K[inner][:, inner].tocsc(), src.ravel()[inner]); A = A.reshape(ny, nx)
By = -np.gradient(A, h, axis=1)                              # vertical field B_y = -dA/dx

# 4. field under the legs, and K_f as the coil slides by dx
def leg(xc):                                                 # mean B_y over a leg centred at xc
    m = (np.abs(X - xc) <= W_C / 2 + 1e-9) & (np.abs(Y) <= T_C / 2 + 1e-9)
    return By[m].mean()
def Kf(dx):
    return N * L_LEG * (leg(-PITCH / 2 + dx) - leg(PITCH / 2 + dx))

print(f"B_left = {leg(-PITCH/2):.3f} T, B_right = {leg(PITCH/2):.3f} T, K_f0 = {Kf(0):.2f} N/A")
for dx in (1e-3, 2e-3, 2.6e-3, 4e-3):
    print(f"dx = {dx*1e3:.1f} mm: K_f/K_f0 = {Kf(dx)/Kf(0):.4f}")
```

</details>

### 5.5 The coil: from the wire to $K_f$

From the assumptions in 5.1, one step at a time:

1. Area of one wire: $\pi \times 0.3^2/4 = 0.0707\ \text{mm}^2$.
2. Copper in one leg: $10 \times 3 = 30\ \text{mm}^2$, 55 % of it copper: $16.5\ \text{mm}^2$.
3. Turns: $N = 16.5 / 0.0707 = 233$ **[DFA]**.
4. Length of one turn, taken along the middle of the winding: two 30 mm legs and two 22 mm ends (leg centre to leg centre: 18 mm magnet + 4 mm gap), $2 \times (30 + 22) = 104$ mm.
5. Length of wire: $233 \times 0.104 = 24.2$ m.
6. Resistance: $R = \rho \times \text{length}/\text{area} = 1.72 \times 10^{-8} \times 24.2 / (0.0707 \times 10^{-6}) = 5.9\ \Omega$ **[DFA]**.
7. Force constant, coil centred: $K_{f,0} = N\, l\,(B_{\text{left}} - B_{\text{right}}) = 233 \times 0.030 \times 1.636 = 11.4$ N/A **[DFA]**.

<figure>
  <img src="/planar_stage_system/sheet2b_gain.png" alt="Sheet 2b — field along the coil plane and the force constant over the coil position" />
</figure>

### 5.6 When the coil moves

The coil is copper and air, which let flux through just like air, so the coil does not change the magnets' field, moving it only changes where its legs sit in that field. So $K_f$ at any position comes from the one field already computed: slide the two leg areas by $\Delta x$, average $B_y$ over them again, and apply $K_f = N\,l\,(B_{\text{left}} - B_{\text{right}})$. That is sheet 2b, bottom.

How far does a coil move? The plate travels ±2.5 mm, and turning by $\theta_z$ moves each coil a further $a\,\theta_z$ along its line (its lever arm times the angle; for these small angles $\sin\theta_z \approx \theta_z$ is exact to better than a millionth):

$$
\Delta x_{\max} = 2.5\ \text{mm} + 55\ \text{mm} \times 1.5 \times 10^{-3} \approx 2.6\ \text{mm} \quad \textbf{[DE]}
$$

That is the green band. Near its edges the outer side of each leg reaches the fading field at the magnet edge, and $K_f$ is about 3 % below its centred value **[DFA]**. Over this range the curve is very close to a parabola, the shape any smooth, symmetric curve takes near its peak:

$$
K_f(\Delta x) \approx K_{f,0}\,\big(1 - k\,\Delta x^2\big), \qquad k \approx 0.0045\ \text{mm}^{-2} \quad \textbf{[DFA]}
$$

fitted to the solver with an error below 0.4 %. This leaves two honest choices for the plant model:

- **Constant $K_{f,0}$.** The change is at most about 3 %, the same order as the tolerance on the magnets themselves, which no model knows exactly anyway, and the controller simply has to tolerate it. This is what we use.
- **The parabola, per coil.** Each coil gets its own $K_f(\Delta x_j)$, with $\Delta x_j$ its own position in its magnets. Easy to add later if a feedforward needs the accuracy.

## 6. The Plant Model: From Drawing to Equations

Now everything is in place to connect what we put in, the four coil currents, with what we get out, where the plate is.

### 6.1 What describes the plate

Three numbers: where its centre $G$ is, and how far it has turned, all measured in the fixed frame of the base:

$$
\mathbf{q} = \begin{bmatrix} x & y & \theta_z \end{bmatrix}^\top
$$

### 6.2 Step 1 — read each coil off the drawing

Each coil pushes at a point $\mathbf{p}$ on the plate in a direction $\mathbf{d}$, both measured from $G$ with the plate at rest. With $c = L/2 + 30$ mm the distance from the centre to a coil:

| Coil | Point $\mathbf{p}$ | Direction $\mathbf{d}$ |
|---|---|---|
| X1 | $(-c,\ +a)$ | $(1,\ 0)$ |
| X2 | $(+c,\ -a)$ | $(1,\ 0)$ |
| Y1 | $(+a,\ +c)$ | $(0,\ 1)$ |
| Y2 | $(-a,\ -c)$ | $(0,\ 1)$ |

### 6.3 Step 2 — what one force does to the plate

A force $f$ along $\mathbf{d}$, applied at $\mathbf{p}$, pushes the plate and turns it about $G$. The push is $f\mathbf{d}$; the turning moment ([torque](https://en.wikipedia.org/wiki/Torque)) is the [cross product](https://en.wikipedia.org/wiki/Cross_product) of the point and the force, which in the plane is a single number:

$$
F_x = d_x f, \qquad F_y = d_y f, \qquad M_z = (p_x d_y - p_y d_x)\, f
$$

Sliding a force along its own line does not change $M_z$ (the change in $\mathbf{p}$ is parallel to $\mathbf{d}$, and a vector crossed with itself is zero), so $c$ drops out: only the line of action matters.

<!-- TODO fig: the plate with one coil force, its line of action, and the perpendicular lever arm from G. -->

### 6.4 Step 3 — apply it to each coil and add up

| Coil | $F_x$ | $F_y$ | $M_z = p_x d_y - p_y d_x$ |
|---|---|---|---|
| X1 | $f_{X1}$ | 0 | $(-c)(0) - (+a)(1) = -a$, so $-a f_{X1}$ |
| X2 | $f_{X2}$ | 0 | $(+c)(0) - (-a)(1) = +a$, so $+a f_{X2}$ |
| Y1 | 0 | $f_{Y1}$ | $(+a)(1) - (+c)(0) = +a$, so $+a f_{Y1}$ |
| Y2 | 0 | $f_{Y2}$ | $(-a)(1) - (-c)(0) = -a$, so $-a f_{Y2}$ |

Adding the columns:

$$
F_x = f_{X1} + f_{X2}, \qquad F_y = f_{Y1} + f_{Y2}, \qquad M_z = a\,(-f_{X1} + f_{X2} + f_{Y1} - f_{Y2})
$$

The third line is how the plate turns: X1 sits above the centre and X2 below it, so pushing them in opposite directions gives a moment but no net force. $\theta_z$ is driven by the same four coils. As a matrix, the **input matrix**, which says where the forces enter:

$$
\begin{bmatrix} F_x \\ F_y \\ M_z \end{bmatrix} = B_0\, \mathbf{f}, \qquad B_0 = \begin{bmatrix} 1 & 1 & 0 & 0 \\ 0 & 0 & 1 & 1 \\ -a & a & a & -a \end{bmatrix}, \qquad \mathbf{f} = \begin{bmatrix} f_{X1} \\ f_{X2} \\ f_{Y1} \\ f_{Y2} \end{bmatrix}
$$

### 6.5 Step 4 — the coils turn with the plate

When the plate turns by $\theta_z$, the coils turn with it. The magnets' field stays vertical, but the wire turns, so the force direction turns too: $\mathbf{d} \to R(\theta_z)\mathbf{d}$, with the [rotation matrix](https://en.wikipedia.org/wiki/Rotation_matrix)

$$
R(\theta_z) = \begin{bmatrix} \cos\theta_z & -\sin\theta_z \\ \sin\theta_z & \cos\theta_z \end{bmatrix}
$$

The point turns as well, $\mathbf{p} \to R(\theta_z)\mathbf{p}$. So the pushes are rotated, but the moment is not: turning the point and the force by the same angle leaves the angle between them, and their cross product, unchanged:

$$
\begin{bmatrix} F_x \\ F_y \\ M_z \end{bmatrix} = B(\theta_z)\, \mathbf{f}, \qquad B(\theta_z) = \begin{bmatrix} R(\theta_z) & \mathbf{0} \\ \mathbf{0} & 1 \end{bmatrix} B_0
$$

<!-- TODO fig: the plate turned by θz (exaggerated), with the X1 force arrow turned with it. -->

### 6.6 Step 5 — the only other force: air drag

Air is slightly [viscous](https://en.wikipedia.org/wiki/Viscosity), so a film that is sheared resists. Under a pad the plate moves at speed $v$ and the base stands still, so across the thin film (thickness $h_f$) the air speed goes linearly from $v$ to zero — [Couette flow](https://en.wikipedia.org/wiki/Couette_flow). The shear stress is then $\mu_{\text{air}}\, v / h_f$, and over the pad area it adds up to a drag force proportional to the speed:

$$
F_{\text{drag}} = b\, v, \qquad b = \frac{\mu_{\text{air}}\, A_p}{h_f}
$$

For turning at rate $\dot\theta_z$, a bit of film at distance $r$ from $G$ moves at $r\dot\theta_z$ and its drag acts with lever arm $r$, so it resists with $\frac{\mu_{\text{air}}}{h_f}\, r^2\,\dot\theta_z$ per unit area. Adding this over a round pad of radius $R_p$ whose centre is at $r_p$ from $G$ gives $\frac{\mu_{\text{air}}}{h_f}\big(\pi R_p^2 r_p^2 + \tfrac{\pi R_p^4}{2}\big)$ — the first term as if the whole pad sat at its centre, the second from the pad turning about its own centre (the [parallel axis theorem](https://en.wikipedia.org/wiki/Parallel_axis_theorem) for areas). Over the four pads:

$$
M_{\text{drag}} = b_\theta\, \dot\theta_z, \qquad b_\theta = 4\,\frac{\mu_{\text{air}}}{h_f}\left(\pi R_p^2\, r_p^2 + \frac{\pi R_p^4}{2}\right)
$$

Because the pads sit symmetrically around $G$, moving does not cause a drag moment and turning does not cause a net drag force — the two stay separate.

| Quantity | Value | Tag |
|---|---|---|
| Air viscosity $\mu_{\text{air}}$ (20 °C) | $1.8 \times 10^{-5}$ Pa·s | **[P]** material data |
| Film thickness $h_f$ | 5 µm | **[A]** typical for porous air pads |
| Pad radius $R_p$ (Ø30 mm) | 15 mm | **[A]** sheet 1a |
| Pad centre from $G$, $r_p$ | $\sqrt{25^2 + 25^2} = 35.4$ mm | **[A]** sheet 1a |
| Total pad area $A_p = 4\pi R_p^2$ | $2.83 \times 10^{-3}$ m² | **[DE]** |
| Translational drag $b$ | $0.010$ N·s/m | **[DFA]** |
| Rotational drag $b_\theta$ | $1.4 \times 10^{-5}$ N·m·s | **[DFA]** |

How small is that? Left alone, the drag would take $m/b \approx 100$ s to slow the plate down noticeably, while a move lasts tens of milliseconds. The drag is real and stays in the model, but the plate behaves almost like a free mass.

<!-- TODO fig: side view of one pad over the base, with the linear air-speed profile across the film. -->

### 6.7 Step 6 — Newton

The centre of mass accelerates with the total force over the mass; the rotation accelerates with the total moment about $G$ over the [moment of inertia](https://en.wikipedia.org/wiki/Moment_of_inertia) $J$. For a body that moves in the plane and turns only about the vertical, these two laws ([Newton–Euler](https://en.wikipedia.org/wiki/Newton%E2%80%93Euler_equations)) are exact — no extra terms appear:

$$
m\ddot{x} = F_x - b\,\dot{x}, \qquad m\ddot{y} = F_y - b\,\dot{y}, \qquad J\ddot{\theta}_z = M_z - b_\theta\,\dot{\theta}_z
$$

The mass is our choice, $m = 1$ kg **[A]**. The inertia follows from where that mass sits. A uniform square plate of side $L$, of any thickness, turning about its centre has $J = m_p L^2/6$ (from the [perpendicular axis theorem](https://en.wikipedia.org/wiki/Perpendicular_axis_theorem): $m_p L^2/12$ about each in-plane axis, added). Small parts far from the centre are treated as point masses, each adding its mass times its distance squared:

| Part | Mass | Distance from $G$ | Tag |
|---|---|---|---|
| Four coils with their arms | 4 × 30 g, of which 15 g copper each (8960 kg/m³ × 24.2 m of wire, from 5.5) | $\sqrt{105^2 + 55^2} = 118.5$ mm | **[A]** / **[DFA]** |
| Four encoder heads | 4 × 20 g | $\sqrt{55^2 + 55^2} = 77.8$ mm | **[A]** |
| Plate | $1 - 0.12 - 0.08 = 0.80$ kg, pocketed evenly | spread over the plate | **[DFA]** |

$$
J = \frac{0.80 \times 0.150^2}{6} + 0.12 \times 0.1185^2 + 0.08 \times 0.0778^2 = 0.0030 + 0.0017 + 0.0005 \approx 0.0052\ \text{kg·m}^2 \quad \textbf{[DFA]}
$$

A solid aluminium plate of this size would weigh $2700 \times 0.15 \times 0.15 \times 0.025 = 1.52$ kg, so 0.80 kg means pocketing it to about half — a normal amount for a light stage. 1 kg is a consistent choice.

<!-- TODO fig: top view with the mass split (plate, four coils, four heads) and their distances from G. -->

With $M = \operatorname{diag}(m, m, J)$ and $D = \operatorname{diag}(b, b, b_\theta)$:

$$
M\ddot{\mathbf{q}} + D\dot{\mathbf{q}} = B(\theta_z)\, \mathbf{f}
$$

### 6.8 Step 7 — from current to force

From section 5, each coil gives $f_j = K_f\, i_j$.

<blockquote>
  <strong>Note.</strong> We use the centred value $K_{f,0}$ for all four coils; the small drop toward the ends of travel (section 5.6) makes this term slightly nonlinear.
</blockquote>

**Why currents are the inputs.** Something has to make the coil current follow a command: the *current amplifier*. It is a separate electronic module with its own small control loop — it measures the coil current and keeps adjusting its output voltage until the current equals the command. Inside that module, the voltage must cover the coil's resistance, its inductance and the [back-EMF](https://en.wikipedia.org/wiki/Counter-electromotive_force) the moving coil generates in the field. Designing that loop is a project of its own, and good current amplifiers for voice coils are standard products, so it is outside our scope. We take the amplifier as given: it delivers the commanded current, quickly enough that the delay does not matter for the plate. The four currents are therefore the inputs of our plant.

### 6.9 The complete model

The input is the four coil currents $\mathbf{i} = [\,i_{X1}\ i_{X2}\ i_{Y1}\ i_{Y2}\,]^\top$. The output is where the plate is: the position and angle of its centre, $\mathbf{q} = [\,x\ y\ \theta_z\,]^\top$. Putting $\mathbf{f} = K_{f,0}\,\mathbf{i}$ into step 6:

$$
M\ddot{\mathbf{q}} + D\dot{\mathbf{q}} = K_{f,0}\, B(\theta_z)\, \mathbf{i}
$$

With every element written out:

$$
\begin{bmatrix} m & 0 & 0 \\ 0 & m & 0 \\ 0 & 0 & J \end{bmatrix}
\begin{bmatrix} \ddot x \\ \ddot y \\ \ddot\theta_z \end{bmatrix}
+
\begin{bmatrix} b & 0 & 0 \\ 0 & b & 0 \\ 0 & 0 & b_\theta \end{bmatrix}
\begin{bmatrix} \dot x \\ \dot y \\ \dot\theta_z \end{bmatrix}
=
K_{f,0}
\begin{bmatrix}
\cos\theta_z & \cos\theta_z & -\sin\theta_z & -\sin\theta_z \\
\sin\theta_z & \sin\theta_z & \cos\theta_z & \cos\theta_z \\
-a & a & a & -a
\end{bmatrix}
\begin{bmatrix} i_{X1} \\ i_{X2} \\ i_{Y1} \\ i_{Y2} \end{bmatrix}
$$

(the $B$ matrix is $\operatorname{diag}(R(\theta_z), 1)\,B_0$ multiplied out: its first row is $\cos\theta_z$ times the first row of $B_0$ minus $\sin\theta_z$ times the second). Line by line:

$$
\begin{aligned}
m\ddot x + b\dot x &= K_{f,0}\,\big[\cos\theta_z\,(i_{X1} + i_{X2}) - \sin\theta_z\,(i_{Y1} + i_{Y2})\big] \\
m\ddot y + b\dot y &= K_{f,0}\,\big[\sin\theta_z\,(i_{X1} + i_{X2}) + \cos\theta_z\,(i_{Y1} + i_{Y2})\big] \\
J\ddot\theta_z + b_\theta\dot\theta_z &= K_{f,0}\; a\,(-i_{X1} + i_{X2} + i_{Y1} - i_{Y2})
\end{aligned}
$$

To simulate it, write it as six first-order equations ([state-space form](https://en.wikipedia.org/wiki/State-space_representation)). With the state $\mathbf{z} = [\,x\ y\ \theta_z\ \dot x\ \dot y\ \dot\theta_z\,]^\top$:

$$
\dot{\mathbf{z}} = \begin{bmatrix} \dot{\mathbf{q}} \\ M^{-1}\big(K_{f,0}\, B(\theta_z)\, \mathbf{i} - D\dot{\mathbf{q}}\big) \end{bmatrix}, \qquad \mathbf{y} = \mathbf{q}
$$

Six states, four inputs, three outputs. It is nonlinear only through $\theta_z$, which turns the coil forces.

| Parameter | Value | Where from |
|---|---|---|
| $m$ | 1 kg | **[A]** 4.2 |
| $J$ | 0.0052 kg·m² | **[DFA]** 6.7 |
| $b$ | 0.010 N·s/m | **[DFA]** 6.6 |
| $b_\theta$ | $1.4 \times 10^{-5}$ N·m·s | **[DFA]** 6.6 |
| $K_{f,0}$ | 11.4 N/A | **[DFA]** 5.5 |
| $a$ | 55 mm | **[A]** 4.2 |

**How the encoders fit in.** The heads do not read $\mathbf{q}$ directly. Head $i$, at corner $\mathbf{s}_i = (\pm a, \pm a)$, reads how far its own point has moved: $(x, y) + \big(R(\theta_z) - I\big)\mathbf{s}_i$. Turning the eight readings back into $\mathbf{q}$ is the controller's first job, so it belongs to the control part, not to the plant.

What the model leaves out: the plate bending, cables and hoses to the plate (a weak spring and extra drag), a centre of mass slightly off the plate centre, small differences between the four coils — and, as the next section shows, its own limits.

<!-- TODO fig: block diagram — four currents → K_f0 → B(θz) → M⁻¹ (with −D feedback) → ∫ → ∫ → q, with θz fed back into B. -->

### 6.10 Does it behave?

Before trusting the model, we put it through situations whose answer we know from plain physics, not from the model. If a run disagrees, a sign, a matrix entry or a unit is wrong. Each test aims at a different part of the equations:

| # | Input | Physics says | What it checks | Simulated |
|---|---|---|---|---|
| 1 | nothing, plate at rest | nothing moves: no force, and drag needs motion | no force from nowhere | all zero |
| 2 | squeeze $(-1, 1, -1, 1)$ A | nothing moves: $F_x = F_y = 0$, $M_z = a(1 + 1 - 1 - 1) = 0$ | the four columns of $B$ | all zero |
| 3 | X1 = X2 = 1 A, 10 ms | only $x$: $\tfrac12 \cdot \tfrac{2K_{f,0}}{m}t^2 = 1.14$ mm (moments cancel) | first row of $B$, $m$ | 1.13996 mm, $y = \theta_z = 0$ |
| 4 | Y1 = Y2 = 1 A, 10 ms | the same in $y$ — the Y pair is the X pair turned 90° | second row of $B$ | 1.13996 mm, $x = \theta_z = 0$ |
| 5 | X pair at −1 A | exactly reversed: force is proportional to current | linearity in $\mathbf{i}$ | −1.13996 mm |
| 6 | turning $(-1, 1, 1, -1)$ A, 5 ms | only $\theta_z$: $\tfrac12 \cdot \tfrac{4aK_{f,0}}{J}t^2 = 6.03$ mrad; net force zero at any angle | third row of $B$, $J$ | 6.029 mrad, $x = y = 0$ |
| 7 | X pair, plate turned 1.5 mrad | push follows the plate: $y/x = \tan 1.5\ \text{mrad}$ | the $\cos$, $\sin$ terms | equal to 15 digits |
| 8 | coasting 10 s, no current | $\dot x \propto e^{-bt/m}$, $\dot\theta_z \propto e^{-b_\theta t/J}$ (solution of $m\dot v = -bv$) | drag terms and signs | equal to 15 digits |
| 9 | mixed, changing currents, 50 ms | coil work = kinetic energy + drag loss ([energy conservation](https://en.wikipedia.org/wiki/Conservation_of_energy)) | $M$, $D$, $B$ together | equal to 9 digits |

The small gap in tests 3–5 (1.13996 instead of 1.14000 mm) is the drag, which the hand formula ignores: over 10 ms it should cost $bt/3m \approx 3 \times 10^{-5}$ of the travel, and that is exactly the difference.

All nine pass. Two things the tests made visible:

- **Rotation is very sensitive.** 1 A in the turning pattern turns the plate by 6 mrad in 5 ms — four times the whole ±1.5 mrad range. For the same 32 ms move time, a full 2.5 mm move needs about 0.43 A per coil, a full 1.5 mrad turn only about 12 mA. The controller's gains will differ a lot between the axes.
- **The model has no edges.** With a constant 1 A on the X pair the plate leaves the ±2.5 mm travel after 15 ms and simply keeps going. The real coil would run into the edge of its magnets, and its force would fade (section 5.6). The model is only valid inside the travel; a simulation must check that it stays there.

I really wanted to add plots of each of these runs, but they are all straight lines and parabolas, and the post is long enough already — the table says the same thing in less space. The script is short, so you can run it and plot whatever you like.

<!-- TODO fig (optional): one small 3×3 grid of the nine runs, x/y/θz against time, if a visual summary is wanted after all. -->

<details>
<summary>Python: the plant model and the tests (≈ 50 lines)</summary>

```python
import numpy as np
from scipy.integrate import solve_ivp

m, J, b, b_th, Kf0, a = 1.0, 0.0052, 0.0102, 1.39e-5, 11.4, 0.055   # section 6.9
M_inv, D = np.diag([1 / m, 1 / m, 1 / J]), np.diag([b, b, b_th])

def B(th):                                     # input matrix, coils turned with the plate
    c, s = np.cos(th), np.sin(th)
    return np.array([[c, c, -s, -s], [s, s, c, c], [-a, a, a, -a]])

def rhs(t, z, current):                        # z = (x, y, θz, ẋ, ẏ, θ̇z)
    q, qd = z[:3], z[3:]
    return np.concatenate([qd, M_inv @ (Kf0 * B(q[2]) @ current(t) - D @ qd)])

def sim(current, T, z0=(0, 0, 0, 0, 0, 0)):
    r = solve_ivp(rhs, (0, T), z0, args=(current,), rtol=1e-10, atol=1e-13, max_step=T / 200)
    return r.y[:, -1]                          # state at the end

const = lambda i: (lambda t: np.array(i, float))

print("1 rest      ", sim(const([0, 0, 0, 0]), 1.0)[:3])
print("2 squeeze   ", sim(const([-1, 1, -1, 1]), 0.1)[:3])
print("3 X pair    ", sim(const([1, 1, 0, 0]), 0.01)[:3], "expect x =", 0.5 * 2 * Kf0 / m * 0.01**2)
print("4 Y pair    ", sim(const([0, 0, 1, 1]), 0.01)[:3])
print("5 X reversed", sim(const([-1, -1, 0, 0]), 0.01)[:3])
print("6 turning   ", sim(const([-1, 1, 1, -1]), 0.005)[:3], "expect θz =", 0.5 * 4 * a * Kf0 / J * 0.005**2)
z = sim(const([1, 1, 0, 0]), 0.002, z0=(0, 0, 1.5e-3, 0, 0, 0))
print("7 turned    ", "y/x =", z[1] / z[0], "expect", np.tan(1.5e-3))
z = sim(const([0, 0, 0, 0]), 10.0, z0=(0, 0, 0, 0.01, 0, 1e-3))
print("8 coasting  ", z[3], "expect", 0.01 * np.exp(-b / m * 10), "|", z[5], "expect", 1e-3 * np.exp(-b_th / J * 10))

# 9 energy: coil work − drag loss = kinetic energy
cur = lambda t: 0.8 * np.array([np.sin(40 * t), 0.5, np.cos(25 * t), -0.3])
t = np.linspace(0, 0.05, 20001)
r = solve_ivp(rhs, (0, 0.05), np.zeros(6), args=(cur,), t_eval=t, rtol=1e-10, atol=1e-13, max_step=2.5e-4)
qd = r.y[3:]
P_in = np.einsum("ik,ik->k", qd, np.stack([Kf0 * B(r.y[2, k]) @ cur(t[k]) for k in range(len(t))], axis=1))
P_drag = np.einsum("ik,ij,jk->k", qd, D, qd)
E_kin = 0.5 * (m * qd[0, -1]**2 + m * qd[1, -1]**2 + J * qd[2, -1]**2)
print("9 energy    ", np.trapezoid(P_in - P_drag, t), "expect", E_kin)
```

</details>

```sh
1 rest       [0. 0. 0.]
2 squeeze    [0. 0. 0.]
3 X pair     [0.00113996 0.         0.        ] expect x = 0.0011400000000000002
4 Y pair     [0.         0.00113996 0.        ]
5 X reversed [-0.00113996  0.          0.        ]
6 turning    [0.         0.         0.00602882] expect θz = 0.006028846153846155
7 turned     y/x = 0.0015000011250010132 expect 0.0015000011250010125
8 coasting   0.009030295516688774 expect 0.009030295516688767 | 0.0009736233356004434 expect 0.0009736233356004434
9 energy     0.2203287966297624 expect 0.22032879672351618
```

## 7. Controlling the Stage
 
Section 6 ended with a plant: four currents in, a position and an angle out, and almost nothing in between that holds the plate in place. This section closes the loop. We start with the most common controller there is, see where it hurts, and fix it in two steps — first by changing *what we ask for*, then by using *what we know*.
 
Each step is an experiment on the same plant, run in Python with [python-control](https://python-control.readthedocs.io/):
 
| # | Reference | Controller | Question |
|---|---|---|---|
| 1 | step to the target | PIDF | does feedback alone get there? |
| 2 | minimum-jerk path to the target | PIDF | what changes if we ask for a gentler move? |
| 3 | minimum-jerk path to the target | PIDF + feedforward | what if we use the model? |
| 4 | a spiral of targets | as in 3 | does it hold on a long, curved trajectory? |
| 5 | a raster grid |  as in 3 & 4| can it hold on repetitive, sharp trajectories?|
 
The target of experiments 1–3 is $(x, y) = (20, 10)$ µm with $\theta_z = 0$.
 
### 7.1 What the controller does every cycle
 
The controller is a program that runs every $T_s = 50$ µs (20 kHz) **[A]**. Each cycle it does the same five things:
 
1. **Read** where the plate is, $\mathbf{q}_k$. Here we take it straight from the plant: the real measurement — four encoder heads, their resolution, their noise and delay (6.9) — is a question for later, when the control law is fixed. A controller can never be more precise than its sensor, so that check will come, but it does not decide which control law to use.
2. **Compare** it with where the plate should be, the reference $\mathbf{r}_k$: the error is $\mathbf{e}_k = \mathbf{r}_k - \mathbf{q}_k$.
3. **Decide** which push and turn the plate needs, $\mathbf{f} = [\,F_x\ F_y\ M_z\,]^\top$ — this is the control law, and the only part that changes between the experiments.
4. **Allocate** it to the four coils: find the four currents that give exactly this push and turn.
5. **Hold** the four currents until the next cycle (the amplifiers of 6.8 deliver them).
The allocation is section 6 read backwards. Section 6 says $\mathbf{F} = K_{f,0}\,B(\theta_z)\,\mathbf{i}$; we need $\mathbf{i}$ from $\mathbf{F}$. Turn the wanted push into the plate's frame (undo the rotation), let each coil pair share its push equally, and let all four share the turn:
 
$$
\mathbf{i} = \frac{1}{K_{f,0}}\, A(\theta_z)\, \mathbf{f}, \qquad
A(\theta_z) = \begin{bmatrix} \tfrac12 & 0 & -\tfrac{1}{4a} \\ \tfrac12 & 0 & \tfrac{1}{4a} \\ 0 & \tfrac12 & \tfrac{1}{4a} \\ 0 & \tfrac12 & -\tfrac{1}{4a} \end{bmatrix}
\begin{bmatrix} R(\theta_z)^\top & \mathbf{0} \\ \mathbf{0} & 1 \end{bmatrix}
$$
 
Multiplying out, $B(\theta_z)\,A(\theta_z) = I$: the allocation hands the plate exactly the push and turn that were asked for, and nothing else. This is why each axis can be controlled on its own.
 
With the allocation in place, each axis is simply a mass — $m$ for $x$ and $y$, $J$ for $\theta_z$ — with a little drag. Everything below is written for one axis and applied to all three.
 
### 7.2 Experiment 1: feedback alone — PID, then PIDF

<figure>
  <img src="/planar_stage_system/diagram_exp1.png" alt="Block diagram of experiment 1: step reference, PIDF, allocation, current amplifiers, plant, position fed back" />
</figure>
 
**PID.** The classic recipe ([PID controller](https://en.wikipedia.org/wiki/Proportional%E2%80%93integral%E2%80%93derivative_controller)) builds the force from the error three ways:
 
$$
f(t) = K_p\, e(t) + K_i \int_0^t e\,dt + K_d\, \frac{de}{dt}
$$
 
- **P** is a spring: the further from the target, the harder it pulls.
- **D** is a damper: it pushes against the speed of the error. Without it, a mass on a spring swings for ever — and our air bearing adds almost no damping of its own (6.6).
- **I** removes what is left at the end: any constant push the model does not know about — a cable, a slight tilt of the base — would leave P and D with a steady error, because only an error can make them push. The integral keeps growing until that error is gone.
**The gains.** We are not after the best tuning, only a sensible one. The gains were found by trial and error on the step and kept because they work well; they are scaled with the mass ($m$ for $x$ and $y$, $J$ for $\theta_z$) so the three axes respond alike. Faster gains settle sooner but ask for more current. There are systematic ways to tune a PID — [Ziegler–Nichols](https://en.wikipedia.org/wiki/Ziegler%E2%80%93Nichols_method), [pole placement](https://en.wikipedia.org/wiki/Full_state_feedback), [loop shaping](https://en.wikipedia.org/wiki/Loop_shaping) on the frequency response — and a real stage would use one of them.
 
**Why the D term needs a filter — PIDF.** A derivative amplifies whatever changes quickly, and the fastest thing in a measurement is its noise. In a digital controller the derivative is a difference, $(e_k - e_{k-1})/T_s$: a noise of 1 nm, divided by 50 µs, looks like a speed of 20 µm/s, and $K_d$ turns it into force. The cure is to smooth the derivative with a [low-pass filter](https://en.wikipedia.org/wiki/Low-pass_filter) — a PID with a filtered D, **PIDF**:
 
$$
f = \left(K_p + \frac{K_i}{s} + \frac{K_d\, s}{\tau s + 1}\right) e, \qquad \tau = \frac{1}{2\pi f_c}, \quad f_c = 1\ \text{kHz}
$$
 
The filter corner sits well above the speed of the loop, so it costs little damping, and ten times below the 10 kHz [Nyquist limit](https://en.wikipedia.org/wiki/Nyquist_frequency) of the sampling. To see it work, this one run adds 1 nm of random noise to the measured position:
 
<figure>
  <img src="/planar_stage_system/pid_vs_pidf.png" alt="The same step with 1 nm measurement noise: plain PID against PIDF — position, and the coil current at rest" />
</figure>

The step itself barely changes, but at rest the current ripple falls from 2.6 mA to 0.6 mA rms, 4.4 times less current switching back and forth in the coils for nothing. The price is a slightly livelier position (0.65 nm rms instead of 0.22 nm), still far below anything we care about. From here on the controller is the PIDF.
 
**The response.** The reference jumps to the target at $t = 0$:
 
<video controls playsinline preload="metadata"
       style="display:block;width:100%;max-width:520px;margin:1.5rem auto;border-radius:6px"
       poster="/planar_stage_system/video/poster/anim_exp1_poster.jpg">
  <source src="/planar_stage_system/video/anim_exp1.mp4" type="video/mp4" />
</video>

<figure>
  <img src="/planar_stage_system/results_exp1.png" alt="Experiment 1: step to (20, 10) µm with PIDF — position, tracking error, coil currents and angle" />
</figure>

It works: the plate is within 20 nm of the target after 19 ms and ends exactly on it. But look at the start. The whole 20 µm error appears at once, so the controller asks for the whole force at once: **1.05 A** in the X coils in the first cycle, then a swing to the other side to brake, and a **21 % overshoot**. The overshoot is not bad tuning; with an I term a step *must* overshoot. At rest no force is needed, so the integral $K_i\int e\,dt$ has to return to zero, and since the error starts positive, it has to become negative for a while.
 
### 7.3 Why a step is the wrong question
 
1 A for 20 µm already looks large. The system is linear in the current, so everything scales with the distance: the same step to $(1, 1)$ mm asks for about **52 A** per coil and, with $R = 5.9\ \Omega$ per coil, about **65 kW** of heat in the coils for that instant. No amplifier delivers that, and no coil survives it. A real amplifier would simply clip at its limit, and then the loop no longer behaves like the design at all.
 
Even a step that the hardware *could* deliver would be a bad idea:
 
- **It hits the machine.** A current that jumps from zero to its peak in one cycle is a hammer blow: it shakes the structure, the base and everything mounted on it, exactly the [vibrations](https://en.wikipedia.org/wiki/Vibration) a precision machine is built to avoid.
- **It wears the machine.** Large, abrupt currents heat the coils (resistance and magnets drift with temperature) and stress the amplifiers and cables.
- **It asks for the impossible.** A step says "be there now". No mass can do that, so the error is huge by design and the controller spends its whole effort on a request that cannot be met.
The problem is not the controller. It is the question we asked it. What if we only ask for something the plate can actually do?
 
### 7.4 A better question: a path
 
Instead of jumping to the target, the reference *travels* there in a chosen time $T$, along a curve that starts and ends at rest. A good choice is the **minimum-jerk** curve ([jerk](https://en.wikipedia.org/wiki/Jerk_(physics)) is the rate of change of acceleration; among all smooth rest-to-rest curves, this one keeps it smallest — the same curve describes how people move their arms [6]). From the start $\mathbf{q}_0$ to the target $\mathbf{q}^*$:
 
$$
\mathbf{r}(t) = \mathbf{q}_0 + (\mathbf{q}^* - \mathbf{q}_0)\, s(\tau), \qquad s(\tau) = 10\tau^3 - 15\tau^4 + 6\tau^5, \qquad \tau = \frac{t}{T} \in [0, 1]
$$
 
The polynomial is fixed by six conditions: position 0 and 1, speed 0 and acceleration 0 at both ends. Its derivatives give the speed and acceleration the plate will need:
 
$$
\dot{\mathbf{r}} = \frac{\mathbf{q}^* - \mathbf{q}_0}{T}\,\big(30\tau^2 - 60\tau^3 + 30\tau^4\big), \qquad
\ddot{\mathbf{r}} = \frac{\mathbf{q}^* - \mathbf{q}_0}{T^2}\,\big(60\tau - 180\tau^2 + 120\tau^3\big)
$$
 
<figure>
  <img src="/planar_stage_system/min_jerk.png" alt="The minimum-jerk curve s(τ) and its speed, acceleration and jerk over τ = t/T" />
</figure>

For a distance ${d}$ the peaks are: 
$$
v_{\max} = 1.875\,\frac{d}{T}, \qquad a_{\max} = 5.77\,\frac{d}{T^2}
$$
 
so the path, not the controller, now decides how much force the move needs. That also gives a rule for choosing $T$: with at most $I_{\max}$ per coil and two coils per axis, $m\,a_{\max} \le 2K_{f,0}I_{\max}$, so
 
$$
T \ge \sqrt{\frac{5.77\, d\, m}{2 K_{f,0}\, I_{\max}}}
$$
 
about 2 ms for 20 µm and 16 ms for 1 mm at 1 A. We use $T = 20$ ms **[A]**.
 
**Experiment 2** keeps the same PIDF and only replaces the step by the path:
 
<figure>
  <img src="/planar_stage_system/diagram_exp2.png" alt="Block diagram of experiment 2: minimum-jerk path, PIDF, allocation, current amplifiers, plant" />
</figure>

<video controls playsinline preload="metadata"
       style="display:block;width:100%;max-width:520px;margin:1.5rem auto;border-radius:6px"
       poster="/planar_stage_system/video/poster/anim_exp2_poster.jpg">
  <source src="/planar_stage_system/video/anim_exp2.mp4" type="video/mp4" />
</video>


<figure>
  <img src="/planar_stage_system/results_exp2.png" alt="Experiment 2: minimum-jerk path to (20, 10) µm with PIDF — position, tracking error, coil currents and angle" />
</figure>
It is indeed slower: the plate is within 20 nm of the target after 30 ms instead of 19 ms, because we chose to take 20 ms for the move. But the effort is a different world. The peak current falls from 1050 mA to **14 mA**, 75 times less, and it is a smooth, continuous curve instead of a jump: no hammer blow, nothing to shake the machine, and no overshoot. The heat in the coils drops from 16 W to 3 mW.
 
What remains is a tracking error of up to 0.23 µm during the move. The PIDF can only react to an error, so it lets the plate fall a little behind the path before it pushes — and the error grows with the distance: the same path to 1 mm lags by about 12 µm.
 
### 7.5 Using the model: feedforward
 
The PIDF does not know what the path will ask for; it waits for an error and then reacts. But *we* know. The path gives $\mathbf{r}$, $\dot{\mathbf{r}}$ and $\ddot{\mathbf{r}}$ at every instant, and section 6 tells us exactly which force makes a plate follow them. Put the path into the model and solve for the force — the model run backwards ([feedforward](https://en.wikipedia.org/wiki/Feed_forward_(control))):
 
$$
M\ddot{\mathbf{q}} + D\dot{\mathbf{q}} = \mathbf{F}
\quad\xrightarrow{\ \mathbf{q}\, \to\, \mathbf{r}\ }\quad
\mathbf{f}_{ff} = M\ddot{\mathbf{r}} + D\dot{\mathbf{r}}
$$
 
The feedforward supplies the force the move needs; the PIDF only corrects what the model gets wrong. The two are added before the allocation, $\mathbf{f} = \mathbf{f}_{ff} + \mathbf{f}_{fb}$.
 
<figure>
  <img src="/planar_stage_system/diagram_exp3.png" alt="Block diagram of experiment 3: minimum-jerk path, feedforward from the model added to the PIDF, allocation, current amplifiers, plant" />
</figure>

**Experiment 3** — the same path, the same PIDF, plus the feedforward:

<video controls playsinline preload="metadata"
       style="display:block;width:100%;max-width:520px;margin:1.5rem auto;border-radius:6px"
       poster="/planar_stage_system/video/poster/anim_exp3_poster.jpg">
  <source src="/planar_stage_system/video/anim_exp3.mp4" type="video/mp4" />
</video>

 
<figure>
  <img src="/planar_stage_system/results_exp3.png" alt="Experiment 3: minimum-jerk path to (20, 10) µm with PIDF and feedforward — position, tracking error in nm, coil currents and angle" />
</figure>

The tracking error falls from 0.23 µm to about **0.01 nm**, note the unit on the error plot — and the plate is inside 20 nm of the path the whole time, not only at the end. The current is almost exactly the path's acceleration times the mass, 12.6 mA at its peak: the feedforward does the work and the PIDF has nearly nothing left to do. The remaining 0.01 nm is the price of holding the current constant over each 50 µs cycle while the path's acceleration keeps changing.
 
That is only this good because our model *is* the plant. On a real stage the model is off by a few per cent — the force constant varies with coil position (5.6), the mass is not exactly 1 kg — and that mismatch is what the PIDF will have to correct. But it then corrects a few per cent of the move, not all of it.
 
### 7.6 All three together
 
<figure>
  <img src="/planar_stage_system/results_exp1_2_3.png" alt="Experiments 1, 2 and 3 compared: position, tracking error, coil currents and angle" />
</figure>

| | 1: step + PIDF | 2: path + PIDF | 3: path + PIDF + FF |
|---|---|---|---|
| Largest tracking error | 20 µm (the step itself) | 0.23 µm | 0.01 nm |
| Overshoot | 21 % | 0.2 % | 0 |
| Within 20 nm of the target after | 19 ms | 30 ms | always |
| Peak coil current | 1050 mA | 14 mA | 12.6 mA |
| Peak heat in the coils | 16 W | 3 mW | 2 mW |
| Same move to (1, 1) mm: peak current | 52 A | 0.70 A | 0.63 A |
 
Each step asks less of the hardware and gets more out of it. The step gets there fastest only because it asks for the impossible; the path makes the request reasonable; the model makes the controller's job almost trivial.
 
In all three runs $\theta_z$ stays exactly zero. That is not the controller being clever: each coil pair pushes through the centre $G$, which is also the centre of mass, and the allocation gives both coils of a pair exactly the same current, so no moment ever appears. On a real stage $\theta_z$ moves when that symmetry breaks, a centre of mass 1 mm off $G$ turns the plate by about 45 nrad during this move, a coil 1 % stronger than its partner by about 12 nrad and then the $\theta_z$ loop has real work to do.
 
### 7.7 Experiment 4: a spiral
 
A real stage does not make one move; it follows a programme. Experiment 4 gives our best controller of experiment 3 a sequence of 97 targets: a spiral out from the centre to a circle of radius 1 mm in two turns, then once around the circle **[A]**.
 
The reference is built *before* the run. Between each pair of neighbouring targets $\mathbf{q}^*_j$ and $\mathbf{q}^*_{j+1}$ goes one minimum-jerk segment of $T_{\text{seg}} = 10$ ms **[A]**; laid end to end they make one **master path**,
 
$$
\mathbf{r}(t) = \mathbf{q}^*_j + (\mathbf{q}^*_{j+1} - \mathbf{q}^*_j)\; s\!\left(\frac{t - jT_{\text{seg}}}{T_{\text{seg}}}\right), \qquad j T_{\text{seg}} \le t < (j+1) T_{\text{seg}}
$$
 
stored as a table of $\mathbf{r}$, $\dot{\mathbf{r}}$, $\ddot{\mathbf{r}}$. Each control cycle only reads the next row, the same split a real machine makes between planning a trajectory and running the loop.
 
 <video controls playsinline preload="metadata"
       style="display:block;width:100%;max-width:520px;margin:1.5rem auto;border-radius:6px"
       poster="/planar_stage_system/video/poster/anim_exp4_poster.jpg">
  <source src="/planar_stage_system/video/anim_exp4.mp4" type="video/mp4" />
</video>

<figure>
  <img src="/planar_stage_system/results_exp4_spiral.png" alt="Experiment 4: spiral master path with PIDF and feedforward — path in the plane, tracking error in nm, coil currents and angle" />
</figure>

Over the whole second of spiral the tracking error stays below **0.8 nm**, with at most 0.49 A per coil. The error and the current oscillate once per segment, because each minimum-jerk segment starts and ends at rest: the plate speeds up and stops 96 times, and only looks like it glides because the segments are short. Both grow outward, where the segments are longer but still take 10 ms. One solution to this would be a path that passes *through* the targets without stopping.


### 7.8 Experiment 5: a raster scan
 
The last run gives the controller of experiment 3 something closer to real work: scanning a rectangular area line by line, the way an inspection or writing stage covers a wafer field.
 
The plate starts slightly turned, $\theta_z = 0.3$ mrad **[A]**, so this time the angle loop has a real job. The programme is a list of targets:
 
1. From the start $(0,\ 0,\ 0.3\ \text{mrad})$ to the corner $(-2,\ 0)$ mm, turning the plate back to $\theta_z = 0$ on the way.
2. Up to $(-2,\ 1)$ mm, then **columns**: down to $y = -1$ mm, a step of 0.25 mm in $x$, up to $y = +1$ mm, another step, until $x = +1$ mm.
3. Then back in **rows**: across to $x = -2$ mm, a step of 0.25 mm in $y$, across again, until the whole box has been covered the other way.
The box, $x \in [-2, 1]$ mm and $y \in [-1, 1]$ mm **[A]**, stays inside the ±2.5 mm travel. Together the columns and rows trace a grid.
 
As in experiment 4, the targets are joined by minimum-jerk segments into one master path. The segments are no longer all the same length, so each one gets its own time from the rule of 7.4: the shortest $T$ for which no coil needs more than 0.5 A **[A]**,
 
$$
T_j = \sqrt{\frac{5.77\, d_j\, m}{2 K_{f,0}\, I_{\max}}}
$$
 
with $d_j$ the segment's length (and the same rule with $J$, $4a$ for the turn). The 0.25 mm steps take 11 ms, the 3 mm rows 39 ms; the whole scan, 44 segments, takes 1.07 s.
 

<video controls playsinline preload="metadata"
       style="display:block;width:100%;max-width:520px;margin:1.5rem auto;border-radius:6px"
       poster="/planar_stage_system/video/poster/anim_exp5_poster.jpg">
  <source src="/planar_stage_system/video/anim_exp5.mp4" type="video/mp4" />
</video>
 
<figure>
  <img src="/planar_stage_system/results_exp5_raster.png" alt="Experiment 5: raster scan of a 3 × 2 mm box with PIDF and feedforward — path in the plane, tracking error in nm, coil currents and angle" />
</figure>

- **The grid.** The plate follows the master path to within **0.8 nm** over the whole second; in the plane the two are indistinguishable.
- **The current.** Every segment peaks at the 0.5 A that set its time (0.504 A at most, the feedback adds the last few mA): the path teqnique can help us guarantee requirements (current never > ~0.5A), and the controller happily realizes them deciding how hard the coils work, in some sense we are task aware.
- **The angle.** The 0.3 mrad turn is removed during the first move, in about 32 ms, smoothly and without any extra current spike. After that $\theta_z$ stays at zero for the rest of the scan.
 

### 7.8 What this does not show yet

The experiments use an idealised plant and an ideal measurement, on purpose: they compare control laws, not hardware. A lot of what makes a real stage hard is still missing, and it is worth being honest about how much.

**What the model simplifies**

- **The force constant is constant.** Every coil uses $K_{f,0}$; the drop of up to about 3 % toward the ends of travel (5.6) is known but left out, and so are small differences between the four coils.
- **The plate is a rigid body.** A real plate bends and twists. Its first [resonance](https://en.wikipedia.org/wiki/Resonance) sits somewhere in the kHz range, and a loop that is too fast, or a path that is too sharp, excites it. This is usually what limits how fast a precision stage can be controlled, not the mass, not the coils.
- **The amplifiers are perfect.** They deliver the commanded current instantly and without limit. A real amplifier has its own bandwidth, must fight the coil's inductance and back-EMF (6.8), and clips at a maximum current, which decides how short $T$ can really be.
- **Nothing gets warm.** The coils dissipate up to a few watts. That heat changes the coil resistance, weakens the magnets slightly, and worst of all at micrometre level, expands the plate and the encoder grids by much more than our tracking errors.
- **Nothing pulls from outside.** No cables or hoses to the plate, no floor vibration, no air currents, no off-centre payload. These are exactly the constant or slow pushes the I term exists for, and the asymmetries that would finally give the $\theta_z$ loop real work.
- **Only three directions exist.** The air bearing is assumed to hold $z$, $\theta_x$ and $\theta_y$ perfectly; in reality they couple back into the plane.

**What the controller simplifies**

- **The measurement is ideal.** The controller reads $\mathbf{q}$ directly. Real encoder heads have a finite resolution, noise and interpolation errors, and the pose must be computed from eight readings (6.9). A 20 nm encoder step alone makes the plate drift within about ±10 nm at rest, whatever the control law.
- **Sampling is only half modelled.** The controller does run every $T_s$ and holds its output between samples, while the plant moves continuously, so the hold is in. But the control law was designed as if it were continuous, and the delays a real controller adds, reading the encoders, computing, writing the currents, are not there. A proper design would be done in discrete time, with those delays in the loop.
- **The gains are only sensible.** They were found by trial and error on an ideal plant; with resonances, delays and noise in the model they would have to be designed properly, and checked for robustness against everything the model gets wrong.

## 8. What We Gained

The list in 7.8 is long, and it should be. But go back to the goals we set in 1.1 and look at what we have after building this from nothing.

1. **Understand the machine.** We now know why a stage on air needs feedback at all: in the plane nothing holds it — no spring, almost no friction (6.6), so every position it keeps is one the controller earns. We know where each force enters and how far it reaches, down to why four coils on two crossing lines can push and turn the plate independently (6.4).
2. **Model it from first principles.** From the remanence of a magnet, through a hand calculation and a field solve, to a force constant (section 5); from a drawing, through lines of action and Newton, to $M\ddot{\mathbf{q}} + D\dot{\mathbf{q}} = K_{f,0}B(\theta_z)\,\mathbf{i}$ (section 6). No transfer function was handed to us; every term was built.
3. **Trust the model.** Nine tests with answers known from plain physics, all passed (6.10), and they showed us the model's limits, too: it has no edges, and rotation is far more sensitive than translation.
4. **Control it.** Three ideas that carry over to almost any motion system. Feedback alone gets there but asks for the impossible; a path makes the request reasonable; the model turned into feedforward makes the controller's job almost trivial. The effort fell from an amp to a few milliamps and the error from micrometres to fractions of a nanometre, without touching the feedback gains (7.6). The same controller then followed a spiral and a full raster scan, including the one time the angle had real work to do.
5. **Keep it honest.** Every number carries its tag, and 7.8 says plainly what the results are not. That makes the model easy to improve: when a real value replaces an assumed one, we know exactly what changes.

Beyond the list, there is something harder to put in a table: a healthy respect for the machine. Even this stripped-down stage, rigid, cool, perfectly measured, shows why wafer stages are among the most demanding mechatronic systems there are. Every simplification in 7.8 for sure is someone's full-time job in a real machine.

From a control engineer's point of view, that is the real lesson. The controller is the visible part, but most of the work sits underneath it: understanding where the forces come from, what the sensors really see, and what the model leaves out. This was a long, sometimes humbling look at that complexity,  and a very rewarding one.

<blockquote>
  <strong>Before controlling a precision stage, understand where its forces enter, where its measurements come from, and how its geometry becomes dynamics.</strong> We started the post with that sentence. Having built the stage, it reads differently now.
</blockquote>

The natural next steps follow straight from 7.8: put the encoders back into the loop, give the plate its first resonance, and redesign the controller in discrete time with real delays. Each of those deserves a post of its own.

**Github public repo**:https://github.com/martiniio/stage-control



Sources are cited where they are used, for educational purposes. From the patent we take only the general actuator layout,  no dimensions, numbers or drawings; every drawing and number in this post is our own. The other sources supply single published values, named where they appear. Wikipedia links in the text are background on the concepts, not sources for numbers.
 
1. ASML, US patent US7145269B2, *Lithographic apparatus, Lorentz actuator, and device manufacturing method* — [patents.google.com](https://patents.google.com/patent/US7145269B2/en). Used in 4.1 for the actuator layout: a flat moving coil, two rows of magnets of opposite polarity under its two legs, a steel core closing the flux.
2. M. D. Levenson, "Towards ultimate optical lithography with NXT:1950i dual-stage immersion platform," *Semiconductor Digest* — [sst.semiconductor-digest.com](https://sst.semiconductor-digest.com/?p=30300). Used in 4.1 and 4.2 for the encoder concept (four two-axis heads per stage reading a grid plate) and the sub-nanometre lithography resolution.
3. F. Yang et al., "Two Degree-of-Freedom Fiber-Coupled Heterodyne Grating Interferometer with Milli-Radian Operating Range of Rotation," *Sensors* 19(14), 3219, 2019 — [mdpi.com](https://www.mdpi.com/1424-8220/19/14/3219). Used in 4.2: it states that lithography encoder heads must work over ±1.5 mrad of rotation.
4. HEIDENHAIN PP 281 two-coordinate encoder, product data — [micromech.co.uk](https://micromech.co.uk/Product/101072/pm), [heidenhain.us](https://www.heidenhain.us/?p=493). Used in 4.2 for the catalogue encoder step (down to 0.05 µm).
5. Renishaw TONiC readhead installation drawing — [pdf](https://8id.xray.aps.anl.gov/elog-mirror/8-ID/170816_110154/TONiC.pdf). Used in 4.2 for how closely a linear readhead must follow its scale.
6. T. Flash and N. Hogan, "The coordination of arm movements: an experimentally confirmed mathematical model," *Journal of Neuroscience* 5(7), 1688–1703, 1985 — [jneurosci.org](https://www.jneurosci.org/content/5/7/1688). Used in 7.4 for the minimum-jerk curve.