/**
 * Mercury — GLSL sources.
 *
 * A GPU stable-fluids solver (advection → vorticity confinement → viscosity →
 * divergence → pressure → gradient subtract) whose only job is a velocity field.
 * There is no dye and no liquid layer: DISPLAY uses that field to displace the
 * headline's own glyph mask, so the type itself is the material that stretches
 * and gathers back. See DISPLAY for the whole model.
 *
 * Written against GLSL ES 1.00 so the same sources run on the WebGL2 context
 * (which accepts #version 100) and on a WebGL1 fallback.
 */

export const VERT = `
precision highp float;
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

/** Bilinear tap on a NEAREST-filtered texture, so advection is exact. */
const BILERP = `
vec4 bilerp(sampler2D s, vec2 uv) {
  vec2 st = uv / uTexel - 0.5;
  vec2 i = floor(st);
  vec2 f = fract(st);
  vec4 a = texture2D(s, (i + vec2(0.5, 0.5)) * uTexel);
  vec4 b = texture2D(s, (i + vec2(1.5, 0.5)) * uTexel);
  vec4 c = texture2D(s, (i + vec2(0.5, 1.5)) * uTexel);
  vec4 d = texture2D(s, (i + vec2(1.5, 1.5)) * uTexel);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

/** Semi-Lagrangian advection of velocity or dye. */
export const ADVECT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDissipation;
${BILERP}
void main() {
  vec2 vel = bilerp(uVelocity, vUv).xy;
  /* Velocity is in normalised crop units per second, so it scales uv
     directly. Multiplying by uTexel here made the flow ~250x too slow. */
  vec4 result = bilerp(uSource, vUv - uDt * vel);
  gl_FragColor = result / (1.0 + uDissipation * uDt);
}
`;

/** Curl of the velocity field, sampled by the confinement pass. */
export const CURL = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float L = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float R = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}
`;

/**
 * Vorticity confinement. Without it the solver diffuses into a smooth smudge;
 * with it, the curls keep rolling and the mercury reads as thick fluid rather
 * than as a blurred gradient.
 */
export const VORTICITY = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uDt;
uniform float uStrength;
void main() {
  float L = abs(texture2D(uCurl, vUv - vec2(uTexel.x, 0.0)).x);
  float R = abs(texture2D(uCurl, vUv + vec2(uTexel.x, 0.0)).x);
  float B = abs(texture2D(uCurl, vUv - vec2(0.0, uTexel.y)).x);
  float T = abs(texture2D(uCurl, vUv + vec2(0.0, uTexel.y)).x);
  vec2 force = 0.5 * vec2(T - B, R - L);
  force /= length(force) + 1e-4;
  force *= uStrength * texture2D(uCurl, vUv).x;
  force.y *= -1.0;
  vec2 vel = texture2D(uVelocity, vUv).xy + force * uDt;
  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

/**
 * Viscous diffusion, one Jacobi step per pass. Mercury is thick syrup: this is
 * the term that makes the flow smooth and heavy instead of twitchy.
 */
export const VISCOSITY = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
uniform float uNu;
void main() {
  vec2 x = texture2D(uVelocity, vUv).xy;
  vec2 b = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).xy
         + texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).xy
         + texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).xy
         + texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).xy;
  gl_FragColor = vec4((x + uNu * b) / (1.0 + 4.0 * uNu), 0.0, 1.0);
}
`;

/** Gradient noise, used for the slow ambient churn of the pool. */
const NOISE = `
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec2 noiseGrad(vec2 p) {
  float e = 0.35;
  float c = vnoise(p);
  return vec2(vnoise(p + vec2(e, 0.0)) - c, vnoise(p + vec2(0.0, e)) - c) / e;
}

