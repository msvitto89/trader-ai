"use client";

import { useEffect, useRef } from "react";

/**
 * FluidShader — real-time liquid distortion behind the hero.
 *
 * A fragment shader run over the whole hero, built on domain warping rather
 * than on gradients: a coordinate is pushed through a procedurally generated
 * noise field, that distorted coordinate is sampled against a second noise
 * field, and the result is used three ways at once —
 *
 *   distance  drives which parts of the surface advance and recede
 *   contours  dense topographic bands, the flowing ridgelines of the surface
 *   warp      a slow secondary bend, so the bands themselves snake
 *
 * Nothing here is a blob. The whole field is continuous and re-derived every
 * frame from time alone, so shapes stretch, twist, merge and separate without
 * ever being animated individually.
 *
 * Colour is deliberately not part of the design: the shader outputs a bright
 * palette colour from a single uniform (FUSION) and the composite decides how
 * much of it survives, so the artwork can never introduce a hue the brand does
 * not own. The hero's black sits over it, which is what keeps the result
 * monochrome-ish and on-brand rather than iridescent.
 *
 * Cost control: the shader renders at a capped device-pixel-ratio into its own
 * canvas, pauses when the section scrolls away or the tab is hidden, and does
 * freezes into a still frame under prefers-reduced-motion rather than vanishing.
 */

const VERT = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uPointer;   // 0..1, smoothed
uniform vec2  uMPos;      // melt centre, 0..1
uniform float uMelt;      // 0..1, decays after a click
uniform vec3  uInk;       // fusion: the icy white-blue
uniform vec3  uIce;       // icy sky blue
uniform vec3  uIceDeep;   // deeper ice, for the troughs
uniform float uContour;   // band density
uniform float uIntensity; // overall presence

/* ── noise ──────────────────────────────────────────────────────────── */

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

// Gradient noise. Cheaper than simplex and plenty smooth once it is warped
// three times deep, which is where the character actually comes from.
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}

// Fractal sum. Each octave is rotated against the last so the result has no
// visible grid — a plain sum reads as tiles at high octave counts.
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    v += a * gnoise(p);
    p = rot * p * 2.02;
    a *= 0.5;
  }
  return v;
}

/* ── domain warping ─────────────────────────────────────────────────── */

// Three rounds of "sample noise, use it to move the coordinate, sample again".
// This is the whole trick: the surface is not drawn, it is repeatedly folded.
float warpedField(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.12)),
                fbm(p + vec2(4.7, 2.3) - t * 0.09));

  vec2 r = vec2(fbm(p + 3.4 * q + vec2(1.7, 9.2) + t * 0.16),
                fbm(p + 3.4 * q + vec2(8.3, 2.8) - t * 0.11));

  // Third fold: the one that makes the ridges curl into each other instead of
  // flowing in parallel bands.
  float s = fbm(p + 4.0 * r + vec2(0.0, t * 0.05));
  return s;
}

/* ── contour lines ──────────────────────────────────────────────────── */

