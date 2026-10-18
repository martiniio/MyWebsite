---
title: "How Do You Land a Flying Car? A Control Engineer's Look at Tesla's Roadster"
pubDate: 2026-10-18
tags: [control-theory, system-modelling, mpc, control-problem]
description: "Tesla's Roadster flew on a single tank of compressed air. A control engineer's take on how it might be done, from modeling the car to landing it softly with MPC."

ogImage: "/tesla_roadster_control_analysis/og/image.png"
ogImageAlt: "How do you land a flying car?'"
---

<div style="display:flex; justify-content:center;">
  <iframe
    style="width:100%; max-width:360px; aspect-ratio:9 / 16; border:0;"
    src="https://www.youtube.com/embed/-yRQsurykGw"
    title="The Ramp | Roadster"
    referrerpolicy="strict-origin-when-cross-origin"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen>
  </iframe>
</div>

## 1. The demonstration and the hidden control problem

On 15 October 2026, outside Waco, Texas, Tesla finally showed the second-generation Roadster. The car drove up an inverted ramp, held there by suction fans, then left it, rotated in the air, and eased itself down onto the pavement. Most of the coverage asked the obvious question: *can a car really fly?*

As a control engineer, a different question stuck with me: **how do you land it?**

Here is what Tesla actually said about the hardware. Engineering VP Lars Moravy described **10 cold-gas thrusters fed by 600 liters of compressed air**, a tank that can be recharged, and thrusters driven by **all-electric actuators that make small adjustments to keep the car stable in flight** ([TechCrunch](https://techcrunch.com/2026/10/15/tesla-reveals-spacex-powered-roadster-that-flies-and-falls-with-style/), [The EV Report](https://theevreport.com/tesla-roadster-unveil-spacex-cold-gas-thrusters)). The demo car was operated remotely, with nobody inside ([Electrek](https://electrek.co/2026/08/14/tesla-flying-roadster-demo-this-month-no-driver/)).

That is a short list of facts, but it hides a hard control problem. A heavy rigid body (we will assume around 1.8 tonnes) leaves the ramp at whatever angle the stunt put it in, possibly upside down. Its only actuators are a handful of thrusters fed from a tank that holds a few seconds' worth of air, and every second in the air makes that tank weaker. You have to turn the car upright, slow its fall, and touch the ground gently enough that nothing breaks. And you have to do all of it before the air runs out.

So the question for this post is: **how might they have done it?**

A disclaimer before we start. Tesla and SpaceX have surely used specialized techniques, hardware and tuning that we will never see. This post does not claim to reverse-engineer their system. It walks through **one plausible way** to solve the problem, with standard tools, so that the basic idea behind a stunt like this becomes clear.

## 2. What we know, what we assume

It helps to be strict about where each piece of information comes from. Everything in this post falls into one of three groups.

**Stated by Tesla**
- 10 cold-gas thrusters
- Two tanks holding 600 L of compressed air in total, about 250 kg of it, rechargeable ([Paul Tan](https://paultan.org/2026/10/16/tesla-roadster-revealed-flies-on-spacex-air-thrusters-0-96-km-h-in-0-81s-production-2028/))
- All-electric actuators for small in-flight adjustments
- Suction fans used on the inverted ramp

**Reported by outlets, not confirmed**
- Four rear thrusters fire backward, visible in Tesla's teaser image ([Tesla Oracle](https://www.teslaoracle.com/2026/09/13/tesla-roadsters-teaser-image-shows-firing-spacex-thrusters-final-unveiling-date-is-here-more/))
- A tank pressure of about 380 bar, read from a "Thruster 5,500 psi" display in Tesla's official interior photos. Tesla gave no pressure on stage ([EVXL](https://evxl.co/2026/10/16/tesla-roadster-thrusters-compressed-air-tank/)).
- A combined rear thrust of over 80 kN ([Tech Insider](https://tech-insider.org/tesla-roadster-flight-tech-80kn-thrust-explained-2026/)). We treat this number with caution and check it against the physics later.

**Assumed by us**
- Vehicle mass and inertia
- Where the thrusters sit and which way they point
- How the valves work
- The sensors on board
- Everything about the controller

The last list is long, and that is fine. We are not going to model the inside of the car: how the thrusters are placed, how the plumbing runs, how the valves are built. That is Tesla's design work, and guessing at it would add detail without adding insight.

Instead we treat the car the way a control engineer treats any plant: through its **inputs and outputs**. What can we command? What can we measure? What limits must we respect? That is all a controller needs to know.

Two assumptions deserve to be said out loud, because everything else rests on them.

First, **the thrusters can twist the car in both directions about all three axes, and push it up when it is upright.** We don't need to know the layout, only that it has this authority. The demo, where the car rotated and spun in the air, makes this plausible, but it is an assumption, not a stated fact. Note what we do *not* assume: the car cannot push itself in every direction. Thrusters only push, so it most likely moves sideways the way a quadcopter does, by tilting.

Second, **each valve can be set anywhere between closed and fully open**, and it takes a moment to move. Tesla's description, electric actuators making small adjustments, fits this kind of *proportional* valve better than a valve that can only snap fully open or shut. Section 6.1 explains what would change if the valves were on/off instead.

**Scope.** We start at the moment the car leaves the ramp, at any attitude, and end at touchdown. The ramp phase itself is out of scope: it depends on the suction fans and the car's contact with the ramp, which is Tesla's hardware, not a control question we can answer from the outside.

## 3. Our approach: why MPC

Before building any model, it is worth asking what kind of controller this problem calls for. Five things make it hard.

- **Thrust fades.** As air leaves the tank, the pressure drops, so the same valve opening pushes less and less. Below some minimum pressure the thrusters stop working altogether. The actuator gets weaker the longer you use it.
- **Up depends on attitude.** The thrusters are fixed to the car. Upright, the lift thrusters hold it up. Upside down, the same thrusters push it toward the ground. The car has to be turned before it can be braked.
- **Thrusters only push, and valves take time.** There is no "negative thrust", and a valve cannot jump from closed to fully open instantly.
- **Touchdown has hard limits.** Land too fast or too tilted and the suspension, or worse, takes the hit.
- **Ten inputs drive six coupled axes.** Firing one thruster rarely affects just one direction. It usually pushes and twists the car at the same time.

**Why not a PID controller?** A PID loop reacts to the error it sees right now. It has no idea that a thruster cannot pull, that its own actuators are fading, that it should rotate first and brake second, or that the ground is coming up at a certain speed. It only finds out about a limit by running into it.

What this problem needs is a controller that **looks ahead** and **knows the rules**. That is the idea behind **Model Predictive Control (MPC)**:

> [!abstract]
> _At every time step, use a model to predict the next few seconds, choose the best sequence of thruster commands that respects every constraint, apply only the first command, then repeat with fresh measurements._

This is called a *receding horizon*: the controller always plans a few seconds ahead, but commits to just one step at a time. Because it predicts, it can see that turning the car now saves height later. Because the plan is redone constantly, it can absorb surprises, like a gust of wind or a thruster that pushes a little less than expected.

For MPC to work, it needs five things from us. They set the plan for the rest of the post:

1. **A model** to predict with → sections 4.2, 4.3 and 4.5
2. **Inputs** it can choose → section 4.4
3. **Measurements** to start each prediction from → section 4.6
4. **Constraints** to respect → section 5.1
5. **A goal**: right the car, then land it softly → sections 5.2 and 5.3

Section 6 then puts the five pieces together into one optimization problem.

*From here on, everything is our own modeling: a plausible plant, not Tesla's.*

## 4. Building the model

The goal of this section is a model of the form

$$
\dot{\mathbf{x}} = f(\mathbf{x}, \mathbf{u}), \qquad \mathbf{y} = h(\mathbf{x})
$$

that MPC can use to predict the next few seconds: a state $\mathbf{x}$ that captures everything that matters, inputs $\mathbf{u}$ that the controller chooses, and outputs $\mathbf{y}$ that the sensors deliver. We build it piece by piece.

### 4.1 Notation and frames

We use two coordinate frames:

- **World frame** $\{W\}$: fixed to the ground, origin on the landing pad, $z$ pointing up. So $z$ is also the car's height above the pad.But also the attitude angle.
- **Body frame** $\{B\}$: fixed to the car, origin at its center of mass, $x$ forward, $y$ left, $z$ up (through the roof), roll, pitch and yaw Euler angles.

![Roll, pitch and yaw axes of a car](https://commons.wikimedia.org/wiki/Special:FilePath/RPY_angles_of_cars.png)

<!-- Optional: download to public/images/ and change the path to /images/rpy-angles-of-cars.png -->
*Figure: roll, pitch and yaw axes of a car. Image by [Qniemiec](https://commons.wikimedia.org/wiki/User:Qniemiec), [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0), via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:RPY_angles_of_cars.png).*

Thruster forces are naturally described in the body frame, since the nozzles are bolted to the car. Gravity and the landing pad live in the world frame. The rotation between the two frames is the attitude of the car, and it will turn out to be the most important nonlinearity in the problem.

Position is written $\mathbf{r}$, so that $P$ is free for tank pressure. The values below are what we use whenever a number is needed:

| Symbol | Meaning | Value | Source |
|---|---|---|---|
| $V$ | total tank volume (two tanks) | 0.6 m³ | stated |
| $m_{g,0}$ | air mass in a full tank | ≈ 250 kg | stated |
| $P_0$ | full tank pressure | ≈ 380 bar | reported |
| $T_0$ | initial gas temperature | 293 K | assumed |
| $m_{dry}$ | car without air | ≈ 1,550 kg | assumed |
| $m$ | car with full tank | ≈ 1,800 kg | assumed |
| $\gamma$ | heat capacity ratio of air | 1.4 | physics |
| $R_{air}$ | gas constant of air | 287 J/(kg·K) | physics |
| $P_{min}$ | lowest useful feed pressure | 30 bar | assumed |
| $v_{e,0}$ | effective exhaust velocity, full tank | ≈ 600 m/s | estimated in 4.5 |
| $g$ | gravity | 9.81 m/s² | physics |

### 4.2 The state vector

The state is everything we need to know right now to predict what happens next. For this problem it has five blocks:

$$
\mathbf{x} = \begin{bmatrix} \mathbf{r} \\ \mathbf{v} \\ \mathbf{q} \\ \boldsymbol{\omega} \\ m_u \end{bmatrix} \in \mathbb{R}^{14}
$$

| Block | Components | Meaning | Frame |
|---|---|---|---|
| $\mathbf{r}$ | $x,\ y,\ z$ | position of the center of mass | world |
| $\mathbf{v}$ | $v_x,\ v_y,\ v_z$ | velocity | world |
| $\mathbf{q}$ | $q_0,\ q_1,\ q_2,\ q_3$ | attitude quaternion | body → world |
| $\boldsymbol{\omega}$ | $\omega_x,\ \omega_y,\ \omega_z$ | angular rate | body |
| $m_u$ | | usable propellant mass | |

Written out in full:

$$
\mathbf{x} = \begin{bmatrix} x & y & z & v_x & v_y & v_z & q_0 & q_1 & q_2 & q_3 & \omega_x & \omega_y & \omega_z & m_u \end{bmatrix}^{\top}
$$

Two of these choices need a word of explanation.

**Why a quaternion for attitude.** The more familiar description is three Euler angles: roll, pitch and yaw. They are intuitive, but they become singular when the pitch reaches ±90°: two of the angles describe the same rotation and the equations divide by zero. This is the well-known *gimbal lock*. Our car leaves the ramp at an arbitrary attitude, possibly upside down, so it will pass through exactly those orientations. A unit quaternion ($q_0^2 + q_1^2 + q_2^2 + q_3^2 = 1$) describes every orientation without singularities, at the cost of one extra number [Markley & Crassidis].

**Why one propellant state is enough.** At first sight the tank needs several states: pressure $P$, temperature $T$ and gas mass $m_g$. But a flight lasts only a few seconds. The gas leaves the tank so fast that it has almost no time to exchange heat with the tank walls, so the expansion is close to [**isentropic**](https://www.grc.nasa.gov/www/k-12/airplane/compexp.html). Treating air as an ideal gas in a fixed tank volume, the isentropic relations then tie pressure and temperature to the gas mass alone [Anderson]:

$$
P = P_0 \left(\frac{m_g}{m_{g,0}}\right)^{\gamma},
\qquad
T = T_0 \left(\frac{m_g}{m_{g,0}}\right)^{\gamma - 1}
$$

Here $m_g$ is the gas mass in the tank right now, and $m_{g,0}$, $P_0$ and $T_0$ are the mass, pressure and temperature of the full tank before the flight starts (the values in the table of 4.1). The ratio $m_g / m_{g,0}$ is simply the fraction of the original air still in the tank. So one number, the gas mass, determines the whole state of the tank.

> [!example]
> It's the same effect you feel when a spray can or a scuba tank goes cold as you empty it. The air starts at room temperature because the tank was filled slowly: the heat from compressing it had time to leak away through the walls. The cooling comes from what happens when the air leaves. As air rushes out through the nozzle, the air left behind expands to fill the space. Expanding means it pushes the departing air out, so it does work, and that work comes from its internal energy, which is its temperature. In a few seconds the walls can't supply heat fast enough to make up for it, so the remaining gas gets colder. That is near-isentropic expansion.

Not all of that gas is useful. The thrusters need a minimum feed pressure $P_{min}$ to work (we assume 30 bar). Below it, the remaining air is trapped. Through the relation above, $P_{min}$ corresponds to a fixed trapped mass:

$$
m_{min} = m_{g,0} \left(\frac{P_{min}}{P_0}\right)^{1/\gamma}
$$

and the **usable propellant** is what is left above it:

$$
m_u = m_g - m_{min}
$$

This is the state we track. It works as both a fuel gauge and a thrust gauge: it tells us how much air we can still spend, and through $P$ it tells us how hard each thruster can push.

*Assumption:* heat from the tank walls is neglected. This is the conservative case. Real walls warm the gas a little, which gives slightly more thrust than our model predicts. For a long flight you would add the gas temperature as a separate state.

### 4.3 The equations of motion

With the state defined, the dynamics follow from Newton and Euler. In compact form:

$$
\begin{aligned}
\dot{\mathbf{r}} &= \mathbf{v} \\
m\,\dot{\mathbf{v}} &= R(\mathbf{q})\,\mathbf{F}_B - m\,g\,\hat{\mathbf{z}} \\
\dot{\mathbf{q}} &= \tfrac{1}{2}\,\Omega(\boldsymbol{\omega})\,\mathbf{q} \\
J\,\dot{\boldsymbol{\omega}} &= \boldsymbol{\tau}_B - \boldsymbol{\omega} \times J\boldsymbol{\omega} \\
\dot{m}_u &= -\frac{1}{v_e}\sum_{i=1}^{10} F_i
\end{aligned}
$$

Here $\mathbf{q}$ is a unit quaternion with the scalar part first, $\hat{\mathbf{z}}$ is the world's up direction, $J$ is the inertia matrix of the car about its center of mass, and $F_i$ is the thrust of thruster $i$. The total body force $\mathbf{F}_B$ and torque $\boldsymbol{\tau}_B$, and how the valves set each $F_i$, are the subject of section 4.4.

Line by line:

1. **Position** changes with velocity.
2. **Velocity** changes with the total force. The thrust $\mathbf{F}_B$ is produced in the body frame, so it is rotated into the world frame by $R(\mathbf{q})$ before gravity is subtracted. This single term is where attitude enters the translation: the same thrust lifts the car when it is upright and pushes it down when it is inverted.
3. **Attitude** changes with the angular rate (quaternion kinematics).
4. **Angular rate** changes with the torque $\boldsymbol{\tau}_B$, minus the gyroscopic term $\boldsymbol{\omega} \times J\boldsymbol{\omega}$ (Euler's equation for a rigid body).
5. **Usable propellant** drains with every thruster that is firing. Each thruster's mass flow is its thrust divided by the exhaust velocity. The exhaust velocity itself is not constant: it scales with the square root of the gas temperature, so as the tank cools,

$$
v_e(m_g) = v_{e,0} \left(\frac{m_g}{m_{g,0}}\right)^{\frac{\gamma - 1}{2}}
$$

Each kilogram of air buys a little less push than the one before.

The mass is not constant: it is the dry car plus whatever air remains,

$$
m = m_{dry} + m_{min} + m_u
$$

and since $m_u$ is already a state, this costs nothing. Over a full flight the car gets about 12% lighter. As the air leaves, the inertia matrix $J$ and the position of the center of mass shift slightly too. Both changes are small, and we neglect them.

The pieces that are hidden in the compact form, written out:

**Rotation matrix**, body to world:

$$
R(\mathbf{q}) =
\begin{bmatrix}
1-2(q_2^2+q_3^2) & 2(q_1q_2 - q_0q_3) & 2(q_1q_3 + q_0q_2) \\
2(q_1q_2 + q_0q_3) & 1-2(q_1^2+q_3^2) & 2(q_2q_3 - q_0q_1) \\
2(q_1q_3 - q_0q_2) & 2(q_2q_3 + q_0q_1) & 1-2(q_1^2+q_2^2)
\end{bmatrix}
$$

Its third column is the car's roof direction seen from the world. Its last entry, $1 - 2(q_1^2 + q_2^2)$, is the cosine of the tilt angle: $+1$ upright, $-1$ upside down. We will use it in section 5.

**Quaternion kinematics:**

$$
\begin{bmatrix} \dot{q}_0 \\ \dot{q}_1 \\ \dot{q}_2 \\ \dot{q}_3 \end{bmatrix}
= \frac{1}{2}
\begin{bmatrix}
0 & -\omega_x & -\omega_y & -\omega_z \\
\omega_x & 0 & \omega_z & -\omega_y \\
\omega_y & -\omega_z & 0 & \omega_x \\
\omega_z & \omega_y & -\omega_x & 0
\end{bmatrix}
\begin{bmatrix} q_0 \\ q_1 \\ q_2 \\ q_3 \end{bmatrix}
$$

**Rotational dynamics.** A car is close to symmetric left to right, so we assume the body axes are its principal axes. Then $J = \mathrm{diag}(J_x, J_y, J_z)$ and Euler's equation splits into three scalar equations:

$$
\begin{aligned}
J_x\,\dot{\omega}_x &= \tau_x - (J_z - J_y)\,\omega_y\,\omega_z \\
J_y\,\dot{\omega}_y &= \tau_y - (J_x - J_z)\,\omega_z\,\omega_x \\
J_z\,\dot{\omega}_z &= \tau_z - (J_y - J_x)\,\omega_x\,\omega_y
\end{aligned}
$$

Nothing in this section is specific to Tesla. It is the textbook model of a rigid body in flight, plus one state for the tank. Everything that makes this car *this* car is hidden in two places: the matrix $J$, and the way the thrusters produce $\mathbf{F}_B$ and $\boldsymbol{\tau}_B$. The second one is next.

### 4.4 The input: from valve openings to force and torque

The controller does not command forces directly. It sets valves. With ten thrusters, the input is a vector of ten valve openings:

$$
\mathbf{u} = \begin{bmatrix} u_1 & u_2 & \cdots & u_{10} \end{bmatrix}^{\top},
\qquad 0 \le u_i \le 1
$$

where $u_i = 0$ means valve $i$ is closed and $u_i = 1$ means it is fully open.

**How hard can a thruster push?** We assume the thrusters are fed straight from the tank, with no pressure regulator in between. This is called a *blowdown* system, and it is the simplest design. A cold-gas nozzle runs *choked*: the flow reaches the speed of sound at the narrowest point, the throat. For a choked nozzle, thrust is approximately proportional to the feed pressure [Sutton]. With the valve fully open:

$$
F_{i,max} = C_F\, A_{t,i}\, P
$$

where $A_{t,i}$ is the throat area and $C_F$ the thrust coefficient. Combining this with the isentropic tank from 4.2:

$$
F_{i,max}(m_g) = F_{i,0} \left(\frac{m_g}{m_{g,0}}\right)^{\gamma}
$$

where $F_{i,0}$ is the full-open thrust with a full tank. The word "approximately" matters: $C_F$ shifts a little as the pressure ratio across the nozzle changes, but for our purposes thrust follows pressure.

**How hard does it push right now?** We take the thrust to be proportional to the valve opening:

$$
F_i = u_i\, F_{i,max}(m_g)
$$

*Assumption:* a real valve's flow is not exactly linear in its position, but that curve can be measured once and inverted, so the controller can still command thrust as a fraction of the maximum.

**One thruster.** Thruster $i$ sits at position $\mathbf{s}_i$, measured from the center of mass, and pushes along the unit direction $\mathbf{d}_i$, both in the body frame. When it fires with thrust $F_i$, it produces a force along $\mathbf{d}_i$ and, because it is not at the center of mass, a torque $\mathbf{s}_i \times \mathbf{d}_i$:

$$
\begin{bmatrix} \mathbf{F}_i \\ \boldsymbol{\tau}_i \end{bmatrix}
= F_i \underbrace{\begin{bmatrix} \mathbf{d}_i \\ \mathbf{s}_i \times \mathbf{d}_i \end{bmatrix}}_{\mathbf{b}_i \,\in\, \mathbb{R}^6}
$$

**All ten thrusters.** Forces and torques add up, so stacking the ten columns $\mathbf{b}_i$ side by side gives one matrix:

$$
\begin{bmatrix} \mathbf{F}_B \\ \boldsymbol{\tau}_B \end{bmatrix}
= B
\begin{bmatrix} F_1 \\ F_2 \\ \vdots \\ F_{10} \end{bmatrix}
= B
\begin{bmatrix} u_1\, F_{1,max}(m_g) \\ u_2\, F_{2,max}(m_g) \\ \vdots \\ u_{10}\, F_{10,max}(m_g) \end{bmatrix},
\qquad
B = \begin{bmatrix} \mathbf{b}_1 & \mathbf{b}_2 & \cdots & \mathbf{b}_{10} \end{bmatrix} \in \mathbb{R}^{6 \times 10}
$$

Row by row:

$$
\begin{bmatrix} F_x \\ F_y \\ F_z \\ \tau_x \\ \tau_y \\ \tau_z \end{bmatrix}
=
\begin{bmatrix}
d_{1,x} & d_{2,x} & \cdots & d_{10,x} \\
d_{1,y} & d_{2,y} & \cdots & d_{10,y} \\
d_{1,z} & d_{2,z} & \cdots & d_{10,z} \\
(\mathbf{s}_1 \times \mathbf{d}_1)_x & (\mathbf{s}_2 \times \mathbf{d}_2)_x & \cdots & (\mathbf{s}_{10} \times \mathbf{d}_{10})_x \\
(\mathbf{s}_1 \times \mathbf{d}_1)_y & (\mathbf{s}_2 \times \mathbf{d}_2)_y & \cdots & (\mathbf{s}_{10} \times \mathbf{d}_{10})_y \\
(\mathbf{s}_1 \times \mathbf{d}_1)_z & (\mathbf{s}_2 \times \mathbf{d}_2)_z & \cdots & (\mathbf{s}_{10} \times \mathbf{d}_{10})_z
\end{bmatrix}
\begin{bmatrix} F_1 \\ \vdots \\ F_{10} \end{bmatrix}
$$

This is the key modeling idea of the post: **all of the thruster geometry collapses into one 6 × 10 matrix**, called the control effectiveness matrix. We never need to know where Tesla put the nozzles. We only need to know what $B$ can do, and section 2 stated the property we rely on: with thrusters that can only push, its columns must still produce torque **in both directions** about every axis, and upward force when the car is upright. Mathematically, the torque rows of $B$ must *positively span* all three axes. That is a stronger requirement than full rank, because a thruster that produces positive roll cannot simply be run backwards to produce negative roll. One consequence is worth remembering: since every thruster pushes, a torque always comes with some net force. You cannot twist the car without also pushing it somewhere.

**Valves take time to move.** An electric actuator cannot jump a valve from closed to fully open in zero time. We model this with a limit on how fast each opening can change:

$$
|\dot{u}_i| \le \dot{u}_{max}
$$

so a full stroke, from closed to open, takes at least $1/\dot{u}_{max}$ seconds.

So the input is unusual in two ways. It is **bounded and slow**: each valve sits between closed and open, and moves at a limited speed. And its **gain shrinks over time**: the same opening gives less thrust as the tank empties.

### 4.5 The propellant budget

Before building a controller, it pays to know the size of the problem. How long can this car stay in the air? The numbers below are not a prediction of Tesla's car. They are order-of-magnitude limits, built one formula at a time from the stated 250 kg of air and the reported 380 bar.

**Step 1: thrust needed to hover.** To hold the car still, thrust must equal weight:

$$
F_h = m\,g = 1800 \times 9.81 \approx 17.7\ \text{kN}
$$

**Step 2: exhaust velocity.** For a gas expanding through an ideal nozzle from tank conditions $P_0, T_0$ down to ambient pressure $P_a$ [Sutton]:

$$
v_{e,ideal} = \sqrt{\frac{2\gamma}{\gamma - 1}\, R_{air}\, T_0 \left[ 1 - \left(\frac{P_a}{P_0}\right)^{\frac{\gamma-1}{\gamma}} \right]}
$$

At 380 bar and 293 K this gives about **690 m/s**. Even with infinite expansion, room-temperature air can never exceed 767 m/s. Real nozzles lose some of this to friction and imperfect expansion, so we use $v_{e,0} \approx$ **600 m/s**.

**Step 3: mass flow to hover.** Thrust is mass flow times exhaust velocity [Sutton]:

$$
F = \dot{m}\, v_e
\quad\Rightarrow\quad
\dot{m}_h = \frac{F_h}{v_e} = \frac{17\,660}{600} \approx 29\ \text{kg/s}
$$

Hovering eats almost 30 kg of air every second.

**Step 4: usable air.** With $P_{min}$ = 30 bar as the lowest useful feed pressure, the trapped mass from 4.2 is

$$
\frac{m_{min}}{m_{g,0}} = \left(\frac{30}{380}\right)^{1/1.4} \approx 0.16
\quad\Rightarrow\quad
m_{min} \approx 41\ \text{kg}, \qquad m_u \approx 209\ \text{kg}
$$

About 84% of the air is usable.

*Consistency check:* 250 kg in 0.6 m³ at 380 bar implies a compressibility factor $Z = P V / (m R_{air} T) \approx 1.09$, while real air at that pressure has $Z \approx 1.15$. The stated mass and the reported pressure agree to within their "about". The same check shows the limit of our ideal-gas model: at full pressure, real air deviates from it by 10–15%. That is acceptable for a budget, but it is one more reason to read the numbers below as estimates.

**Step 5: total impulse and a first hover time.** The cleanest way to state a propellant budget is total impulse, the total push the tank can deliver:

$$
I_{tot} = m_u\, v_e \approx 209 \times 600 \approx 126\ \text{kN·s}
$$

Divided by the hover thrust:

$$
t_{hover} = \frac{I_{tot}}{F_h} = \frac{m_u\, v_e}{m\, g} \approx 7.1\ \text{s}
$$

**Step 6: the cooling gas.** Step 5 assumed a constant exhaust velocity, but the gas cools as the tank empties. At the end of the blowdown:

$$
\frac{T_{end}}{T_0} = \left(\frac{m_{min}}{m_{g,0}}\right)^{\gamma - 1} \approx 0.48
\quad\Rightarrow\quad T_{end} \approx 140\ \text{K}
$$

Colder gas leaves the nozzle slower, and the pressure ratio across the nozzle drops too. Putting both into the formula of Step 2, the exhaust velocity at the end is only about **60%** of its starting value. Two effects pull in opposite directions: the fading exhaust velocity shortens the hover, and the car getting 12% lighter lengthens it. Integrating the hover with both gives **about 6.4 seconds**. Most of the air leaves early, while it is still warm, so the loss is smaller than the 60% figure suggests.

At 140 K the gas is close to air's critical temperature (132.5 K), where the ideal-gas model breaks down completely. In practice the tank walls keep the gas warmer than this.

**Step 7: the push runs out before the air does.** Steps 5 and 6 quietly assumed that the thrusters can always produce the full hover thrust. In a blowdown system they can't. Thrust is proportional to pressure (4.4), and pressure falls fast as the tank empties. The hover ends at the moment the maximum available lift thrust, with every lift valve fully open, drops below the car's weight. That happens long before the pressure reaches 30 bar.

When that happens depends on how much thrust the lift thrusters have with a full tank, expressed as a multiple of the car's weight (the thrust-to-weight ratio). We don't know that number, so the table shows a range. Each row integrates the hover with fading exhaust velocity and decreasing mass:

| Lift thrust-to-weight, full tank | Hover ends at | Air used | Hover time |
|---|---|---|---|
| 1.5 | ≈ 244 bar | ≈ 68 kg | ≈ 2.3 s |
| 2 | ≈ 179 bar | ≈ 104 kg | ≈ 3.4 s |
| 3 | ≈ 117 bar | ≈ 142 kg | ≈ 4.6 s |
| 4 | ≈ 86 bar | ≈ 163 kg | ≈ 5.2 s |

This is the most important number in the budget. **The realistic hover time is roughly 2–5 seconds**, and what limits it is not the air in the tank but the push the air can still deliver. With weak lift thrusters, a large share of the air stays in the tank, unusable for hovering. It can still provide smaller corrections, like turning the car, but not hold it up.

**Cross-check: the 80 kN claim.** If the four rear thrusters really produced 80 kN together, the whole tank would last at most

$$
t = \frac{I_{tot}}{80\ \text{kN}} \approx 1.6\ \text{s}
$$

and in practice less, since that thrust would also fade. That fits short bursts of acceleration, not a hover.

**What this means for control.** Two lessons carry into the rest of the post. First, the controller is working against a clock of a few seconds. Second, that clock does not tick evenly: as the pressure falls, the same valve opening delivers less thrust, and the margin between the available thrust and the thrust needed to hold the car up shrinks until it is gone. A controller that knows this can plan for it, for example by braking the car while it still has strong thrust. A controller that doesn't will discover it too late.

### 4.6 The output: what can be measured

The last piece of the model is what the sensors deliver:

$$
\mathbf{y} =
\begin{bmatrix} \mathbf{q} \\ \boldsymbol{\omega} \\ z \\ v_z \\ P \\ T \end{bmatrix} \in \mathbb{R}^{11}
$$

| Output | Sensor |
|---|---|
| $\mathbf{q}$ (4) | IMU, with an attitude filter |
| $\boldsymbol{\omega}$ (3) | IMU gyroscopes |
| $z$ | altimeter (lidar or radar), or external tracking |
| $v_z$ | altimeter rate, fused with IMU acceleration |
| $P$ | tank pressure sensor |
| $T$ | tank temperature sensor |

Two points are worth noting.

**Propellant is not measured, it is estimated.** No sensor reads $m_u$ directly. Inverting the isentropic pressure relation from 4.2 gives it from the tank pressure:

$$
\hat{m}_g = m_{g,0} \left(\frac{P}{P_0}\right)^{1/\gamma},
\qquad
\hat{m}_u = \hat{m}_g - m_{min}
$$

The measured temperature then serves as a cross-check: if it stays warmer than the isentropic prediction, the walls are adding heat and the estimate can be corrected.

**A downward-looking altimeter is blind when the car is inverted.** A lidar or radar altimeter points through the floor of the car. Upside down, it points at the sky. During recovery, height has to come from integrating the IMU or from external tracking. For a remote-operated demo on a test site, external tracking is a plausible choice.

In practice, a state estimator such as a Kalman filter fuses all of these into the estimate $\hat{\mathbf{x}}$ that each MPC prediction starts from.

**The model in one line.** We now have everything MPC needs from the plant:

$$
\dot{\mathbf{x}} = f(\mathbf{x}, \mathbf{u}),
\qquad
\mathbf{y} = h(\mathbf{x}),
\qquad
\mathbf{x} \in \mathbb{R}^{14},\ \ \mathbf{u} \in [0,1]^{10},\ \ \mathbf{y} \in \mathbb{R}^{11}
$$

Fourteen states, ten valve openings, eleven measurements, and two nonlinearities that drive everything that follows: thrust that rotates with the car, and thrust that fades with the tank.



## 5. Constraints, recovery and the landing goal

Section 4 gave MPC a model to predict with. This section gives it the rest: the rules it must never break, and what "landing well" actually means. The goal has two parts. First the car must be turned upright. Only then can it be brought down gently.

### 5.1 Constraints

A constraint is a rule the controller's plan must respect at every step of the horizon. There are five.

**Rule 1: thrusters only push, and they get weaker.**

$$
0 \le u_i \le 1
\qquad\Longleftrightarrow\qquad
0 \le F_i \le F_{i,max}(m_g) = F_{i,0} \left(\frac{m_g}{m_{g,0}}\right)^{\gamma}
$$

> [!info]
> Each valve sits somewhere between closed and fully open, so each thruster delivers somewhere between nothing and its current maximum. The lower bound says a thruster can never pull. The upper bound is the fading thrust from section 4.4: the less air in the tank, the lower the ceiling.

**Rule 2: valves move at a limited speed.**

$$
|\dot{u}_i| \le \dot{u}_{max}
$$

> [!info]
> A valve cannot jump from closed to open. The controller has to plan its thrust changes ahead of time, which is one more thing a purely reactive controller cannot do.

**Rule 3: don't spin too fast.**

$$
|\omega_x| \le \omega_{max}, \qquad |\omega_y| \le \omega_{max}, \qquad |\omega_z| \le \omega_{max}
$$

> [!info]
> The rotation rate about each axis stays below a limit. This protects the structure and keeps the sensors within their range.

**Rule 4: always keep enough air to land.**

$$
m_u \ge m_{res}(\mathbf{x})
$$

> [!info]
> At every moment, the usable air must be at least the amount needed to land safely from the current state. The reserve $m_{res}$ depends on the state: a car that is high, falling fast or upside down needs more air than one hovering just above the pad. Sections 5.2 and 5.3 show where it comes from.

**Rule 5: be upright near the ground.**

$$
z \le z_g \quad\Longrightarrow\quad 1 - 2\,(q_1^2 + q_2^2) \ \ge\ \cos\theta_{max}
$$

> [!info]
> Below a gate height $z_g$, the car must be nearly level. The left side of the inequality is the cosine of the car's tilt angle, read from the last entry of the rotation matrix in section 4.3: it equals 1 when the car is upright and −1 when it is upside down. So the rule says "below the gate, the tilt is at most $\theta_{max}$."

Above the gate there is no tilt rule at all. That is deliberate: a tilt limit everywhere would forbid the very recovery the car has to perform after the flip.

### 5.2 Recovery: turning the car upright

When the car leaves the ramp it may be on its side or upside down, and it cannot brake yet: inverted, its lift thrusters push it *toward* the ground. So the first job is to rotate, and while it rotates the car is essentially falling.

**How long does turning take?** The fastest way to rotate by an angle $\phi$ and stop there is *bang-bang*: full torque one way for the first half, full torque the other way for the second half.

With maximum torque $\tau_{max}$ and moment of inertia $J_\phi$ about the rotation axis, the angular acceleration is

$$
\alpha = \frac{\tau_{max}}{J_\phi}
$$

During the first half, of duration $t_{rot}/2$, the car speeds up from rest and turns through

$$
\phi_1 = \frac{1}{2}\,\alpha \left(\frac{t_{rot}}{2}\right)^2
$$

The second half mirrors the first: it slows down from the same rate to zero and turns through the same angle, $\phi_2 = \phi_1$. The total angle is therefore

$$
\phi = \phi_1 + \phi_2 = \alpha \left(\frac{t_{rot}}{2}\right)^2
$$

Solving for the time:

$$
\left(\frac{t_{rot}}{2}\right)^2 = \frac{\phi}{\alpha}
\qquad\Longrightarrow\qquad
t_{rot} = 2\sqrt{\frac{\phi}{\alpha}} = 2\sqrt{\frac{\phi\, J_\phi}{\tau_{max}}}
$$

Rule 2 makes this slightly slower in practice, since the valves need a moment to switch the torque from one direction to the other.

**How much height does it cost?** If the car starts the maneuver with no vertical speed and gets no useful lift while rotating, it is in free fall:

$$
\Delta z = \frac{1}{2}\, g\, t_{rot}^2
$$

Because the fall grows with the *square* of the time, even a rotation of a second or so costs several meters. And it is worse than this formula suggests: section 4.4 noted that with push-only thrusters every torque comes with some net push, and upside down that push points at the ground.

This explains something about the demo. The car does not flip from a standstill. It leaves the ramp with momentum and rotates while still traveling upward, which buys the height it needs. For the controller, it means the reserve in Rule 4 depends on **attitude**, not only on height and speed. An inverted car close to the ground may already be past the point where a safe landing is possible.

### 5.3 Encoding a soft landing

Once the car is upright and below the gate, the second part of the goal begins: touch down gently.

**Why "reach the pad" is not enough.** The obvious goal is "end at the pad, level." But a controller given only that will happily arrive at full speed, because nothing in the goal says *how* to arrive. A soft landing has to be written into the problem.

There are many ways to do this: constraints on the final state, barrier functions, reachable sets. We pick one of the simplest.

**The descent corridor.**

$$
-v_z \ \le\ v_{td} + \kappa\,z
$$

*In words:* the closer the car is to the ground, the slower it may fall. Here $z$ is the height above the pad (section 4.1) and $-v_z$ the descent speed (positive when falling). Two numbers define the corridor:

- $v_{td}$: the touchdown speed the suspension can absorb, for example 0.5 m/s.
- $\kappa$ (in 1/s): how quickly the allowed speed shrinks as the ground approaches.

At 3 m with $\kappa$ = 1 s⁻¹, the car may fall at up to 3.5 m/s. At 1 m, only 1.5 m/s. At the ground, 0.5 m/s.

**Why it guarantees a soft landing.** Suppose the car rides exactly on the limit, the fastest descent the corridor allows. Since $\dot{z} = v_z$, that means

$$
\frac{dz}{dt} = -(v_{td} + \kappa\,z)
$$

To solve it, shift the variable: let $w = z + v_{td}/\kappa$. Then $dw/dt = dz/dt$, and the right side becomes $-\kappa\,w$:

$$
\frac{dw}{dt} = -\kappa\,w
\qquad\Longrightarrow\qquad
w(t) = w_0\, e^{-\kappa t}
$$

an exponential decay. Shifting back, with $w_0 = z_0 + v_{td}/\kappa$ for a start height $z_0$:

$$
z(t) = \left(z_0 + \frac{v_{td}}{\kappa}\right) e^{-\kappa t} - \frac{v_{td}}{\kappa}
$$

**When does it land?** Set $z(t_{land}) = 0$:

$$
\left(z_0 + \frac{v_{td}}{\kappa}\right) e^{-\kappa t_{land}} = \frac{v_{td}}{\kappa}
\qquad\Longrightarrow\qquad
e^{-\kappa t_{land}} = \frac{v_{td}}{v_{td} + \kappa\,z_0}
$$

Taking the logarithm of both sides:

$$
t_{land} = \frac{1}{\kappa} \ln\!\left(\frac{v_{td} + \kappa\,z_0}{v_{td}}\right) = \frac{1}{\kappa} \ln\!\left(1 + \frac{\kappa\,z_0}{v_{td}}\right)
$$

**How fast is it going at touchdown?** On the limit, the descent speed is $v_{td} + \kappa\,z$. At $z = 0$ that is exactly $v_{td}$. So any descent inside the corridor reaches the ground at $v_{td}$ or slower, in finite time. No special logic is needed for the last second: the rule itself guarantees the soft landing.

For the example above, from 3 m: $t_{land} = \ln(1 + 3/0.5) = \ln 7 \approx 1.9$ s.

**How hard does it brake?** On the limit, $v_z = -(v_{td} + \kappa\,z)$. Differentiating with respect to time:

$$
\dot{v}_z = -\kappa\,\dot{z} = -\kappa\,v_z = \kappa\,(v_{td} + \kappa\,z)
$$

This is positive, an upward deceleration, and it is largest at the top of the corridor, where $z = z_0$:

$$
a_{max} = \kappa\,(v_{td} + \kappa\,z_0)
$$

To produce it, Newton's law in the vertical direction, $m\,\dot{v}_z = F_{lift} - m\,g$, requires a total lift thrust of

$$
F_{lift} = m\,(g + a_{max})
$$

and that thrust must be available: $m\,(g + a_{max}) \le F_{lift,max}(m_g)$, the combined thrust of the lift thrusters with their valves fully open. In the example, $a_{max} = 1 \times (0.5 + 3) = 3.5$ m/s², so the thrusters must deliver about 1.36 times the car's weight.

This is how $\kappa$ is chosen. A steep corridor (large $\kappa$) lands quickly but brakes hard. A shallow one (small $\kappa$) is gentle on the thrusters but takes longer.

**How much air does the landing cost?** The air used is the total impulse divided by the exhaust velocity. The impulse is the lift thrust integrated over the landing:

$$
I = \int_0^{t_{land}} F_{lift}\, dt = \int_0^{t_{land}} m\,(g + \dot{v}_z)\, dt = m\,g\,t_{land} + m \int_0^{t_{land}} \dot{v}_z\, dt
$$

The last integral is just the change in vertical speed, from $-(v_{td} + \kappa\,z_0)$ at the top to $-v_{td}$ at the ground:

$$
\int_0^{t_{land}} \dot{v}_z\, dt = -v_{td} - \big(-(v_{td} + \kappa\,z_0)\big) = \kappa\,z_0
$$

So

$$
m_{desc} = \frac{I}{v_e} = \frac{m\,(g\,t_{land} + \kappa\,z_0)}{v_e}
$$

Two terms: the cost of holding the car up for $t_{land}$ seconds, and the cost of removing its speed. In the example, $m_{desc} \approx 1800 \times (9.81 \times 1.9 + 3)/600 \approx 66$ kg of air.

**The catch: thrust fades.** The steep landing needs 1.36 times the car's weight. Suppose the lift thrusters can deliver twice the car's weight on a full tank. Since thrust follows pressure (section 4.4), 1.36 times is only available while the tank is above about 68% of its starting pressure, roughly 258 bar, which lasts for the first 60 kg of air or so. After that, the car can only fly a shallower corridor, which takes longer, and every extra second is spent holding up 1,800 kg. With only 1.1 times the weight available, for example, the steepest possible corridor from 3 m takes about 2.8 s and costs around 87 kg instead of 66.

So the reserve in Rule 4 is really two reserves: enough **mass** to fly the descent, and enough **pressure** to brake at the rate the descent needs. A controller that waits too long loses both. This is the kind of trade-off MPC is built for: because it predicts the fading thrust, it can see that braking early is cheaper than braking late.

**The touchdown condition.** At contact, the car must be inside a *terminal set*:

$$
|v_z| \le v_{td}, \qquad
\sqrt{v_x^2 + v_y^2} \le v_{h,max}, \qquad
1 - 2\,(q_1^2 + q_2^2) \ge \cos\theta_{td}, \qquad
\|\boldsymbol{\omega}\| \le \omega_{td}, \qquad
(x, y) \in \text{pad}
$$

*In words:* falling slowly, barely moving sideways, level, not rotating, and over the pad.

**The full reserve.** Rule 4's reserve is the sum of both parts of the goal:

$$
m_{res}(\mathbf{x}) \approx m_{rec}(\text{attitude}) + m_{desc}(z, v_z)
$$

the air to turn the car upright (5.2) plus the air to fly the corridor down (5.3).

One effect the model leaves out: in the last meter, the thruster jets hit the pavement and bounce back, changing the thrust. Because MPC re-plans at every step from fresh measurements, it absorbs part of this error. The margins in $v_{td}$ and the terminal set cover the rest.

## 6. Putting it together: the MPC problem

We now have all five ingredients from section 3: a model (4.2–4.5), inputs (4.4), measurements (4.6), constraints (5.1) and a goal (5.2–5.3). This section assembles them into the one optimization problem the controller solves, many times per second.

### 6.1 The decision variables: a plan of valve openings

At every update, the controller chooses a plan: a valve opening vector for each of the next $N$ steps, counted from now ($k = 0$):

$$
\mathbf{u}_0,\ \mathbf{u}_1,\ \dots,\ \mathbf{u}_{N-1}
$$

Ten numbers per step, each between 0 and 1. Because the openings are continuous, the optimizer can work with them directly.

**What if the valves were on/off?** That is how small spacecraft thrusters work: fast solenoid valves that are either open or shut. An optimizer choosing between "open" and "closed" for ten valves at every step faces a *mixed-integer* problem, with an enormous number of combinations, far too slow for real time. The standard workaround is to solve the problem as if the valves were continuous, exactly as we do here, and then turn each opening $u_i$ into pulses: within a short period, the valve stays open for the fraction $u_i$ of the time. This is *pulse-width modulation* (PWM), and it gives the same average thrust. The rest of this section would stay the same.

### 6.2 From continuous time to steps

A computer predicts in steps, not continuously. With a time step $\Delta t$, the simplest discretization of $\dot{\mathbf{x}} = f(\mathbf{x}, \mathbf{u})$ replaces the derivative by a difference:

$$
\frac{\mathbf{x}_{k+1} - \mathbf{x}_k}{\Delta t} \approx f(\mathbf{x}_k, \mathbf{u}_k)
\qquad\Longrightarrow\qquad
\mathbf{x}_{k+1} = \mathbf{x}_k + \Delta t\, f(\mathbf{x}_k, \mathbf{u}_k)
$$

We call the right-hand side $\Phi(\mathbf{x}_k, \mathbf{u}_k)$, the discrete model. Real implementations use more accurate integrators, such as Runge–Kutta, but the idea is the same.

The valve speed limit (Rule 2) becomes a limit on how much an opening may change from one step to the next. Replacing the derivative by a difference in the same way:

$$
\left|\frac{u_{i,k+1} - u_{i,k}}{\Delta t}\right| \le \dot{u}_{max}
\qquad\Longrightarrow\qquad
|u_{i,k+1} - u_{i,k}| \le \dot{u}_{max}\, \Delta t
$$

The horizon must be long enough to see the consequences that matter. The landing in section 5.3 takes about 2 seconds, so the controller should look at least that far ahead. With $\Delta t$ = 20 ms (50 updates per second), that means a horizon of about $N$ = 100 steps.

### 6.3 Linearizing around the plan

The discrete model is nonlinear: thrust is rotated by $R(\mathbf{q})$, and its strength depends on the tank. Optimizing over a nonlinear model is slow. The trick is to replace it, at every solve, by a linear approximation that is accurate *near the trajectory the car is actually expected to fly*.

At every step, the controller has the plan from its previous solve, shifted forward by one step: a predicted state $\bar{\mathbf{x}}_k$ and opening $\bar{\mathbf{u}}_k$ for each step of the horizon. A first-order Taylor expansion around that plan gives

$$
\Phi(\mathbf{x}_k, \mathbf{u}_k) \approx \Phi(\bar{\mathbf{x}}_k, \bar{\mathbf{u}}_k) + A_k\,(\mathbf{x}_k - \bar{\mathbf{x}}_k) + B_k\,(\mathbf{u}_k - \bar{\mathbf{u}}_k)
$$

where the matrices are the derivatives of the model along the plan:

$$
A_k = \frac{\partial \Phi}{\partial \mathbf{x}}\bigg|_{\bar{\mathbf{x}}_k, \bar{\mathbf{u}}_k},
\qquad
B_k = \frac{\partial \Phi}{\partial \mathbf{u}}\bigg|_{\bar{\mathbf{x}}_k, \bar{\mathbf{u}}_k}
$$

(This $B_k$ is the sensitivity of the next state to the valve openings. It is built from the effectiveness matrix $B$ of section 4.4, the rotation $R(\mathbf{q})$ and the thrust limits $F_{i,max}(m_g)$.)

Collecting the terms that do not depend on $\mathbf{x}_k$ or $\mathbf{u}_k$ into one constant,

$$
\mathbf{c}_k = \Phi(\bar{\mathbf{x}}_k, \bar{\mathbf{u}}_k) - A_k\,\bar{\mathbf{x}}_k - B_k\,\bar{\mathbf{u}}_k
$$

the prediction becomes linear:

$$
\mathbf{x}_{k+1} = A_k\,\mathbf{x}_k + B_k\,\mathbf{u}_k + \mathbf{c}_k
$$

*Why not linearize once, around hover?* That is the textbook approach, and it fails here. A model linearized around "upright and still" predicts nonsense when the car is upside down: it would still believe that the lift thrusters push up. Re-linearizing at every step around the current plan keeps the model valid wherever the car actually is, including inverted. This is known as *time-varying linear MPC*, or the *real-time iteration* scheme [Diehl et al.].

Two more details live here. First, $B_k$ contains the fading thrust: as the tank empties, the same opening has a smaller effect, and the new estimate of $m_u$ updates $B_k$ at every solve. Second, the quaternion's four numbers are not independent (they must stay a unit vector), so inside the optimization the attitude is expressed as a small three-component rotation $\delta\boldsymbol{\theta}$ away from the planned attitude. This keeps the problem free of the unit-norm constraint.

### 6.4 The cost: what "good" means

Constraints say what is forbidden. The cost says what is preferred among everything that is allowed:

$$
J_{cost} = \sum_{k=0}^{N-1} \Big( (\mathbf{x}_k - \mathbf{x}_{ref,k})^{\top} Q\, (\mathbf{x}_k - \mathbf{x}_{ref,k}) \;+\; \lambda \sum_{i=1}^{10} u_{i,k}\, F_{i,max} \Big) \;+\; (\mathbf{x}_N - \mathbf{x}_{ref,N})^{\top} Q_N\, (\mathbf{x}_N - \mathbf{x}_{ref,N})
$$

(We write $J_{cost}$ to keep it apart from the inertia matrix $J$.) Term by term:

- **Tracking:** $(\mathbf{x}_k - \mathbf{x}_{ref,k})^{\top} Q\, (\mathbf{x}_k - \mathbf{x}_{ref,k})$ penalizes deviation from the reference: upright, over the pad, descending along the corridor. The weight matrix $Q$ says which deviations matter most. Tilt and vertical speed get large weights; small sideways drift gets less.
- **Propellant:** $\lambda \sum_i u_{i,k}\, F_{i,max}$ is the total thrust at step $k$, weighted by $\lambda$. Since each thruster's mass flow is its thrust divided by $v_e$, total thrust is proportional to the air spent. The weight $\lambda$ sets the exchange rate between accuracy and air.
- **Terminal:** $(\mathbf{x}_N - \mathbf{x}_{ref,N})^{\top} Q_N\, (\mathbf{x}_N - \mathbf{x}_{ref,N})$ pulls the end of the horizon toward the touchdown state, so the plan always heads for the pad even when the pad is beyond the horizon [Rawlings et al.].

### 6.5 The full problem

Putting everything together, at every step the controller solves:

$$
\begin{aligned}
\min_{\mathbf{u}_0, \dots, \mathbf{u}_{N-1}} \quad & J_{cost} \\[4pt]
\text{subject to} \quad
& \mathbf{x}_{k+1} = A_k\,\mathbf{x}_k + B_k\,\mathbf{u}_k + \mathbf{c}_k && \text{model (6.3)} \\
& \mathbf{x}_0 = \hat{\mathbf{x}} && \text{current estimate (4.6)} \\
& 0 \le u_{i,k} \le 1 && \text{Rule 1} \\
& |u_{i,k+1} - u_{i,k}| \le \dot{u}_{max}\, \Delta t && \text{Rule 2} \\
& |\omega_{j,k}| \le \omega_{max} && \text{Rule 3} \\
& m_{u,k} \ge m_{res} && \text{Rule 4} \\
& |\delta\theta_{x,k}|,\ |\delta\theta_{y,k}| \le \theta_{max} \ \text{ when } \bar{z}_k \le z_g && \text{Rule 5} \\
& -v_{z,k} \le v_{td} + \kappa\,z_k \ \text{ when } \bar{z}_k \le z_g && \text{corridor (5.3)} \\
& \mathbf{x}_N \in \mathcal{X}_{td} \ \text{ if the horizon reaches the ground} && \text{terminal set (5.3)}
\end{aligned}
$$

Here the index $k$ counts steps *within* the horizon, from 0 (now) to $N$. A few notes on how each line becomes solver-friendly:

- **Rules 1, 2 and 3** are simple bounds on the variables.
- **Rule 4** uses a reserve computed from the current state at each solve, so within one solve it is a fixed number and the constraint is a simple bound on $m_{u,k}$.
- **Rule 5 and the corridor** only apply below the gate. Whether step $k$ is below the gate is decided from the previous plan's predicted height $\bar{z}_k$, so within one solve each step either has the constraint or does not. The tilt is written as the small attitude error $\delta\boldsymbol{\theta}$ from 6.3, which turns the cosine condition into simple bounds.
- **The corridor** is linear in $v_z$ and $z$, exactly as written in 5.3: no approximation needed.
- **The terminal set** is written as bounds on each component, a box around the touchdown state.

### 6.6 Why it is fast enough

Every constraint above is linear in the unknowns, and the cost is quadratic. A problem of that shape is a **quadratic program** (QP), and QPs are convex: they have a single best solution, and specialized solvers find it in milliseconds even with hundreds of variables. That is what makes it possible to re-solve the whole problem 50 times per second.

Each cycle of the controller then looks like this:

1. **Measure** the outputs $\mathbf{y}$ and estimate the state $\hat{\mathbf{x}}$, including the remaining air $\hat{m}_u$ from the tank pressure.
2. **Re-linearize** the model along the previous plan, shifted forward by one step, using the new $\hat{m}_u$ for the thrust limits.
3. **Solve** the QP for the valve plan $\mathbf{u}_0, \dots, \mathbf{u}_{N-1}$.
4. **Apply** only the first opening $\mathbf{u}_0$ to the valves.
5. **Repeat** 20 ms later.

Everything from sections 4 and 5 shows up in this loop. The fading thrust enters through $B_k$, so the controller always knows how much push is left. The valve speed limit forces it to plan thrust changes ahead of time. The recovery and the descent are not separate programs: the gate and the corridor switch on automatically as the predicted height drops below $z_g$. And because the controller looks two seconds ahead, it can see that braking early, while the thrust is still strong, costs less air than braking late.

**In practice**, real systems often split this work. A fast, simple attitude controller runs underneath, at hundreds of updates per second, and keeps the car stable [Lee et al.]. The MPC runs on top at a slower rate and plans the translation and the propellant. Rocket landings use the same idea at a larger scale: the powered-descent guidance that lands reusable boosters solves a closely related convex problem, with a fuel budget and a soft-landing target of its own [Açıkmeşe & Ploen].


<img src="/tesla_roadster_control_analysis/mpc_architecture.svg" alt="The MPC feedback loop" style="width:100%; max-width:1000px; display:block; margin:0 auto;">

*Figure: the MPC loop. The optimizer proposes the valve plan $\mathbf{u}_0, \dots, \mathbf{u}_{N-1}$, the model predicts the resulting states and checks the constraints, and the first command $\mathbf{u}_0$ goes to the valves. The sensors close the loop with $\mathbf{y} = h(\mathbf{x})$, including the tank's pressure and temperature.*

## 7. Closing


We started with a car flying on compressed air and one question: how do you land it? We never saw Tesla's design, and we didn't need to. Treating the car purely through its inputs and outputs, a few pages of physics were enough to show what any controller for this stunt has to deal with, and one plausible way to do it.
 
**What the physics forces on any design.** Whatever Tesla and SpaceX actually built, these four facts don't depend on their choices:
 
- **The thrust fades.** In a blowdown system, thrust follows tank pressure, and pressure falls faster than the air runs out. The hover ends when the push is gone, not when the tank is empty: roughly 2 to 5 seconds, depending on how strong the lift thrusters are.
- **The tank is finite.** About 250 kg of air buys a few seconds of flight, and every second costs more than the one before.
- **Thrusters only push.** The car can't pull itself upward, can't twist without also pushing, and moves sideways by tilting.
- **Recovery costs height.** Upside down, the lift thrusters point the wrong way. The car has to rotate before it can brake, and it falls while it rotates. That is why the stunt flips the car while it is still rising off the ramp.
**Why MPC fits.** Each of these is a constraint or a deadline, and MPC is built for exactly that. It predicts with a model, so it knows the thrust will be weaker in a second than it is now, and it brakes early while braking is still cheap. It writes the rules directly into the problem, so push-only thrusters, slow valves, the air reserve and the descent corridor are respected by design, not discovered by collision. And it re-plans every 20 ms, so the recovery and the landing are not separate programs: the same optimization turns the car upright, then switches on the corridor as it passes the gate.
 
**What stays Tesla's secret.** The real thruster layout, the real valves, the mass and inertia, the sensors and all of the tuning. Our numbers are estimates, built on stated, reported and assumed values, and labeled as such. The structure of the problem is the part we can be confident about.
 
**So, is it a flying car?** Here the same numbers deserve an honest reading. A few seconds of powered flight, from a tank that needs refilling afterwards, is not flight in any useful sense. It is closer to a very sophisticated jump. The car cannot hover over traffic, cross a river or go anywhere it couldn't drive. Even with generous assumptions, the air runs out, or rather the push does, before most passengers would have finished saying "it's flying" (still it's very cool!!!). And the thrusters are loud enough that spectators were kept hundreds of meters away ([Electrek](https://electrek.co/2026/08/14/tesla-flying-roadster-demo-this-month-no-driver/)).
 
That doesn't make the demo less impressive. Keeping a 1.8-tonne body under control on a few seconds of fading thrust, turning it upright mid-air and setting it down softly is a genuinely hard control problem, and solving it in public is an achievement. But it is an achievement of control engineering, not of transport. The physics of a compressed-air tank puts a hard ceiling on what this car can do, and no controller, however clever, can raise it. The honest headline is not "the flying car is here", but "someone landed a car on a few seconds of air". For a control engineer, that is the more interesting story anyway.
 




## Extra: simulating the tank blowdown

Section 4.5 estimated how long the car can hover, one formula at a time. Here we check it by running the model: the car hovers, and we follow it second by second until it can't any more.

### The three quantities that matter

To understand the hover you only need to watch three things:

- **Tank pressure** $P$. It falls as air leaves the tank (section 4.2).
- **Thrust needed**, $F_{need} = m\,g$: the car's weight. To hover, the thrusters must push exactly this much. It barely changes; the car gets only slightly lighter as air leaves.
- **Thrust available**, $F_{avl}$: the most the lift thrusters could push with their valves fully open. It follows the tank pressure, so it falls too (section 4.4).

Everything else follows from these. The valves only need to deliver the thrust needed, so their opening is the ratio of the two thrusts:

$$
u = \frac{F_{need}}{F_{avl}}
$$

And the hover lasts exactly as long as the thrust available is larger than the thrust needed. When the two are equal, the valves are fully open ($u = 1$) and there is nothing left to give.

### One hover, step by step

We need one number we don't know: how strong the lift thrusters are. We assume they can push with **twice the car's weight on a full tank**, about 35 kN. (We try other sizes at the end.)

![Tank blowdown during a hover](/tesla_roadster_control_analysis/tank_blowdown.png)

*Figure: a simulated hover with the model of section 4, for lift thrusters that can push twice the car's weight on a full tank. Top: tank pressure. Bottom: thrust available (solid) and thrust needed (dashed); the percentages show how far the valves must be open.*

The same numbers as a table:

| Time | Air used | Tank pressure | Thrust needed | Thrust available | Valve opening |
|---|---|---|---|---|---|
| 0 s | 0 kg | 380 bar | 17.7 kN | 35.3 kN | 50% |
| 1 s | 30 kg | 319 bar | 17.4 kN | 29.6 kN | 59% |
| 2 s | 59 kg | 260 bar | 17.1 kN | 24.2 kN | 71% |
| 3 s | 90 kg | 204 bar | 16.8 kN | 19.0 kN | 89% |
| 3.5 s | 104 kg | 179 bar | 16.6 kN | 16.6 kN | **100%** |

Reading it from top to bottom:

1. **At the start**, the thrusters could give 35 kN, but the car needs only 17.7 kN. So the valves are half open.
2. **Every second, about 30 kg of air leaves.** The pressure falls, and since thrust follows pressure, the thrust available falls with it. The thrust needed stays almost the same.
3. **The gap between the two lines shrinks**, the shaded "spare thrust" in the figure. To keep delivering the thrust needed from a smaller maximum, the valves must open wider: 59%, 71%, 89%.
4. **At 3.5 s the two lines meet.** The valves are fully open and give exactly the car's weight. A moment later they can't keep up, and the car starts to sink.

At that point the car has used **104 kg** of its 209 kg of usable air, so **about 105 kg is still in the tank**. The air didn't run out. The pressure did.

> [!tip] Why not just fit bigger thrusters?
> It is tempting to think bigger nozzles use more air and empty the tank faster. They don't. A thruster's air use depends on the thrust it produces, not on its size: $\dot{m} = F / v_e$. While hovering, the thrust is always the car's weight, so a big nozzle simply runs with its valve less open and uses exactly as much air as a small one. What a bigger nozzle changes is only the solid line in the figure: it starts higher, so it takes longer to fall to the dashed line.

### Other thruster sizes

The same simulation for four thruster sizes, written as thrust-to-weight $T/W$ on a full tank. The car is the same in every case; only the thrust available at the start changes:

| Lift thrusters, $T/W$ | Thrust available at start | Hover ends at | Air used | Usable air left | Hover time |
|---|---|---|---|---|---|
| 1.5 | 26 kN | ≈ 244 bar | ≈ 68 kg | ≈ 141 kg | ≈ 2.3 s |
| 2 | 35 kN | ≈ 179 bar | ≈ 104 kg | ≈ 105 kg | ≈ 3.5 s |
| 3 | 53 kN | ≈ 117 bar | ≈ 142 kg | ≈ 67 kg | ≈ 4.7 s |
| 4 | 71 kN | ≈ 86 bar | ≈ 163 kg | ≈ 46 kg | ≈ 5.3 s |

Stronger thrusters hover longer, because their thrust available has further to fall before it meets the thrust needed. But in every case the hover ends with usable air still in the tank.

> [!abstract] What the simulation shows
> **The push runs out before the air does.** And the useful part of the hover ends even earlier than the last row suggests: near the end the spare thrust in the figure is almost zero, so there is nothing left for corrections, nothing to fight a gust, stop a sink or level a tilt. An MPC can see this coming only because the fading thrust is part of its model.

> [!warning] What this simulation is not
> It checks that the numbers in section 4.5 follow from our own equations. It says nothing about Tesla's real car, whose thrusters, valves and tank we don't know. The gas also cools as it expands, to about 190 K by the end of the longest hover. Real tank walls would warm it slightly, giving a little more thrust than modeled.

<details>
<summary>Python script</summary>

```python
"""
Tank blowdown during a hover, using the model of section 4.

The car hovers (thrust = weight) for as long as it can. Three quantities
tell the whole story:

  tank pressure      P(t)      = P0 (m_g/m_g0)^gamma                  (4.2)
  thrust needed      F_need(t) = (m_dry + m_g) g                      (hover)
  thrust available   F_avl(t)  = F_avl0 (m_g/m_g0)^gamma              (4.4)
                                  (all lift valves fully open)

From those two thrust lines follow the valve opening u = F_need / F_avl
and the margin F_avl - F_need. Air leaves at dm_g/dt = -F_need / v_e,
with v_e = v_e0 (m_g/m_g0)^((gamma-1)/2)                             (4.3)

The hover ends when F_avl drops to F_need (valves fully open).

Run:  python tank_blowdown.py
Out:  tank_blowdown.svg, tank_blowdown.png, and printed tables.
"""

import numpy as np
from scipy.integrate import solve_ivp
import matplotlib.pyplot as plt

# ---- parameters (table in section 4.1) ----
g = 9.81          # m/s^2
gamma = 1.4
P0 = 380e5        # Pa   (reported, ~5,500 psi)
P_min = 30e5      # Pa   (assumed lowest useful feed pressure)
m_g0 = 250.0      # kg   (stated)
m_dry = 1550.0    # kg   (assumed)
m_full = m_dry + m_g0
v_e0 = 600.0      # m/s  (estimated in 4.5)
m_min = m_g0 * (P_min / P0) ** (1 / gamma)   # air trapped below P_min
m_usable = m_g0 - m_min


def fraction(m_g):
    """Fraction of the original air still in the tank."""
    return m_g / m_g0


def hover(TW, t_end=10.0):
    """Hover with full-tank lift thrust-to-weight TW. Returns time series."""
    F_avl0 = TW * m_full * g                  # thrust available, full tank

    def air_use(t, s):
        m_g = s[0]
        F_need = (m_dry + m_g) * g
        v_e = v_e0 * fraction(m_g) ** ((gamma - 1) / 2)
        return [-F_need / v_e]

    def push_gone(t, s):                      # available thrust = needed thrust
        m_g = s[0]
        return F_avl0 * fraction(m_g) ** gamma - (m_dry + m_g) * g
    push_gone.terminal, push_gone.direction = True, -1

    def tank_empty(t, s):                     # pressure reaches P_min
        return s[0] - m_min
    tank_empty.terminal, tank_empty.direction = True, -1

    sol = solve_ivp(air_use, (0, t_end), [m_g0], events=[push_gone, tank_empty],
                    dense_output=True, max_step=0.01, rtol=1e-8, atol=1e-8)
    t, m_g = sol.t, sol.y[0]
    return dict(t=t, m_g=m_g,
                P=P0 * fraction(m_g) ** gamma,
                F_need=(m_dry + m_g) * g,
                F_avl=F_avl0 * fraction(m_g) ** gamma,
                sol=sol, F_avl0=F_avl0)


def state_at(run, t):
    m_g = run["sol"].sol(t)[0]
    F_need = (m_dry + m_g) * g
    F_avl = run["F_avl0"] * fraction(m_g) ** gamma
    return m_g, P0 * fraction(m_g) ** gamma, F_need, F_avl


# ---- the walkthrough case: T/W = 2 ----
TW = 2.0
run = hover(TW)
t_end = run["t"][-1]

print(f"T/W = {TW:g}, second by second")
print(f"{'time':>5} {'air used':>9} {'pressure':>9} {'needed':>8} {'available':>10} {'valves':>7}")
marks = [0, 1, 2, 3, t_end]
for t in marks:
    m_g, P, F_need, F_avl = state_at(run, t)
    print(f"{t:4.1f}s {m_g0 - m_g:7.0f}kg {P/1e5:6.0f}bar {F_need/1e3:6.1f}kN "
          f"{F_avl/1e3:8.1f}kN {100*F_need/F_avl:6.0f}%")

# ---- other thruster sizes: only where the hover ends ----
print(f"\nusable air {m_usable:.0f} kg")
print(f"{'T/W':>4} {'avail. at start':>15} {'ends at':>9} {'air used':>9} {'air left':>9} {'time':>6}")
for tw in [1.5, 2.0, 3.0, 4.0]:
    r = hover(tw)
    used = m_g0 - r["m_g"][-1]
    print(f"{tw:4.1f} {r['F_avl0']/1e3:12.0f} kN {r['P'][-1]/1e5:6.0f}bar "
          f"{used:7.0f}kg {m_usable - used:7.0f}kg {r['t'][-1]:5.1f}s")

# ---- figure: paper style, black and white ----
plt.rcParams.update({
    "font.family": "serif", "mathtext.fontset": "cm",
    "font.size": 11, "axes.linewidth": 0.8,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": "0.9", "grid.linewidth": 0.6,
})

fig, (a, b) = plt.subplots(2, 1, figsize=(8, 7.2), sharex=True,
                           constrained_layout=True)
t = run["t"]

# (a) tank pressure
a.plot(t, run["P"] / 1e5, color="k", lw=2)
for tm in marks:
    _, P, _, _ = state_at(run, tm)
    a.plot(tm, P / 1e5, "o", ms=6, mfc="white", mec="k", mew=1.3, zorder=3)
    a.annotate(f"{P/1e5:.0f} bar", (tm, P / 1e5), xytext=(6, 6),
               textcoords="offset points", fontsize=10)
a.set(ylim=(0, 420), ylabel="tank pressure [bar]",
      title="(a) The tank pressure falls as air is used")

# (b) thrust needed vs thrust available
b.fill_between(t, run["F_need"] / 1e3, run["F_avl"] / 1e3, color="0.9", lw=0)
b.plot(t, run["F_avl"] / 1e3, color="k", lw=2)
b.plot(t, run["F_need"] / 1e3, color="k", lw=1.6, ls="--")
b.text(0.6, 33.5, "thrust available (valves fully open)", fontsize=10)
b.text(0.15, 9.0, "thrust needed: the car's weight (dashed)", fontsize=10)
b.text(0.9, 21.5, "spare thrust", fontsize=10, color="0.35", style="italic")
for tm in marks[:-1]:
    _, _, F_need, F_avl = state_at(run, tm)
    b.plot(tm, F_need / 1e3, "o", ms=4, color="k", zorder=3)
    b.annotate(f"{100*F_need/F_avl:.0f}%", (tm, F_need / 1e3),
               xytext=(0 if tm else 6, -16), textcoords="offset points", fontsize=10,
               ha="center" if tm else "left")
b.text(0.15, 5.0, "percentages: how far the valves must be open", fontsize=10, color="0.25")
_, _, F_need_end, _ = state_at(run, t_end)
b.plot(t_end, F_need_end / 1e3, "o", ms=7, mfc="white", mec="k", mew=1.4, zorder=3)
b.annotate(f"hover ends, {t_end:.1f} s\nvalves 100% open", (t_end, F_need_end / 1e3),
           xytext=(10, -28), textcoords="offset points", fontsize=10)
b.set(xlim=(0, 4.4), ylim=(0, 40), xlabel="time [s]", ylabel="thrust [kN]",
      title="(b) The available thrust falls until it meets the thrust needed")

for axis in (a, b):
    axis.axvline(t_end, color="k", lw=0.8, ls=":")

fig.savefig("tank_blowdown.svg")
fig.savefig("tank_blowdown.png", dpi=200)
print("\nsaved tank_blowdown.svg / .png")
```

</details>




## References

- **[Sutton]** G. P. Sutton, O. Biblarz, *Rocket Propulsion Elements*, Wiley.
- **[Anderson]** J. D. Anderson, *Modern Compressible Flow*, McGraw-Hill.
- **[Markley & Crassidis]** F. L. Markley, J. L. Crassidis, *Fundamentals of Spacecraft Attitude Determination and Control*, Springer.
- **[Rawlings et al.]** J. B. Rawlings, D. Q. Mayne, M. M. Diehl, *Model Predictive Control: Theory, Computation, and Design*, Nob Hill.
- **[Açıkmeşe & Ploen]** B. Açıkmeşe, S. R. Ploen, "Convex Programming Approach to Powered Descent Guidance for Mars Landing," *Journal of Guidance, Control, and Dynamics*, 2007.
- **[Diehl et al.]** M. Diehl, H. G. Bock, J. P. Schlöder, "A Real-Time Iteration Scheme for Nonlinear Optimization in Optimal Feedback Control," *SIAM Journal on Control and Optimization*, 2005.
- **[Lee et al.]** T. Lee, M. Leok, N. H. McClamroch, "Geometric Tracking Control of a Quadrotor UAV on SE(3)," *IEEE Conference on Decision and Control*, 2010.