/*
  Curl of a scalar potential: divergence-free by construction, so it stirs the
  liquid into fingers without the pressure solve immediately flattening it. This
  is what turns the attraction from a translated blob into tendrils.
*/
vec2 curlNoise(vec2 p) {
  float e = 0.25;
  float n1 = vnoise(p + vec2(0.0, e));
  float n2 = vnoise(p - vec2(0.0, e));
  float n3 = vnoise(p + vec2(e, 0.0));
  float n4 = vnoise(p - vec2(e, 0.0));
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
}
`;

/**
 * The force field — paint being pushed by something moving through it.
 *
 * The important decision here is what is NOT in this field. There is no radial
 * attraction toward the cursor. A pull-into-a-point is exactly the "magnet"
 * reading the design rejects: the letters get sucked into a funnel around the
 * pointer, thin out where they bunch, and overlap each other. Oil does not do
 * that — it is displaced *along* the direction of the thing moving through it.
 *
 * So the field is directional:
 *   1. a wide, soft drag along the pointer's own velocity (short gesture = a
 *      slight lean; fast gesture = a long drawn-out stretch);
 *   2. a small curl around that direction, so the displacement bends instead of
 *      translating rigidly;
 *   3. a little swirl in the glyphs themselves, which is what makes the material
 *      look thick rather than like a sliding sheet.
 * Everything is weighted by distance to the cursor and by the drive gate, so
 * nothing moves at all when the cursor is still.
 */
export const FORCE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uMask;
uniform vec2 uTexel;
uniform float uDt;
uniform float uTime;
uniform float uAspect;
uniform vec2 uPointer;
uniform vec2 uPointerVel;
uniform float uBubbleR;
uniform float uPull;
uniform float uFalloff;
uniform float uAnchor;
uniform float uDamp;
${NOISE}
void main() {
  vec2 vel = texture2D(uVelocity, vUv).xy;

  /*
     ── the cursor is an air bubble rising through oil ──────────────────────

     Not a hand dragging a puddle, and certainly not an attractor — it is a
     DISPLACEMENT. An incompressible body moving through an incompressible fluid
     cannot create or destroy volume, so it can only move the fluid out of its own
     way: oil is pushed forward at the nose, slides around the sides, and is drawn
     back in behind the tail. That closed loop is exactly the classic dipole

         u(r) = (a² / r²) · [ 2 (V·r̂) r̂ − V ]

     which is the potential-flow solution for a cylinder of radius a travelling at
     V. It is divergence-free everywhere outside the body, which matters: the
     projection step deletes any gradient it is given, so a field that is already
     free of divergence is the only kind that survives being injected.

     Because the bubble is small compared to the canvas, the whole gesture is
     local. A cursor sweeping across the headline leaves no wake behind it — oil
     closes over the path — which is what separates this from the drag model it
     replaces.
  */
  vec2 d = (vUv - uPointer) * vec2(uAspect, 1.0);
  float dist = length(d);
  float rho = max(dist, uBubbleR);
  vec2 rhat = d / rho;

  // Bubble velocity, in the same isotropic units as d.
  vec2 V = uPointerVel * vec2(uAspect, 1.0);

  // The dipole itself. 1/r² decay: nothing of this survives past a few radii.
  vec2 dipole = (uBubbleR * uBubbleR) / (rho * rho) *
                (2.0 * dot(V, rhat) * rhat - V);

  /*
     A short envelope on top of the 1/r² tail. The sim grid is coarse relative to a
     6px bubble, so a tail hundreds of cells long would be sampled as stripes
     rather than a smooth falloff; this keeps the displaced zone to a few bubble
     radii, which is also how far real surface oil actually parts.
  */
  float w = exp(-dist * dist * uFalloff);

  /*
     Blend the fluid TOWARD the dipole's velocity instead of adding an impulse. A
     bubble cannot drag oil faster than it displaces it, and at high frame rates an
     impulse would integrate to a different speed than at low ones. Mixing is
     frame-rate independent once uDt is clamped, and it lets the field be exactly
     zero the instant the bubble stops.
  */
  vec2 target = dipole * uPull;
  vel += (target - vel) * w * min(1.0, uDt * 14.0);

  /*
     A little churn at the rim. Perfect potential flow reads as a clean lens; real
     oil breaks up at the contact line. Gated by the same envelope, so it dies with
     the gesture rather than leaving a permanent swirl in the letters.
  */
  vec2 sp = vUv * vec2(9.0 * uAspect, 9.0) + vec2(uTime * 0.05, -uTime * 0.04);
  vel += curlNoise(sp) * w * uPull * 0.10 * uDt;

  /*
     Viscosity inside the glyphs, not a wall. It keeps the oil heavy, and it is what
     stops the dipole's forward push from tearing a letter apart at the nose.
  */
  float m = texture2D(uMask, vUv).r;
  vel *= 1.0 - m * uAnchor * uDt;

  // Global damping: the field must decay to exactly zero, or the letters never rest.
  vel *= 1.0 - uDamp * uDt;

  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

/**
 * Wide smoothing of the velocity, used only as the DISPLACEMENT field.
 *
 * The solver's velocity is deliberately full of small curls — that is what makes
 * it feel like a fluid. Used raw as a warp it is too high-frequency: the text
 * edge gets eaten into grain instead of bending. This pass averages the field
 * over a wide stencil so the displacement varies smoothly across the whole
 * letterform, which is the difference between "oil is being drawn out here" and
 * "this pixel has noise on it".
 */
export const SMOOTH = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uRadius;
void main() {
  vec2 r = uTexel * uRadius;
  vec2 sum = vec2(0.0);
  float wsum = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      float w = exp(-float(i * i + j * j) * 0.35);
      sum += texture2D(uSource, vUv + vec2(float(i), float(j)) * r).xy * w;
      wsum += w;
    }
  }
  gl_FragColor = vec4(sum / wsum, 0.0, 1.0);
}
`;