// Distance to the nearest band edge, derived from the field itself. Taking the
// fractional part of the field and folding it gives evenly spaced ridge lines
// that follow the surface exactly — the topographic look, generated rather
// than drawn.
float contour(float v, float density, float width) {
  float x = v * density;
  float f = abs(fract(x) - 0.5);
  return smoothstep(width, 0.0, f);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime;

  /*
     Bend. The surface is pushed around the pointer, not shifted bodily: the
     displacement falls off with distance from the cursor and is stronger
     across the bending axis than along it, so the field visibly leans toward
     the pointer the way a sheet held at one corner does. A global shift would
     just scroll the artwork; this is what makes it feel touched.
  */
  vec2 pd = (uPointer - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float pdist = length(p - pd * 1.6);
  float bendF = exp(-pdist * pdist * 1.5);
  vec2 bendDir = normalize(pd + 1e-5);
  p -= bendDir * bendF * 0.85;
  // ...and squeeze across the bend axis, so contours bunch on the near side.
  p += vec2(-bendDir.y, bendDir.x) * bendF * (sin(pdist * 9.0 - t * 2.0)) * 0.16;

  /*
     Melt. A click drops the surface's own scale toward zero near the point and
     lets it run: the field is pulled toward the click centre and the contours
     stretch outward, which reads as the material sagging and dripping rather
     than as a ripple travelling across it.
  */
  if (uMelt > 0.001) {
    vec2 mp = (uMPos - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    vec2 md = p - mp * 1.6;
    float mdist = length(md);
    float meltF = exp(-mdist * mdist * 2.2) * uMelt;
    // Drag toward the centre, and stretch the axis radially outward.
    p -= normalize(md + 1e-5) * meltF * 0.55;
    p *= 1.0 + meltF * 0.35;
  }

  // Aspect-correct scale: the bands must not stretch on wide screens.
  p *= 1.5;

  float field = warpedField(p, t);

  // Advance/recede: the surface rises and falls, and because it is used as the
  // input to the contours it also pulls them apart and bunches them.
  float relief = field + 0.35 * fbm(p * 2.1 + t * 0.07);

  // Scanlines. Thin, horizontal, and modulated by the field so they bend with
  // the surface instead of sitting on top of it like a monitor overlay.
  float scan = sin((gl_FragCoord.y + relief * 26.0) * 1.35);
  scan = smoothstep(0.55, 1.0, scan) * 0.5;

  // Two contour families at different densities, the finer one masked so it
  // only appears in the troughs — that layering is what gives the depth.
  float c1 = contour(relief, uContour, 0.16);
  float c2 = contour(relief * 1.9 + 0.4, uContour * 2.4, 0.11);
  float c3 = contour(warpedField(p * 2.7 - t * 0.06, t * 1.4), uContour * 3.6, 0.07);
  float trough = smoothstep(0.15, -0.35, relief);
  float crest  = smoothstep(0.0, 0.55, relief);
  // Three families: the primary ridges everywhere, a finer set in the troughs,
  // and a faint third only on the crests. Layering densities is what creates
  // depth — one family can only ever look like wallpaper.
  float lines = c1 + c2 * trough * 0.7 + c3 * crest * 0.4;

  // Soft volume: the surface itself, so the bands are not floating on flat
  // black. Squared so most of the frame stays dark and the ridges read bright.
  float body = smoothstep(-0.35, 0.75, relief);
  body *= body;

  // Vignette keeps the type legible: the artwork belongs at the edges and
  // under the candles, not behind the headline.
  vec2 vc = (uv - 0.5) * vec2(1.15, 1.0);
  float vig = smoothstep(0.85, 0.15, length(vc));

  // Horizontal displacement of the bands. A lateral shear keyed to the field
  // makes the contours slide against each other rather than all advancing in
  // step, which is the "flowing past each other" read.
  float shear = fbm(p * 0.7 + vec2(0.0, t * 0.1));
  // Tuned so the artwork reads clearly at the edges and recedes under the
  // copy: the hero's headline and body text must stay the brightest thing on
  // the page.
  float density = body * 0.2 + lines * 0.78 + scan * 0.1;
  density *= mix(0.75, 1.0, shear * 0.5 + 0.5);
  // Keep-out under the type. The distortion belongs around and behind the
  // copy, not through it.
  float typeSafe = smoothstep(0.2, 0.78, length((uv - vec2(0.5, 0.45)) * vec2(0.92, 1.5)));
  density *= mix(0.4, 1.0, typeSafe);

  // The candles own the lower half of the hero. The field fades out before it
  // reaches them, so the chart always reads against a calm ground. gl_FragCoord
  // y is bottom-up, so a high uv.y is the top of the section.
  float aboveCandles = smoothstep(0.30, 0.70, uv.y);
  density *= mix(0.06, 1.0, aboveCandles);

  density *= vig * uIntensity;

  // Output is the palette colour only. The composite layer above decides how
  // dark the result is; nothing here can introduce a second hue.
  /*
     Icy grading, from the palette only.

     Ridges (high relief) burn to fusion — pale and cold, almost white.
     Troughs take ice, a deeper blue, which is what makes the surface read as
     frozen water rather than as grey smoke. The mix is keyed to the field, so
     the colour itself flows and warps along with the contours instead of being
     a flat wash behind them.
  */
  float icy = clamp(relief * 0.5 + 0.5, 0.0, 1.0);
  // Deep ice -> icy sky blue -> fusion. Blue owns the midtones, which is what
  // makes the field read as sky-coloured rather than as grey.
  vec3 tint = mix(uIceDeep, uIce, smoothstep(0.0, 0.45, icy));
  tint = mix(tint, uInk, smoothstep(0.75, 1.0, icy));

  // Push the whole thing brighter: what was unreadable has to be seen.
  float a = clamp(density * 1.5, 0.0, 1.0);
  gl_FragColor = vec4(tint * a, a);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    // A shader that fails to compile must not take the hero down; the caller
    // simply leaves the CSS background in place.
    console.warn("[fluid]", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/**
 * Palette. Three values, all of them already in the brand: blacktop, fusion,
 * and an ice blue that is fusion pushed colder. Nothing else may appear in the
 * shader.
 */
const FUSION: [number, number, number] = [0xd7 / 255, 0xef / 255, 0xff / 255];
const ICE: [number, number, number] = [0x8d / 255, 0xdc / 255, 0xf7 / 255];
const ICE_DEEP: [number, number, number] = [0x3d / 255, 0x8f / 255, 0xc9 / 255];

/**
 * How fast the field evolves. Scaling time here slows every layer together —
 * the warps, the relief, the finer contour family — so the whole surface breathes
 * at one rate instead of each layer needing its own multiplier retuned.
 *
 * Below 1 the motion is languid. It should read as something drifting, not as
 * something playing.
 */
const SPEED = 0.32;
const BLACKTOP: [number, number, number] = [0x0a / 255, 0x0a / 255, 0x0a / 255];

export function FluidShader({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    /*
       Reduced motion must not mean "no artwork". Bailing out here left the hero
       with nothing at all — and reduce-motion is on for a lot of people. The
       field still draws; it simply holds still.
    */
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const gl = (canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    }) || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[fluid]", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    // One full-screen triangle pair.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uPointer = gl.getUniformLocation(prog, "uPointer");
    const uMPos = gl.getUniformLocation(prog, "uMPos");
    const uMelt = gl.getUniformLocation(prog, "uMelt");
    const uInk = gl.getUniformLocation(prog, "uInk");
    const uIce = gl.getUniformLocation(prog, "uIce");
    const uIceDeep = gl.getUniformLocation(prog, "uIceDeep");
    const uContour = gl.getUniformLocation(prog, "uContour");
    const uIntensity = gl.getUniformLocation(prog, "uIntensity");

    gl.uniform3f(uInk, ...FUSION);
    gl.uniform3f(uIce, ...ICE);
    gl.uniform3f(uIceDeep, ...ICE_DEEP);
    gl.uniform1f(uContour, 8.5);
    gl.uniform1f(uIntensity, 1.6);
    gl.uniform2f(uPointer, 0.5, 0.5);
    gl.uniform2f(uMPos, 0.5, 0.5);
    gl.uniform1f(uMelt, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // additive: the shader only ever adds light

    // Cap the render resolution: this is a soft, low-frequency artwork, so
    // half resolution is indistinguishable and a quarter of the fill cost.
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * DPR));
      const h = Math.max(1, Math.round(r.height * DPR));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();

    // ── pointer, smoothed ────────────────────────────────────────────
    let tx = 0.5;
    let ty = 0.5;
    let cxp = 0.5;
    let cyp = 0.5;
    const onMove = (e: PointerEvent) => {
      tx = e.clientX / window.innerWidth;
      ty = 1 - e.clientY / window.innerHeight; // GL y is bottom-up
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    /*
       "Click to melt." The melt is bound to the hero only, so clicking a
       button or a link inside it still does what that control says: the
       handler bails out when the click landed on something interactive.
    */
    let melt = 0;
    let meltX = 0.5;
    let meltY = 0.5;
    const onDown = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest("a, button, input, select, textarea, [role='button']")) return;
      const r = canvas.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) return;
      melt = 1;
      meltX = e.clientX / window.innerWidth;
      meltY = 1 - e.clientY / window.innerHeight;
    };
    window.addEventListener("pointerdown", onDown, { passive: true });

    // ── lifecycle: only run what is on screen ────────────────────────
    let visible = true;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    let onScreen = true;
    const onVis = () => {
      onScreen = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVis);

    const start = performance.now();
    let raf = 0;
    let last = 0;
    // 40fps is enough for a field this soft, and leaves headroom for the
    // candle field animating in front of it.
    const FRAME_MS = 1000 / 40;

    const loop = (now: number) => {
      raf = window.requestAnimationFrame(loop);
      if (!visible || !onScreen) return;
      if (now - last < FRAME_MS) return;
      last = now;

      cxp += (tx - cxp) * 0.05;
      cyp += (ty - cyp) * 0.05;

      // Melt decays back to nothing, so the surface always returns to itself.
      if (melt > 0.001) {
        melt *= 0.978;
        if (melt < 0.001) melt = 0;
      }

      // Frozen time under reduced motion: the surface is there, it just does
      // not move.
      gl.uniform1f(uTime, reduced ? 12.0 : ((now - start) / 1000) * SPEED);
      gl.uniform2f(uPointer, cxp, cyp);
      gl.uniform2f(uMPos, meltX, meltY);
      gl.uniform1f(uMelt, melt);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = window.requestAnimationFrame(loop);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("visibilitychange", onVis);
      io.disconnect();
      ro.disconnect();
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{
        // The palette pair, in case WebGL is unavailable: the hero still reads
        // as designed rather than falling back to nothing.
        background: `radial-gradient(120% 90% at 50% 40%, rgba(${Math.round(
          FUSION[0] * 255,
        )}, ${Math.round(FUSION[1] * 255)}, ${Math.round(
          FUSION[2] * 255,
        )}, 0.06), rgba(${Math.round(BLACKTOP[0] * 255)}, ${Math.round(
          BLACKTOP[1] * 255,
        )}, ${Math.round(BLACKTOP[2] * 255)}, 0) 70%)`,
      }}
    />
  );
}
