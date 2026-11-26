"use client";

import { useEffect, useRef } from "react";

/**
 * FluidShader — a live liquid filter for a single line of type.
 *
 * Rendered off-screen and exposed to CSS as a filter via SVG <feImage>, so it
 * can be applied to the hero headline alone. Nothing is painted behind the
 * page: the canvas is never in the layout, never visible, and never receives a
 * pixel of its own.
 *
 * Control is the whole point here, so three things gate it:
 *
 *   hover     the filter is only attached while the pointer is over the line,
 *             and detached when it leaves — a resting headline is plain text
 *   fade      a strength value ramps 0 -> 1 over ~320ms and back, so the effect
 *             arrives and leaves smoothly instead of snapping on
 *   reduced   under prefers-reduced-motion time is frozen: the warp appears and
 *             holds a single shape instead of animating
 *
 * The original background notes follow, since the field maths is unchanged.
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
 * Colour is deliberately not part of the design: the shader outputs palette
 * colours from single uniforms, so the artwork can never introduce a hue the
 * brand does not own.
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
     Output a displacement map, not a picture.

     feDisplacementMap reads R and G as a signed offset around 0.5, so that is
     what this writes: R and G carry the direction the field wants to push the
     glyphs, B is left neutral. The domain warping is unchanged — it is what
     decides the *shape* of the distortion, which is the whole reason the warp
     looks organic rather than like a lens wobble.

     The gradient of the field is a better displacement source than the field
     itself: sampling the field directly gives a wash, while its gradient gives
     directional flow that pulls type along contour lines.
  */
  float eps = 0.004;
  float f0 = relief;
  float fx = warpedField(p + vec2(eps, 0.0), t) + 0.35 * fbm((p + vec2(eps, 0.0)) * 2.1 + t * 0.07);
  float fy = warpedField(p + vec2(0.0, eps), t) + 0.35 * fbm((p + vec2(0.0, eps)) * 2.1 + t * 0.07);

  vec2 grad = vec2(fx - f0, fy - f0) / eps;

  // Compress the gradient into a usable range: raw values are far too spiky
  // and would tear the letterforms. tanh keeps large gradients from clipping.
  // GLSL ES 1.0 has no tanh(); build it from exp and clamp the argument so a
  // huge gradient cannot overflow.
  vec2 g = clamp(grad * 0.06, -8.0, 8.0);
  vec2 e = exp(2.0 * g);
  vec2 dir = (e - 1.0) / (e + 1.0);

  // Swirl: rotate the offset slightly toward the tangent, which is what makes
  // the displacement look liquid rather than like a height map.
  float swirl = 0.35;
  dir = mat2(cos(swirl), -sin(swirl), sin(swirl), cos(swirl)) * dir;

  // Presence ramps with the melt uniform, so a still field is inert.
  float amount = clamp(uMelt * 1.4, 0.0, 1.0);

  gl_FragColor = vec4(
    clamp(0.5 + dir.x * 0.5 * amount, 0.0, 1.0),
    clamp(0.5 + dir.y * 0.5 * amount, 0.0, 1.0),
    0.5,
    1.0
  );
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
 * How fast the field evolves. Scaling time here slows every layer together —
 * the warps, the relief, the finer contour family — so the whole surface breathes
 * at one rate instead of each layer needing its own multiplier retuned.
 *
 * Below 1 the motion is languid. It should read as something drifting, not as
 * something playing.
 */
const SPEED = 0.192; // 40% slower than the previous 0.32

/** Where the effect lands: the hero headline only, and only on hover. */
const TARGET_SELECTOR = "[data-fluid-target]";
const FILTER_ID = "fluid-warp";

/**
 * Peak displacement, in px, at full strength. Deliberately small: this runs on
 * type. Past roughly 8 the letterforms stop being type and start being an
 * effect, which is the opposite of "controlled and clean".
 */
const MAX_DISPLACEMENT = 6;


/**
 * How fast the field evolves. Scaling time here slows every layer together —
 * the warps, the relief, the finer contour family — so the whole surface breathes
 * at one rate instead of each layer needing its own multiplier retuned.

/**
 * A flat grey field, held as a data URI. It exists only so <feImage> has a
 * valid, always-resolvable reference; the live WebGL canvas cannot be sampled
 * per frame without preserveDrawingBuffer churn, and a scroll of static
 * magenta noise is not what this effect needs anyway. Keeping it neutral means
 * a browser that fails to load it degrades to no warp rather than to garbage.
 */