export const DIVERGENCE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float L = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}
`;

export const PRESSURE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main() {
  float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float div = texture2D(uDivergence, vUv).x;
  gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}
`;

export const GRADIENT_SUBTRACT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 vel = texture2D(uVelocity, vUv).xy - 0.5 * vec2(R - L, T - B);
  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;


/**
 * Display. The dye is a height field: its gradient is the surface normal, and
 * the normal is what makes the liquid read as metal rather than as fog. The
 * reflection samples a tiny studio — dark ground, one bright horizon band, a
 * cool sky — all built from the brand palette, so the mercury is never a grey
 * smear and never picks up a hue that is not TRADIA's.
 */
/**
 * Display — the text IS the oil.
 *
 * No separate liquid layer, nothing drawn around the type, no colour ever. The
 * glyph mask is the material: its silhouette is warped by the fluid velocity, so
 * the letters stretch, compress and bend the way thick oil would while staying
 * in place as one connected mass. Every pixel leaving this pass is exactly
 * (1,1,1); only alpha — the silhouette — moves.
 *
 *   text mask → fluid velocity → displaced glyph surface → white text
 *
 * The offset is a single low-frequency vector taken from the solver, so the warp
 * varies smoothly across the whole word: a stem leans, a bowl swells. It is
 * capped hard, and a dead zone at the bottom of its range returns the type to
 * bit-for-bit pristine once the flow has decayed — so the settle ends truly
 * clean rather than hovering at a faint permanent strain.
 */
export const DISPLAY = `
precision highp float;
varying vec2 vUv;

uniform sampler2D uMask;
uniform sampler2D uVelocity;
uniform vec2 uVelTexel;
uniform float uAspect;    // canvas width / height, to keep the warp isotropic
uniform float uStrength;  // presence of the canvas (fade-in only)
uniform float uOil;       // displacement per unit of flow speed
uniform float uReach;     // hard cap on that displacement, in canvas heights

/*
  Nine-tap mean of the warp field. The field is smoothed on its own grid already,
  but one tap per screen pixel still picks up that grid; this closes the gap so
  the warp varies continuously across a letterform.
*/
vec2 flow(vec2 uv) {
  vec2 t = uVelTexel * 2.0;
  vec2 v = texture2D(uVelocity, uv).xy * 4.0;
  v += texture2D(uVelocity, uv + vec2(t.x, 0.0)).xy * 2.0;
  v += texture2D(uVelocity, uv - vec2(t.x, 0.0)).xy * 2.0;
  v += texture2D(uVelocity, uv + vec2(0.0, t.y)).xy * 2.0;
  v += texture2D(uVelocity, uv - vec2(0.0, t.y)).xy * 2.0;
  v += texture2D(uVelocity, uv + t).xy;
  v += texture2D(uVelocity, uv - t).xy;
  v += texture2D(uVelocity, uv + vec2(t.x, -t.y)).xy;
  v += texture2D(uVelocity, uv + vec2(-t.x, t.y)).xy;
  return v / 16.0;
}

/*
  Glyph coverage. One bilinear tap: the mask is rasterised at twice the canvas
  resolution, so its own filter footprint is already half a screen pixel.
*/
float glyph(vec2 uv) { return texture2D(uMask, uv).r; }

void main() {
  /*
     Work in "isotropic uv": x scaled by the aspect, so one unit is the same
     distance either way. Plain uv would shear the letters sideways, because the
     canvas is six times wider than it is tall.
  */
  vec2 iso = vec2(uAspect, 1.0);

  vec2 raw = flow(vUv) * iso * uOil;
  float amount = min(length(raw), uReach);

  /*
     Dead zone. Below the threshold nothing moves at all — that is what makes the
     end of the settle genuinely clean instead of a permanent faint strain. The
     floor is set just above one screen pixel of travel: any residual slower than
     that is invisible in motion and would only show as a frozen wobble.
  */
  amount *= smoothstep(0.0030, 0.0095, amount);
  vec2 d = length(raw) > 1e-6 ? normalize(raw) * amount : vec2(0.0);

  /*
     One offset. Walking several steps back along the flow sounds more physical,
     but each step re-samples a field the previous step already moved, and the
     per-pixel variation that introduces is visible as grain along the edge. The
     field is already smooth and already curved, so one offset carries all of it.
  */
  vec2 p = vUv - d / iso;

  float a = glyph(p);

  /*
     Drawn-out oil is very slightly thinner. One cue, no colour, and small enough
     that it never eats into a stem.
  */
  a *= 1.0 - 0.10 * clamp(amount / max(uReach, 1e-5), 0.0, 1.0);

  float alpha = clamp(a, 0.0, 1.0) * uStrength;

  const vec3 WHITE = vec3(1.0);
  gl_FragColor = vec4(WHITE * alpha, alpha);
}
`;
