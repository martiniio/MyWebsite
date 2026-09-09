---
title: "Digital Control of a Salvaged Printer Carriage: Modeling, Identification and PI-DF Control"
pubDate: 2026-07-09
tags: [control-theory, system-identification, arduino, embedded, deadzone-compensation]
description: "A digital control course project: modeling and identifying a printer carriage mechanism, designing a PI-DF controller against a stated overshoot and peak time spec, discretizing it with the Tustin method, and validating the result on real hardware with feedforward added on top."
---

# Digital Control of a Salvaged Printer Carriage

This was originally assigned as coursework in a Digital Control class. The task was to take a real electromechanical system, identify its dynamics from measured data, design a discrete controller that meets a stated performance specification, and validate the result on hardware. The system chosen for this was the carriage rail (CR) mechanism salvaged from a broken inkjet printer: the motor, belt, and encoder assembly that normally moves the print head back and forth. This post documents the process from hardware setup to the final control results.

## Hardware and timing

An Arduino reads the quadrature encoder on the carriage motor (channels A and B, plus a home/limit switch) and drives the motor through a PWM and direction signal pair. A laptop running Python generates test signals and logs data. All time critical work runs on the Arduino.

<img src="/digital_control_prj/HardwareModel.jpg" width="700">

Two hardware timers handle the real time work.

Timer2 generates the control cycle. It runs in CTC mode with a /64 prescaler and `OCR2A = 249`, which at 16 MHz produces a 1 ms tick, giving a 1 kHz control loop. Each tick sets a flag that the main loop checks so that the controller is called exactly once per cycle, keeping the sample time fixed.

