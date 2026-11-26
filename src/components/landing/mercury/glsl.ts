/**
 * Mercury — GLSL sources.
 *
 * A GPU stable-fluids solver (advection → vorticity confinement → viscosity →
 * divergence → pressure → gradient subtract) with the headline type texture as
 * its source. The dye field is what stretches off the letters toward the
 * pointer; it is repeatedly relaxed back toward the glyph mask, so the liquid
 * is always one connected body that returns to the text instead of drifting
 * away or breaking into particles.
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
 * The force field. Three contributions:
 *   1. attraction to the pointer, strongest at the pointer and falling off
 *      smoothly with distance — the positive charge pulling the mercury;
 *   2. the pointer's own velocity, so a fast pass drags a long trail and a
 *      change of direction bends the strand around the new heading;
 *   3. a slow noise churn, so the pool is never perfectly still.
 * The glyphs themselves anchor the body: velocity is bled away where the mask
 * is present, which is what stops the source from being dragged off the type.
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
uniform float uPull;
uniform float uFalloff;
uniform float uAnchor;
uniform float uDamp;
${NOISE}
void main() {
  vec2 vel = texture2D(uVelocity, vUv).xy;

  vec2 d = (vUv - uPointer) * vec2(uAspect, 1.0);
  float dist = length(d);
  float fall = exp(-dist * dist * uFalloff);

  // 1 — pull toward the pointer
  vec2 toward = normalize((uPointer - vUv) * vec2(uAspect, 1.0) + 1e-5);
  vel += toward * fall * uPull * uDt;

  // 2 — the pointer's motion drags fluid with it (trails, bends)
  vel += uPointerVel * fall * 0.55 * uDt;
  // ...and swirls a little around the direction of travel, which is what makes
  // a fast pass curl instead of translating the liquid rigidly.
  vel += vec2(-uPointerVel.y, uPointerVel.x) * fall * 0.22 * uDt;

  /*
     3 — shear. A smooth radial pull only translates the dye. What reads as
     mercury is the liquid being dragged at different speeds at neighbouring
     points, so this adds curl noise that is strongest where the pull is
     strongest: the strands stay anchored at the type and stream toward the
     cursor, rather than sliding there as a lump.
  */
  vec2 sp = vUv * vec2(6.5 * uAspect, 6.5) + vec2(uTime * 0.05, -uTime * 0.04);
  vec2 shear = curlNoise(sp) + 0.5 * curlNoise(sp * 2.1 - vec2(uTime * 0.03));
  vel += shear * (0.18 + fall * uPull * 1.2) * uDt;

  // 4 — ambient churn, always present so the pool is never dead
  vec2 churn = noiseGrad(vUv * vec2(3.0 * uAspect, 3.0) + vec2(uTime * 0.05, -uTime * 0.04));
  vel += churn * 0.12 * uDt;

  // Anchor: the pool is pinned to the type, so velocity dies where the ink is.
  float m = texture2D(uMask, vUv).r;
  vel *= 1.0 - m * uAnchor * uDt;

  // Global damping keeps the whole body viscous and bounded.
  vel *= 1.0 - uDamp * uDt;

  gl_FragColor = vec4(vel, 0.0, 1.0);
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
 * Dye. The glyph mask feeds it, it is advected by the flow, and it is pulled
 * back toward the mask each frame — the spring relaxation that returns the
 * stretched mercury to the type when the pointer leaves.
 */
