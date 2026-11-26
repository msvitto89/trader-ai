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
/*
  TWO bodies, not one. The pointers are arrays so the fluid responds to both the
  30px bubble and the 12px one trailing it, which is what lets the oil between
  them be pulled toward the pair rather than toward a single point.
*/
uniform vec2 uBubblePos[2];
uniform float uBubbleR[2];
uniform vec2 uBubbleVel[2];
uniform float uPull;
uniform float uFalloff;
uniform float uAnchor;
uniform float uDamp;
${NOISE}
void main() {
  vec2 vel = texture2D(uVelocity, vUv).xy;

  /*
     ── each cursor circle is an air bubble rising through oil ──────────────

     A displacement, not a drag and certainly not an attractor. An incompressible
     body moving through an incompressible fluid cannot create or destroy volume,
     so it can only move the fluid out of its own way: oil is pushed forward at the
     nose, slides around the sides, and is drawn back in behind the tail. That
     closed loop is the classic dipole

         u(r) = (a^2 / r^2) * [ 2 (V.rhat) rhat - V ]

     which is the potential-flow solution for a cylinder of radius a travelling at
     V. It is divergent-free outside the body, and that matters: the projection
     step deletes any gradient it is given, so a field that is already free of
     divergence is the only kind that survives being injected.
  */
  for (int i = 0; i < 2; i++) {
    vec2 d = (vUv - uBubblePos[i]) * vec2(uAspect, 1.0);
    float dist = length(d);
    float rho = max(dist, uBubbleR[i]);
    vec2 rhat = d / rho;

    // Bubble velocity, in the same isotropic units as d.
    vec2 V = uBubbleVel[i] * vec2(uAspect, 1.0);

    // The dipole itself. 1/r^2 decay: nothing of this survives past a few radii.
    vec2 dipole = (uBubbleR[i] * uBubbleR[i]) / (rho * rho) *
                  (2.0 * dot(V, rhat) * rhat - V);

    /*
       A short envelope on top of the 1/r^2 tail. The sim grid is coarse relative
       to a bubble a few dozen pixels across, so a tail hundreds of cells long
       would be sampled as stripes rather than a smooth falloff; this keeps the
       displaced zone to a few bubble radii, which is how far real surface oil
       actually parts.
    */
    float w = exp(-dist * dist * uFalloff);

    /*
       Blend the fluid TOWARD the dipole's velocity instead of adding an impulse.
       A bubble cannot drag oil faster than it displaces it, and at high frame
       rates an impulse would integrate to a different speed than at low ones.
    */
    vec2 target = dipole * uPull;
    vel += (target - vel) * w * min(1.0, uDt * 14.0);
  }

  /*
     A little churn at the rims. Perfect potential flow reads as a clean lens; real
     oil breaks up at the contact line. Gated by the same envelope, so it dies with
     the gesture rather than leaving a permanent swirl in the letters.
  */
  vec2 sp = vUv * vec2(9.0 * uAspect, 9.0) + vec2(uTime * 0.05, -uTime * 0.04);
  vec2 dBig = (vUv - uBubblePos[0]) * vec2(uAspect, 1.0);
  float wBig = exp(-dot(dBig, dBig) * uFalloff);
  vel += curlNoise(sp) * wBig * uPull * 0.10 * uDt;

  /*
     Viscosity inside the glyphs, not a wall. It keeps the oil heavy, and it is
     what stops the dipole's forward push from tearing a letter apart at the nose.
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
  The two cursor circles, for the oil that the type throws toward them.
*/
uniform vec2 uBubblePos[2];
uniform float uBubbleR[2];
uniform float uBubblePull; // 0..1 — how strongly the type is drawn out, right now
uniform float uTime;

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

/* Cheap value noise, used only to break up the filaments. */
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x),
             mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
}