Timer1 drives the motor through Fast PWM in 9-bit mode (0 to 511) on `OC1B`, non-inverting, with a /64 prescaler. This gives a PWM carrier frequency of about 488 Hz, well above anything the mechanism can respond to. Background on PWM is available on [Wikipedia](https://en.wikipedia.org/wiki/Pulse-width_modulation).

The encoder is read through an external interrupt (`INT0`) on channel A, triggered on any edge, with channel B's level used to determine direction. This is a simplified [quadrature decoding](https://en.wikipedia.org/wiki/Incremental_encoder) scheme rather than a full 4x count, but the resolution is still sufficient: 14.17 counts per millimeter, or about 0.0706 mm (70 μm) per count, over roughly 288 mm of travel.

Before any control logic runs, a homing routine drives the carriage left until a limit switch triggers, zeroes the encoder at that point, then moves off the switch by a fixed distance so the working range stays clear of the edge. Every run starts from the same known position.

## Identifying the plant

The system was excited with three types of input: a randomized multi-level step sequence, a smooth triangle wave, and a manually driven potentiometer reference.

<img src="/digital_control_prj/step_pulses.png" width="700">

The recorded data was processed in MATLAB's [System Identification Toolbox](https://en.wikipedia.org/wiki/System_identification), fitted to a second order structure with two poles and either zero or one zero. Two candidate transfer functions came out of this process.

<img src="/digital_control_prj/SystemID.jpg" width="700">
<img src="/digital_control_prj/SystemIDmatch1.jpg" width="700">

```
G1(s) = 506.2 / (s^2 + 18.75s + 506.2)                  no zero
G2(s) = (-0.3001s + 511.9) / (s^2 + 18.78s + 511.9)      one zero
```

Both fit the measured data well across all three test signals: step 89.6 percent, triangle 94.0 percent, potentiometer 91.7 percent, averaging 91.8 percent for each candidate. The Bode plots of the two are nearly identical.

<img src="/digital_control_prj/Bode.png" width="700">

Converting each closed-loop fit back to its open-loop form gives:

```
M1(s) = 89.99 / (s(0.0533s + 1))                        pure integrator plus lag
M2(s) = 90.33(1 - 0.000175s) / (s(0.0529s + 1))          same, plus a near-origin zero
```

M2's zero sits at `pz = 0.000175`, far enough from the system's bandwidth that it has almost no effect on the time domain response. Rise time, settling time and overshoot come out nearly the same for both models. Since the extra zero does not add useful information, M1(s) was selected as the design model. It has the physical form expected from a DC motor driven carriage: position is the integral of velocity, in series with a first order electromechanical lag of about 53 ms.

<img src="/digital_control_prj/LinearSystem.drawio.png" width="400">

## The deadzone problem

At low PWM values, static friction and belt backlash prevent the carriage from moving at all. This creates a dead band around zero where commanded PWM produces no motion. A controller that does not account for this spends its time fighting a system that is not responding.

<div style="display:flex; gap:10px; flex-wrap:wrap;">
<img src="/digital_control_prj/DEAD3.png" width="620">
<img src="/digital_control_prj/DEAD4.png" width="620">
</div>

These period plots record, over many cycles, the point at which the carriage actually begins to move relative to the commanded PWM value. There is a clear flat region around zero, and it is not symmetric between directions, which matches a mechanism with different friction in each direction of travel. Averaging over many cycles gives a cleaner picture.

<div style="display:flex; gap:10px; flex-wrap:wrap;">
<img src="/digital_control_prj/DEAD5.png" width="620">
<img src="/digital_control_prj/DEAD6.png" width="620">
</div>

The measured deadzone edges fall in the range of 78 to 92 counts depending on direction. The firmware uses slightly larger values, `POS_DEADZONE = 120` and `NEG_DEADZONE = 100`, to leave a margin above the measured values rather than compensating exactly at the edge. This is a form of [deadband compensation](https://en.wikipedia.org/wiki/Deadband). The compensation logic simply adds the deadzone offset to any nonzero control output before it reaches the PWM register.

```cpp
void DEAD_SAT(){
    if(U[0] > 0) {
      setCarriageDirection(MOVE_RIGHT);
      if((U[0] + POS_DEADZONE) > DUTY_MAX){OCR1B=DUTY_MAX;}
      else{OCR1B = (int)(U[0] + POS_DEADZONE);}
    }else if (U[0] < 0) {
      setCarriageDirection(MOVE_LEFT);
      if((-U[0] + NEG_DEADZONE) > DUTY_MAX){OCR1B=DUTY_MAX;}
      else{OCR1B = (int)(-U[0] + NEG_DEADZONE);}
    }else {
      OCR1B = 0;
    }
    if(abs(error[0])==1){OCR1B=0;}
}
```

The last line is intentional. Once the position error is down to a single encoder count, the motor is cut rather than left dithering across the deadzone boundary to chase the last count.

## Performance specification

Before designing the controller, a concrete specification was set for the closed loop response, evaluated on the linear model with the effect of sampling (the zero order hold) included.

Overshoot must be less than 7 percent. Peak time must be less than 100 ms.

All later design decisions, including controller structure, gain values, sample time and discretization method, were checked against this specification.

## Controller design: P-DF then PI-DF

A bare proportional controller was ruled out early. The identified plant is lightly damped (zeta about 0.09), and a proportional gain alone would produce overshoot in the range of 20 percent or more, well above the 7 percent target.

Differentiating the raw error directly was also ruled out. The encoder resolution is 70 μm per count, coarse enough that a naive derivative amplifies quantization noise. Instead, a filtered derivative of the measured output is used, which both adds damping and avoids derivative kick on setpoint changes. This structure, proportional action plus a filtered derivative on the output, is referred to here as P-DF. This is a standard variation on the [PID controller](https://en.wikipedia.org/wiki/PID_controller).

<img src="/digital_control_prj/PDF_topology.png" width="700">

Using MATLAB's `rltool`, the controller was designed for `Ts = 1 ms` with the zero order hold effect folded into the plant model. This produced `Kp = 0.97`, `Kd = 0.02`, `pf = 85`. Simulating the closed loop with these values gives the following result.

<img src="/digital_control_prj/PDF_result.png" width="700">

Overshoot 2.65 percent, peak time 82.2 ms. Both figures are within the specification.

One result worth noting is that the same controller does not work at a slower sample rate. Repeating the design for `Ts = 10 ms` required different values, `Kp = 0.8`, `Kd = 0.0199`, `pf = 85`, to meet the same specification, because the [zero order hold](https://en.wikipedia.org/wiki/Zero-order_hold) introduces additional phase lag that scales with the sample period. A controller tuned for one sample time does not simply degrade gracefully at a slower one, it can require retuning entirely. Comparing discretization methods at this stage, [Backward Euler versus Tustin](https://en.wikipedia.org/wiki/Bilinear_transform), also showed Tustin holding closer to the continuous design as sample time increased, while Backward Euler introduced noticeably less damping. Based on this, the sample time was kept at 1 ms and Tustin was used for discretization going forward.

P-DF controls the transient response well but leaves a small steady state error, since the anti-deadzone compensation is a fixed table and does not model friction perfectly at every position. This matters particularly for a moving reference such as the triangle wave test, not just for a single step. To remove the steady state error, an integral term was added to the error path, giving a PI-DF controller.

<img src="/digital_control_prj/PIDF_topology.png" width="700">

Re-designed in `rltool` for `Ts = 1 ms`, this produced:

```
W(s)/E(s) = 1.85(s + 0.01)/s        proportional and integral, on the error
V(s)/Y(s) = 3.65s/(s + 130)         filtered derivative, on the measured output
U(s) = W(s) - V(s)
```

## Discretization

Both terms were discretized with the [Tustin (bilinear transform)](https://en.wikipedia.org/wiki/Bilinear_transform) method at `Ts = 1 ms`.

```
W(z) = 1.85(1 - z^-1)/(1 - z^-1)            w[k] = w[k-1] + 1.85 e[k] - 1.85 e[k-1]
V(z) = 3.4272(1 - z^-1)/(1 - 0.8779 z^-1)   v[k] = 0.8779 v[k-1] + 3.4272 y[k] - 3.4272 y[k-1]
U(z) = W(z) - V(z)                          u[k] = w[k] - v[k]
```

This matches what is implemented in firmware, running once per 1 ms Timer2 tick.

<img src="/digital_control_prj/Discrete.drawio.png" width="700">

```cpp
void Cntrl(int mode) {
    position[0] = enc_count;
    error[0] = target_pos_count - position[0];

    if(mode==0){
      A[0]=0;   A[1]=0.97;  A[2]=0;
      B[0]=0.9186; B[1]=1.631; B[2]=-1.631;      // P-DF, Tustin, 1ms
    }else if (mode==1){
      A[0]=1;   A[1]=1.85;  A[2]=-1.85;
      B[0]=0.87; B[1]=3.42; B[2]=-3.42;          // PI-DF, 1ms
    }

    W[0] = A[0]*W[1] + A[1]*error[0]    + A[2]*error[1];
    V[0] = B[0]*V[1] + B[1]*position[0] + B[2]*position[1];

    if(mode==2){
      U[0] = feed_trig(control_cycle);           // open-loop feedforward
    }else{
      U[0] = W[0] - V[0];
    }

    if(UMAX < U[0]) U[0] = UMAX;
    if(UMIN > U[0]) U[0] = UMIN;

    DEAD_SAT();

    position[1] = position[0];
    error[2] = error[1];  error[1] = error[0];
    W[1] = W[0];  V[1] = V[0];  U[1] = U[0];
}
```

The `mode` argument selects between P-DF (0), PI-DF (1), and a third mode (2) used for open loop feedforward testing, described next.

## Feedforward

[Feedforward control](https://en.wikipedia.org/wiki/Feed_forward_(control)) uses the reference signal directly to compute part of the control action ahead of time, rather than waiting for feedback to react to an error. It only works when the reference has a known analytical form, since the feedforward term is computed from that expression, sometimes including its derivatives.

For the smooth triangle reference, an analytical piecewise quadratic expression was already available, since it was the same function used to generate the test signal:

```cpp
float feed_trig(long int cc) {
    double t = (cc % 1600) * C_C_P;
    if (t < 0.4) {
        return (-229.234588026082*t*t + 67.0129112329579*t + 4.9239589508024) * COUNTS_PER_MM;
    } else if (t <= 1.6) {
        return (8.57564093064612*t*t - 16.1936676904268*t + 4.5536821622703) * COUNTS_PER_MM;
    }
}
```

Using the plant transfer function `M(s)`, the feedforward term can be derived by inverting the relationship between input and output and taking successive derivatives of the reference signal. The full derivation is a third order differential equation in the reference signal, since the plant model is third order once the zero order hold is included:

```
U(t) = (1/3374000) d3y/dt3 + (2018.75/3374000) d2y/dt2 + (36500/3374000) dy/dt
```

Mode 2 in the controller uses this directly, computing `feed_trig()` and driving the motor open loop with no feedback correction, both as a way to test the anti-deadzone compensation and PWM path in isolation and as the source of the triangle wave excitation used earlier for system identification.

The more complete result comes from combining feedforward with the PI-DF feedback controller rather than replacing it, using:

```
U = PI term - DF term + FF term
```

<img src="/digital_control_prj/Triple_FF.png" width="700">

The plot compares tracking of the triangle reference with PI-DF alone (blue) against PI-DF with a threefold feedforward term added (black and red). The reference and output axis is in encoder counts. A signal value of about 3500 counts corresponds to roughly 3500 / 14.173 = 247 mm of travel. The tracking error, measured as integral of absolute error (IAE), drops from 640.31 with PI-DF alone to 164.28 with feedforward added, a reduction of about 74 percent. The report notes that repeated application of the feedforward term (used three times here) partially cancels against the DF term of the controller up to a threshold, which is why this combination was usable without destabilizing the loop. It also notes a practical limitation: computing feedforward through the full plant model including its filtered derivative term requires higher order derivatives of the reference and becomes difficult to manage if the reference is only approximately known rather than given by an exact expression.

## Real hardware results

Before testing on hardware, the discretized PI-DF controller was checked in MATLAB against the continuous design it was derived from.

<img src="/digital_control_prj/PIDF_linear_result.png" width="700">

Overshoot 6.75 percent, peak time 57.2 ms. This is close to the 7 percent overshoot limit but well inside the 100 ms peak time limit.

The same controller was then run on the actual hardware.

<img src="/digital_control_prj/PIDF_final_result.png" width="700">

The plot axis is again in encoder counts. The reference step in this test is 220 counts, equal to 220 / 14.173 = 15.52 mm. The measured peak value is 223 counts, or 15.73 mm, giving an overshoot of 2.29 percent at a peak time of 48 ms. The steady state error is 1 encoder count, equal to 0.07 mm or about 70 μm.

The measured overshoot and peak time are both better than the linear model predicted. The plot shows the continuous time model, the Tustin discretized simulation, and the real system output tracking closely through the transient, with the real system settling slightly faster and with less overshoot than either prediction. The report attributes this to the identified plant model understating the real damping of the system, likely because the identification data (step, triangle and potentiometer tests) averages over some of the friction and mechanical damping present in the physical mechanism. Since the controller was designed to handle the model's predicted overshoot, the real system ends up with margin to spare. The steady state error of one count is close to the smallest position difference the encoder can represent, `1 / 14.17323 = 0.0706 mm`, so this is close to the resolution limit of the sensor rather than a shortcoming of the controller.

## Validation across references

With the PI-DF controller in place, three reference types were tested on hardware.

Random step reference:

<img src="/digital_control_prj/Resp1.png" width="700">

The output tracks the staircase reference with small overshoot at each transition and error spikes that settle quickly. The control signal stays within the PWM limits (plus or minus 511) throughout.

Smooth triangle wave, a harder test since the carriage is constantly reversing direction:

<img src="/digital_control_prj/smooth_trig.png" width="700">
<img src="/digital_control_prj/Resp2.png" width="700">

The tracking error is larger here, with a repeatable spike near each peak of the reference, but it stays bounded and periodic rather than growing over time. This indicates the loop remains stable through repeated direction reversals.

Live potentiometer reference, moved by hand:

<img src="/digital_control_prj/potent_.png" width="700">
<img src="/digital_control_prj/Resp3.png" width="700">

The carriage tracks the manually driven reference closely, including sudden direction changes.

## Conclusions

This project modeled, identified, designed a controller for, and validated a real electromechanical position control system, and the results are summarized here in the same terms the original specification was written in.

System modeling and identification. The plant was identified from real time experimental data as a second order system with an integrator, `M1(s) = 89.99 / (s(0.0533s + 1))`. The identified model predicted somewhat more overshoot and less damping than the real system exhibited. This is a normal limitation of system identification from noisy step, triangle and potentiometer data, and it was accounted for by designing the controller against the model's (slightly pessimistic) prediction rather than against the real system's better behavior, which is the correct way to handle model uncertainty in a control design.

Controller design. A PI-DF controller was selected over a simpler P-DF design because the deadzone compensation could not fully eliminate steady state error on its own, particularly for moving references. The control law is `U = PI term - DF term`. Designed against a stated specification of overshoot under 7 percent and peak time under 100 ms, the controller met this specification both in linear simulation (6.75 percent overshoot, 57.2 ms peak time) and, with margin to spare, on real hardware (2.29 percent overshoot, 48 ms peak time, steady state error of one encoder count).

Discretization method. The Tustin method consistently outperformed Backward Euler at matching the continuous design, particularly as sample time increased. Backward Euler is simpler to derive by hand but introduces additional damping error. Increasing the sample time from 1 ms to 10 ms degraded achievable performance regardless of discretization method and required the controller to be retuned, which is consistent with the general result that zero order hold delay scales with sample period.

Feedforward control. Adding a feedforward term derived from the analytical reference signal, layered on top of PI-DF as `U = PI term - DF term + FF term`, reduced tracking error (IAE) by about 74 percent on the triangle reference. This came with a practical limitation: feedforward requires either an exact analytical expression for the reference or a close approximation, and computing it through the full plant model requires higher order derivatives of the reference signal, which is sensitive to noise and becomes harder to manage as the derivative order increases.

Overall, the exercise demonstrates a complete digital control workflow: identify a real plant from data, design a controller against an explicit specification, choose a discretization method with an understanding of its trade-offs, and validate all of it against real hardware rather than simulation alone. The gap observed between the linear model's prediction and the real system's measured performance is itself a useful result, since it illustrates why control designs are usually built with margin against model uncertainty rather than tuned exactly to a model's nominal prediction.