export const DYE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uDye;
uniform sampler2D uMask;
uniform float uDt;
uniform float uInflow;
uniform float uReturn;
uniform float uDissip;
void main() {
  float d = texture2D(uDye, vUv).r;
  float m = texture2D(uMask, vUv).r;
  d += m * uInflow * uDt;
  d = mix(d, m, clamp(uReturn * uDt, 0.0, 1.0));
  d *= 1.0 - uDissip * uDt;
  gl_FragColor = vec4(clamp(d, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

/**
 * Display. The dye is a height field: its gradient is the surface normal, and
 * the normal is what makes the liquid read as metal rather than as fog. The
 * reflection samples a tiny studio — dark ground, one bright horizon band, a
 * cool sky — all built from the brand palette, so the mercury is never a grey
 * smear and never picks up a hue that is not TRADIA's.
 */
export const DISPLAY = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uDye;
uniform sampler2D uMask;
uniform vec2 uTexel;      // dye texel
uniform vec2 uMaskTexel;
uniform float uTime;
uniform float uStrength;
uniform float uRelief;

float dye(vec2 uv) { return texture2D(uDye, uv).r; }

// Small two-radius blur: just enough to hide the simulation grid without
// turning the surface into fog.
float smoothDye(vec2 uv) {
  vec2 r1 = uTexel * 1.3;
  vec2 r2 = uTexel * 2.6;
  float s = dye(uv) * 2.0;
  s += dye(uv + vec2(r1.x, 0.0)) + dye(uv - vec2(r1.x, 0.0));
  s += dye(uv + vec2(0.0, r1.y)) + dye(uv - vec2(0.0, r1.y));
  s += dye(uv + vec2(r2.x, 0.0)) + dye(uv - vec2(r2.x, 0.0));
  s += dye(uv + vec2(0.0, r2.y)) + dye(uv - vec2(0.0, r2.y));
  s += dye(uv + vec2(r1.x, r1.y)) + dye(uv - vec2(r1.x, r1.y));
  s += dye(uv + vec2(r1.x, -r1.y)) + dye(uv - vec2(r1.x, -r1.y));
  return s / 14.0;
}

float maskAt(vec2 uv) { return texture2D(uMask, uv).r; }

// Soft dilation of the type: the film of liquid clinging to the letterforms.
float maskHalo(vec2 uv) {
  vec2 r1 = uMaskTexel * 5.0;
  vec2 r2 = uMaskTexel * 12.0;
  float s = maskAt(uv) * 2.0;
  s += maskAt(uv + vec2(r1.x, 0.0)) + maskAt(uv - vec2(r1.x, 0.0));
  s += maskAt(uv + vec2(0.0, r1.y)) + maskAt(uv - vec2(0.0, r1.y));
  s += maskAt(uv + vec2(r1.x, r1.y)) + maskAt(uv - vec2(r1.x, r1.y));
  s += maskAt(uv + vec2(r1.x, -r1.y)) + maskAt(uv - vec2(r1.x, -r1.y));
  s += maskAt(uv + vec2(r2.x, 0.0)) + maskAt(uv - vec2(r2.x, 0.0));
  s += maskAt(uv + vec2(0.0, r2.y)) + maskAt(uv - vec2(0.0, r2.y));
  return s / 14.0;
}

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
             mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}

vec3 palette(float t) {
  vec3 blacktop = vec3(0.039, 0.039, 0.039);
  vec3 deepIce  = vec3(0.239, 0.561, 0.788);
  vec3 ice      = vec3(0.553, 0.863, 0.969);
  vec3 fusion   = vec3(0.843, 0.937, 1.000);
  t = clamp(t, 0.0, 1.0);
  if (t < 0.34) return mix(blacktop, deepIce, smoothstep(0.0, 0.34, t));
  if (t < 0.68) return mix(deepIce, ice, smoothstep(0.34, 0.68, t));
  return mix(ice, fusion, smoothstep(0.68, 1.0, t));
}

/*
  A studio, not a gradient. Mercury is legible because of what it reflects: a
  black floor, a hard bright horizon, a cold sky. The hard horizon line is the
  single most important cue that this is a liquid metal surface.
*/
vec3 studio(vec3 R) {
  float y = R.y;
  vec3 floorCol = vec3(0.012, 0.018, 0.028);
  vec3 sky = mix(vec3(0.050, 0.085, 0.125), palette(0.66), smoothstep(-0.05, 0.95, y));
  vec3 c = mix(floorCol, sky, smoothstep(-0.02, 0.10, y));
  // hard horizon band, plus a softer secondary reflection higher up
  float horizon = smoothstep(0.115, 0.006, abs(y - 0.030));
  c = mix(c, palette(0.97), horizon * 0.95);
  float high = smoothstep(0.30, 0.02, abs(y - 0.50));
  c = mix(c, palette(0.80), high * 0.45);
  return c;
}

void main() {
  float h = smoothDye(vUv);

  // Surface normal from the height field.
  vec2 e = uTexel * 1.8;
  float hx = smoothDye(vUv + vec2(e.x, 0.0)) - smoothDye(vUv - vec2(e.x, 0.0));
  float hy = smoothDye(vUv + vec2(0.0, e.y)) - smoothDye(vUv - vec2(0.0, e.y));

  // Subtle internal surface deformation, so the body is never perfectly calm.
  vec2 wob = vec2(
    vnoise(vUv * vec2(11.0, 11.0) + vec2(uTime * 0.05, 0.0)) - 0.5,
    vnoise(vUv * vec2(11.0, 11.0) + vec2(31.0, -uTime * 0.04)) - 0.5);

  vec3 N = normalize(vec3(-hx * uRelief + wob.x * 0.10,
                          -hy * uRelief + wob.y * 0.10,
                          1.0));

  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 R = reflect(-V, N);

  vec3 col = studio(R) * 1.55;
  // A little emissive body so the mass reads against the black page; the
  // highlights do the rest.
  col += palette(0.34) * 0.30 * smoothstep(0.10, 0.75, h);

  // Two tight speculars: the hard white glints that make it wet.
  vec3 L1 = normalize(vec3(-0.40, 0.70, 0.58));
  vec3 L2 = normalize(vec3(0.55, -0.26, 0.50));
  float d1 = max(dot(N, normalize(L1 + V)), 0.0);
  float d2 = max(dot(N, normalize(L2 + V)), 0.0);
  float spec = pow(d1, 260.0) * 3.2 + pow(d1, 26.0) * 0.20
             + pow(d2, 170.0) * 1.6 + pow(d2, 20.0) * 0.10;
  col += vec3(0.85, 0.93, 1.00) * spec;

  // Fresnel: a cold ice rim wherever the surface turns away from the viewer.
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.5);
  col += palette(0.70) * fres * 0.85;

  /*
     The headline stays readable. Under the pool the liquid is lifted into the
     horizon band — so the letters read as polished chrome catching the sky —
     rather than being painted over with flat white.
  */
  float m = maskAt(vUv);
  vec3 chromeType = mix(palette(0.86), vec3(0.97, 0.99, 1.0), 0.55) + studio(R) * 0.18;
  col = mix(col, chromeType, m * 0.55);

  // Liquid film clinging to the letter edges.
  float halo = maskHalo(vUv);
  float rim = clamp(halo - m, 0.0, 1.0);
  col += vec3(0.74, 0.88, 1.00) * rim * 0.85;

  // A defined body, not fog: the edge of the pool should be a surface.
  float body = smoothstep(0.07, 0.34, h);
  float alpha = max(body, smoothstep(0.0, 0.45, rim) * 0.85) * uStrength;
  // Over the ink itself the film thins out, so the headline stays readable
  // while the liquid still wraps and spills off it.
  alpha *= mix(1.0, 0.55, m);

  // The pool must not end on the canvas edge, or the crop reads as a rectangle.
  alpha *= smoothstep(0.0, 0.09, vUv.x) * smoothstep(1.0, 0.91, vUv.x)
         * smoothstep(0.0, 0.13, vUv.y) * smoothstep(1.0, 0.87, vUv.y);

  /*
     Premultiplied output. The context is created with premultipliedAlpha, and
     writing a bright colour at a near-zero alpha does not darken it — the
     browser adds it, so the whole canvas washed out to pale blue where the
     liquid was not even present. Colour has to be scaled by alpha here.
  */
  gl_FragColor = vec4(col * alpha, alpha);
}
`;