export function FluidShader() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /*
       Reduced motion does not mean "no effect". Gating on it here is what made
       this look broken: with the OS setting on, the filter was never created and
       hovering did nothing at all.

       Instead the effect still runs, but its time is frozen — the warp arrives
       and holds a single shape. Motion is what the setting asks to avoid, not
       the presence of the design.
    */
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const gl = (canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
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

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uPointer = gl.getUniformLocation(prog, "uPointer");
    const uMPos = gl.getUniformLocation(prog, "uMPos");
    const uMelt = gl.getUniformLocation(prog, "uMelt");
    const uContour = gl.getUniformLocation(prog, "uContour");
    const uIntensity = gl.getUniformLocation(prog, "uIntensity");

    gl.uniform1f(uContour, 8.5);
    gl.uniform1f(uIntensity, 2.6); // the filter blends it down; the field supplies shape
    gl.uniform2f(uPointer, 0.5, 0.5);
    gl.uniform2f(uMPos, 0.5, 0.5);
    gl.uniform1f(uMelt, 0);

    /*
       Off-screen surface, sized once to a fixed aspect. It is not in the
       layout and not visible: SVG <feImage> samples it, and the filter's own
       alpha decides what lands on the glyphs.
    */
    const W = 512;
    const H = 256;
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
    gl.uniform2f(uRes, W, H);

    /* ── one loop, one source of truth ─────────────────────────────────
       An earlier cut ran two loops: one to advance the field, one to sync the
       filter. The sync loop cancelled itself when idle and was never restarted,
       so hovering moved the shader but never attached the filter. Everything
       now happens in a single tick, so strength, the GPU draw and the DOM
       attribute can never disagree.
    */
    let strength = 0;
    let target = 0;
    let melt = 0;
    let time = 12;
    let raf = 0;
    let hovering = false;
    let attached = false;
    let lastExport = 0;
    let lastFrame = 0;
    let lastStrengthAt = 0;
    const FRAME_MS = 1000 / 40;

    /* ── the SVG filter that carries the field onto the text ─────────── */
    /*
       feDisplacementMap needs the field as an image. href cannot reference a
       live canvas, so the field is exported to a data URL and swapped in at a
       throttled rate. It is a low-frequency displacement map, so 24 swaps a
       second reads as continuous — and it only happens while hovering.
    */
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";

    const filter = document.createElementNS(NS, "filter") as SVGFilterElement;
    filter.setAttribute("id", FILTER_ID);
    filter.setAttribute("x", "-6%");
    filter.setAttribute("y", "-22%");
    filter.setAttribute("width", "112%");
    filter.setAttribute("height", "144%");
    filter.setAttribute("color-interpolation-filters", "sRGB");

    const img = document.createElementNS(NS, "feImage") as SVGFEImageElement;
    img.setAttribute("x", "0");
    img.setAttribute("y", "0");
    img.setAttribute("width", "100%");
    img.setAttribute("height", "100%");
    img.setAttribute("preserveAspectRatio", "none");
    img.setAttribute("result", "field");
    filter.appendChild(img);

    const disp = document.createElementNS(NS, "feDisplacementMap") as SVGFEDisplacementMapElement;
    disp.setAttribute("in", "SourceGraphic");
    disp.setAttribute("in2", "field");
    disp.setAttribute("scale", "0");
    disp.setAttribute("xChannelSelector", "R");
    disp.setAttribute("yChannelSelector", "G");
    filter.appendChild(disp);

    svg.appendChild(filter);
    document.body.appendChild(svg);

    const targetEl = document.querySelector<HTMLElement>(TARGET_SELECTOR);
    if (!targetEl) {
      svg.remove();
      return;
    }

    // A valid field before any hover, so the filter is never attached to an
    // empty image.
    img.setAttribute("href", canvas.toDataURL("image/png"));

    const tick = (now: number) => {
      raf = 0;
      if (now - lastFrame < FRAME_MS) {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      lastFrame = now;

      /*
         Advance strength at a fixed rate rather than a proportion of the gap.
         Proportional easing is asymptotic: it approaches zero and never arrives,
         so the filter stayed attached at a scale of 0.3 long after the pointer
         had left. A linear step always reaches the target, which means the
         effect is guaranteed to detach completely and the headline returns to
         plain text.
      */
      const RISE_MS = 340;
      const FALL_MS = 420;
      const dt = Math.min(64, now - (lastStrengthAt || now));
      lastStrengthAt = now;
      if (target > strength) {
        strength = Math.min(target, strength + dt / RISE_MS);
      } else if (target < strength) {
        strength = Math.max(target, strength - dt / FALL_MS);
      }

      if (!reduced) time += 0.06 * SPEED * 6;
      if (melt > 0.001) {
        melt *= 0.985;
        if (melt < 0.001) melt = 0;
      }

      // ── draw the displacement field ──
      gl.uniform1f(uTime, time);
      gl.uniform1f(uMelt, melt);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // ── reflect it into the DOM ──
      disp.setAttribute("scale", (strength * MAX_DISPLACEMENT).toFixed(2));

      const on = strength > 0.02;
      if (on && !attached) {
        targetEl.style.filter = `url(#${FILTER_ID})`;
        attached = true;
      } else if (!on && attached) {
        targetEl.style.filter = "";
        attached = false;
      }

      if (on && now - lastExport > 1000 / 24) {
        lastExport = now;
        img.setAttribute("href", canvas.toDataURL("image/png"));
      }

      // Keep going while anything is still moving.
      const settled = strength === target && melt === 0 && !hovering;
      if (!settled) raf = window.requestAnimationFrame(tick);
    };

    const kick = () => {
      if (raf) return;
      lastFrame = 0;
      raf = window.requestAnimationFrame(tick);
    };

    const onEnter = () => {
      hovering = true;
      target = 1;
      melt = 1;
      kick();
    };
    const onLeave = () => {
      hovering = false;
      target = 0;
      kick();
    };
    const onMove = (e: PointerEvent) => {
      // 0..1 within the line, so the field bends where the pointer is.
      const r = targetEl.getBoundingClientRect();
      gl.uniform2f(
        uPointer,
        Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1))),
        Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / (r.height || 1))),
      );
      if (hovering) kick();
    };

    targetEl.addEventListener("pointerenter", onEnter);
    targetEl.addEventListener("pointerleave", onLeave);
    targetEl.addEventListener("pointermove", onMove);

    // One draw so the field exists, but no filter is attached until hover.
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    img.setAttribute("href", canvas.toDataURL("image/png"));

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      targetEl.removeEventListener("pointerenter", onEnter);
      targetEl.removeEventListener("pointerleave", onLeave);
      targetEl.removeEventListener("pointermove", onMove);
      targetEl.style.filter = "";
      svg.remove();
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
      // Off-screen and inert: its pixels only ever exist inside the filter.
      style={{ position: "absolute", left: "-9999px", top: 0, width: 1, height: 1 }}
    />
  );
}