/*
  ── oil drawn out of the type toward the bubbles ──────────────────────────────

  This is the part that reads as oil on water rather than as a glow. Three things
  do the work:

   1. The strands are not radial rays. Each pixel measures how far it is from the
      LINE joining the type to the bubble, so the oil gathers into a few curved
      threads instead of a uniform halo.

   2. Every thread is width-modulated along its length by noise, so it swells and
      necks the way a real filament does when it is pulled. A constant-width line
      looks like a laser beam; a necked one looks like oil.

   3. Coverage is the MASK sampled along the strand, not a synthetic shape. The
      white therefore still has the letterform's own texture rather than being an
      additive aura floating over the page.

  Everything is WHITE and premultiplied like the type itself, so the whole hero
  stays a single-colour image: the type, the strands and the bubbles are all the
  same ink.
*/
float strands(vec2 uv, vec2 centre, float radius) {
  vec2 iso = vec2(uAspect, 1.0);

  // Offset from the bubble, in isotropic units (one unit = one canvas height).
  vec2 p = (uv - centre) * iso;
  float dist = length(p);

  /*
     Band. Inside the bubble's own body the oil has been pushed away, so there is
     nothing to draw; outside the outer radius the pull has died out. Rejecting
     early keeps this off the critical path for most of the canvas.
  */
  float outer = radius + 0.340;
  if (dist > outer || dist < radius + 0.004) return 0.0;

  /*
     ── the strands are the TYPE, spilling toward the bubble ─────────────────

     Every pixel in the band asks one question: is there ink UPSTREAM of me, in
     the direction away from the bubble? If there is, this pixel is on a thread
     that has been drawn out of the type toward the bubble.

     That inversion is what makes it read as oil rather than as a glow. The
     material is real letterform — so a thread only exists where a letter can
     supply it, it tapers because the walk runs out of samples, and it points at
     the bubble because the walk is along the line to it. An earlier version
     built threads outward from the bubble instead, which fired rays into empty
     space and looked like a starburst, because nothing in it knew where the ink
     was.
  */
  vec2 dir = -p / max(dist, 1e-5);   // unit vector, pointing AT the bubble
  float maxBack = 0.300;             // how far upstream a thread can reach

  float acc = 0.0;
  for (int i = 1; i <= 8; i++) {
    float t = float(i) / 8.0;
    /*
       Walk upstream. The weight falls with t, so a pixel far from any ink is
       faint and a pixel right beside a letter is nearly solid: the thread fades
       out along its length instead of ending in a hard edge.

       A soft union rather than max(): max() makes every thread as opaque as the
       nearest glyph sample, which is what produced the shard-like edges. Taking a
       saturating sum keeps the thread's own density gradient, so it reads as
       thinned oil rather than as a cut-out.
    */
    vec2 q = uv - (dir * maxBack * t) / iso;
    acc += glyph(q) * (1.0 - t * 0.62) * 0.30;
  }
  acc = 1.0 - exp(-acc * 2.2);
  if (acc <= 0.002) return 0.0;

  /*
     Threading. acc on its own is a soft smear; splitting it into strands is what
     makes it oil. The noise is indexed by the ANGLE around the bubble, so the
     cuts run lengthwise along the pull rather than across it — which is how a
     filament breaks up, not how a shadow does.
  */
  float ang = atan(p.y, p.x);
  float cell = floor(ang * 3.6);
  float seed = h21(vec2(cell + 23.0, 9.0));
  float frac = fract(ang * 3.6);
  float across = (frac - 0.5) * 2.0;

  // A soft bump across each thread, so edges stay anti-aliased.
  float profile = 1.0 - smoothstep(0.10, 1.0, abs(across));
  profile = pow(profile, 0.75);

  // Swell and neck along the length.
  float neck = 0.55 + 0.45 * vn(vec2(cell * 4.0, dist * 18.0 - uTime * 0.28));

  // Not every wedge carries a thread, and the gaps are what make it read as oil.
  /*
     Density, varied along the thread as well as between threads. Without the
     along-length term the threads all survive to the band edge and the fan closes
     into a solid wedge; with it they break up the way thinned oil actually does.
  */
  float breakup = 0.45 + 0.55 * vn(vec2(cell * 3.0 + 9.0, dist * 11.0 - uTime * 0.22));
  float exists = smoothstep(0.12, 0.42, seed) * breakup;

  /*
     Radial falloff. Strongest near the type end of the band and thinning as it
     approaches the bubble, which is the direction the surface tension gradient
     actually pulls: a thread is fat where it leaves the mass and thin where it
     is about to break.
  */
  float radial = smoothstep(radius + 0.004, radius + 0.055, dist) *
                 (1.0 - smoothstep(outer - 0.115, outer, dist));

  return acc * profile * neck * exists * radial;
}

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

  /*
     The oil pulled out toward each bubble. Both circles get the same treatment;
     the larger one is drawn a little stronger because it is the body the fluid
     actually answers to.
  */
  float oil = 0.0;
  oil += strands(vUv, uBubblePos[0], uBubbleR[0]) * 1.05;
  oil += strands(vUv, uBubblePos[1], uBubbleR[1]) * 0.62;
  oil = clamp(oil, 0.0, 1.0) * uBubblePull * 1.1;

  /*
     The type and the oil are the same ink. Added in premultiplied space so a
     strand crossing a stem cannot punch a hole in it, and clamped so overlapping
     strands cannot drive alpha past 1 and fringe.
  */
  /*
     Remap so the thread cores are solid white and only their shoulders are
     translucent. The brief asks for white, not tint: a value that stays around 0.4
     reads as grey haze on black, which is exactly the colourless look to avoid.
  */
  oil = smoothstep(0.05, 0.55, oil);
  float total = clamp(alpha + oil * (1.0 - alpha), 0.0, 1.0);

  const vec3 WHITE = vec3(1.0);
  gl_FragColor = vec4(WHITE * total, total);
}
`;
