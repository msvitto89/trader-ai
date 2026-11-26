"use client";

/**
 * Mercury — the headline as a body of oil.
 *
 * The text IS the oil. There is no liquid layer beside, behind or over it.
 *
 * There is no dye field at all. A stable-fluids solver runs on the GPU purely to
 * produce a velocity field from the cursor, and the display pass displaces the
 * TEXT MASK through that field:
 *
 *   text mask → fluid velocity → displaced glyph surface → white text
 *
 * So the material is the glyph itself: the letters stretch, compress and bend as
 * thick oil would, stay attached as one mass, never leave their place, and never
 * change colour — every visible pixel is #FFFFFF and only the silhouette moves.
 *
 * Steps per frame, all fragment shaders on RGBA16F targets:
 *   advect velocity → curl → vorticity confinement → viscous diffusion →
 *   divergence → Jacobi pressure → subtract gradient → inject forces → display
 */

import { useEffect, useRef } from "react";
import {
  ADVECT,
  CURL,
  DIVERGENCE,
  DISPLAY,
  FORCE,
  GRADIENT_SUBTRACT,
  PRESSURE,
  SMOOTH,
  VERT,
  VISCOSITY,
  VORTICITY,
} from "./mercury/glsl";


/* ── tuning, in one place ───────────────────────────────────────────────
   Velocities are in normalised crop units per second, so the physics does not
   change with screen size. Everything here is set for thick oil: heavy, slow,
   and reluctant to let go of its own shape.
*/
/**
 * Radius of the air bubble, in canvas heights — the same isotropic units the
 * force shader works in.
 *
 * The dot the user asked for is 6px. The bubble the OIL reacts to is
 * deliberately larger than the dot: a 6px void would displace about three sim
 * cells and be invisible. This is the radius of the fluid response, roughly a
 * fifth of the headline's cap height, which is the relationship the brief
 * actually describes — a small bubble, a wide parting of the oil around it.
 */
const BUBBLE_R = 0.075;
/**
 * How strongly the fluid is pulled toward the bubble's dipole velocity. Scaling
 * this up makes the oil part faster and further; the dipole shape itself is
 * exact potential flow and needs no tuning.
 */
const PULL = 0.055;
/** Falloff exponent of the bubble envelope; higher = tighter to the cursor. */
const FALLOFF = 120;
/**
 * How much of the pointer's own motion is fed into the fluid. This is what makes
 * a fast pass move the oil further and a slow one barely disturb it.
 */
const DRAG = 1.0;
/** Velocity is bled away where the glyphs are: the oil holds its place. */
const ANCHOR = 0.9;
/** Global viscous damping of the velocity field. */
const DAMP = 2.2;
/** Vorticity confinement: keeps curls rolling instead of diffusing. */
const VORTICITY_STRENGTH = 9;
/** Viscous diffusion coefficient per Jacobi step. */
const VISCOSITY_NU = 0.007;
const VISCOSITY_STEPS = 1;
const PRESSURE_STEPS = 18;
/**
 * How far the oil is drawn along the flow, as a multiple of the fluid's own
 * displacement. This is the effect's single strength control: the letters are
 * stretched by exactly this much and nothing else.
 */
const OIL = 2.7;
/**
 * Hard cap on the warp, in canvas heights. This is the legibility guarantee: no
 * pixel of a glyph may travel further than this from where the type drew it, so
 * the letters can lean and swell but can never come apart or leave the line.
 * 0.028 is a little over a third of the cap height of an 86px headline.
 */
const REACH = 0.048;

/**
 * Simulation rows. Sizing by the long edge gave a ~13:1 band only sixteen cells
 * tall, which read as blocks; the row count is what actually needs guaranteeing.
 */
const SIM_ROWS = 168;
/**
 * Mask cells per canvas pixel, and an absolute cap on the texture width.
 *
 * One cell per screen pixel is not enough: the display pass reads the mask at a
 * shifted position, so an edge that is only one texel wide stair-steps wherever
 * the warp is strong. Two cells per pixel leaves the bilinear filter enough room
 * to reconstruct a clean edge after displacement. The cap is a hard texture-size
 * bound for 4K-and-up displays.
 */
const MASK_OVERSAMPLE = 2;
const MASK_MAX = 8192;

const TARGET_SELECTOR = "[data-fluid-target]";

type Buf = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };
type Pass = {
  prog: WebGLProgram;
  loc: (name: string) => WebGLUniformLocation | null;
};

export function Mercury() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    const target = document.querySelector<HTMLElement>(TARGET_SELECTOR);
    if (!canvas || !host || !target) return;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    if (!gl) return;

    /*
       Half-float render targets are what make a real solver practical: velocity
       is signed and pressure is smooth, and neither survives an 8-bit round
       trip. Without the extension there is nothing honest to render, so the
       effect stays off rather than degrading into a fake.
    */
    if (!gl.getExtension("EXT_color_buffer_float")) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;


    /* ── programs ───────────────────────────────────────────────────── */
    const makePass = (frag: string): Pass | null => {
      const mk = (type: number, src: string) => {
        const sh = gl.createShader(type);
        if (!sh) return null;
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
          console.warn("[mercury]", gl.getShaderInfoLog(sh));
          gl.deleteShader(sh);
          return null;
        }
        return sh;
      };
      const vs = mk(gl.VERTEX_SHADER, VERT);
      const fs = mk(gl.FRAGMENT_SHADER, frag);
      if (!vs || !fs) return null;
      const prog = gl.createProgram();
      if (!prog) return null;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn("[mercury]", gl.getProgramInfoLog(prog));
        return null;
      }
      const cache = new Map<string, WebGLUniformLocation | null>();
      return {
        prog,
        loc: (name) => {
          if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
          return cache.get(name) ?? null;
        },
      };
    };

    const P = {
      advect: makePass(ADVECT),
      curl: makePass(CURL),
      vorticity: makePass(VORTICITY),
      viscosity: makePass(VISCOSITY),
      divergence: makePass(DIVERGENCE),
      pressure: makePass(PRESSURE),
      gradient: makePass(GRADIENT_SUBTRACT),
      force: makePass(FORCE),
      smooth: makePass(SMOOTH),
      display: makePass(DISPLAY),
    };
    if (Object.values(P).some((p) => !p)) return;

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    /* ── render targets ─────────────────────────────────────────────── */
    /*
       `linear` is for buffers that are read as a FIELD rather than as data. The
       solver's own passes hand-roll bilinear sampling and must see raw texels,
       but the warp field is read by the display at screen resolution: with NEAREST
       its ~11px cells show up as vertical striping across every stem.
    */
    const makeBuf = (w: number, h: number, linear = false): Buf => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      const filter = linear ? gl.LINEAR : gl.NEAREST;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        tex,
        0,
      );
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fbo, w, h };
    };

    const dispose = (b: Buf | null) => {
      if (!b) return;
      gl.deleteTexture(b.tex);
      gl.deleteFramebuffer(b.fbo);
    };

    let sim: { w: number; h: number } = { w: 1, h: 1 };
    let vel: [Buf, Buf] | null = null;
    let pressure: [Buf, Buf] | null = null;
    let divergence: Buf | null = null;
    let curl: Buf | null = null;
    let warpField: [Buf, Buf] | null = null;
    let maskTex: WebGLTexture | null = null;
    let maskSize = { w: 1, h: 1 };

    const teardownTargets = () => {
      vel?.forEach(dispose);
      pressure?.forEach(dispose);
      dispose(divergence);
      dispose(curl);
      warpField?.forEach(dispose);
      if (maskTex) gl.deleteTexture(maskTex);
      vel = pressure = null;
      divergence = curl = null;
      warpField = null;
      maskTex = null;
    };

    /* ── the type as a mask texture ─────────────────────────────────── */
    const maskCanvas = document.createElement("canvas");
    const maskCtx = maskCanvas.getContext("2d");

    const paintMask = () => {
      if (!maskCtx) return;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (!cw || !ch) return;

      const want = (canvas.width / Math.max(cw, 1)) * MASK_OVERSAMPLE;
      const scale = Math.min(want, MASK_MAX / Math.max(cw, ch));
      maskSize = {
        w: Math.max(8, Math.round(cw * scale)),
        h: Math.max(8, Math.round(ch * scale)),
      };
      maskCanvas.width = maskSize.w;
      maskCanvas.height = maskSize.h;

      const base = canvas.getBoundingClientRect();
      const k = maskSize.w / Math.max(base.width, 1);

      maskCtx.setTransform(1, 0, 0, 1, 0, 0);
      maskCtx.fillStyle = "#000";
      maskCtx.fillRect(0, 0, maskSize.w, maskSize.h);

      const cs = getComputedStyle(target);
      maskCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      /*
         Anchored on the DOM's own baseline, left-aligned at each glyph's own left
         edge — NOT centred on the element box.

         `textBaseline = "middle"` centres the FONT's ascent/descent (ascent 79,
         descent 21 for an 86px line of 87.72px), which is not where CSS put the
         line box: the real baseline sits 72px below the box top. So the copied
         type landed 6px high and 1.5px left, and because the canvas only takes
         over once `present` ramps up, that error showed up as the headline
         jumping upward a moment after load.
      */
      maskCtx.textAlign = "left";
      maskCtx.textBaseline = "alphabetic";
      maskCtx.fillStyle = "#fff";
      maskCtx.scale(k, k);

      const letters = Array.from(
        target.querySelectorAll<HTMLElement>("[data-letter]"),
      );
      /*
         One probe per line box, not per glyph: an inline-block zero-sized span
         sits on the text baseline, so its bottom edge IS the baseline. Measured
         from the first glyph of each distinct `top`, because letters on the same
         line share a baseline and the italic serif line does not.
      */
      const baselines = new Map<number, number>();
      for (const el of letters) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const lineKey = Math.round(r.top * 2);
        if (!baselines.has(lineKey)) {
          const probe = document.createElement("span");
          probe.style.cssText =
            "display:inline-block;width:0;height:0;padding:0;margin:0;border:0";
          el.appendChild(probe);
          const pr = probe.getBoundingClientRect();
          probe.remove();
          /*
             `getBoundingClientRect` invalidates layout, so re-read nothing here:
             the probe is removed before any geometry below is used, and the rect
             captured above is still valid because the probe is out of flow.
          */
          baselines.set(lineKey, pr.bottom);
        }
      }

      for (const el of letters) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const baseline = baselines.get(Math.round(r.top * 2)) ?? r.bottom;
        maskCtx.fillText(
          el.textContent ?? "",
          r.left - base.left,
          baseline - base.top,
        );
      }
      maskCtx.setTransform(1, 0, 0, 1, 0, 0);
    };

    const uploadMask = () => {
      paintMask();
      if (!maskTex) maskTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        maskCanvas,
      );
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    };

    /* ── sizing ─────────────────────────────────────────────────────── */
    const resize = () => {
      // Measure the canvas, not its wrapper: the canvas is deliberately larger
      // than the line box so the fluid has room to pool above and below it.
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const dw = Math.max(2, Math.round(rect.width * dpr));
      const dh = Math.max(2, Math.round(rect.height * dpr));
      if (canvas.width !== dw || canvas.height !== dh) {
        canvas.width = dw;
        canvas.height = dh;
      }

      const s = SIM_ROWS / dh;
      const w = Math.max(24, Math.round(dw * s));
      const h = Math.max(24, Math.round(dh * s));
      if (w === sim.w && h === sim.h && vel) {
        uploadMask();
        return;
      }
      sim = { w, h };
      teardownTargets();
      vel = [makeBuf(w, h), makeBuf(w, h)];
      pressure = [makeBuf(w, h), makeBuf(w, h)];
      divergence = makeBuf(w, h);
      curl = makeBuf(w, h);
      warpField = [makeBuf(w, h, true), makeBuf(w, h, true)];
      uploadMask();
    };

    resize();
    document.fonts?.ready.then(() => {
      resize();
    }).catch(() => {});
    // Observe the canvas, not the wrapper: the canvas is absolutely positioned
    // and oversized on purpose, so the wrapper's box never changes when the
    // canvas resizes and a host-only observer would miss it.
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    window.addEventListener("resize", resize);

    /* ── pointer ────────────────────────────────────────────────────── */
    const pointer = { x: 0.5, y: 0.5 };
    const pointerVel = { x: 0, y: 0 };
    let pointerTarget = { x: 0.5, y: 0.5 };
    /*
       Starts "long ago", not at zero. At zero the drive gate opens on the very
       first frame and a phantom cursor sits at the centre of the canvas, pulling
       the fluid with a force the user never asked for — the letters then never
       stop moving. The effect must begin in the untouched state.
    */
    let pointerSeen = 99; // seconds since the pointer last moved
    let present = 0; // 0..1 — ramps the whole effect, so it never snaps
    let gate = 0; // 0..1 — how hard the cursor is currently driving the fluid

    const toUv = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointerTarget = {
        x: (e.clientX - r.left) / Math.max(r.width, 1),
        // Canvas rows run bottom-up in GL space.
        y: 1 - (e.clientY - r.top) / Math.max(r.height, 1),
      };
    };
    /*
       The dot is positioned in the host's coordinate space, not the canvas's: the
       canvas is deliberately oversized (it hangs 50px above the type so the oil
       has room to pool), and the dot must sit exactly on the cursor, not on the
       matching point of an enlarged box.
    */
    const bubble = bubbleRef.current;
    const moveBubble = (e: PointerEvent) => {
      if (!bubble || !host) return;
      const r = host.getBoundingClientRect();
      bubble.style.transform = `translate3d(${e.clientX - r.left}px, ${
        e.clientY - r.top
      }px, 0) translate(-50%, -50%)`;
      /*
         Shown on the first move rather than on `pointerenter`: a pointer that
         arrives already inside the target never fires the enter event, which left
         the dot invisible on touch and on fast entry.
      */
      bubble.style.opacity = "1";
    };

    const onMove = (e: PointerEvent) => {
      toUv(e);
      pointerSeen = 0;
      moveBubble(e);
    };
    const onLeave = () => {
      pointerSeen = 99;
      if (bubble) bubble.style.opacity = "0";
    };
    target.addEventListener("pointermove", onMove, { passive: true });
    target.addEventListener("pointerleave", onLeave);
    target.addEventListener("pointerdown", onMove, { passive: true });

    /* ── passes ─────────────────────────────────────────────────────── */
    const bindQuad = (pass: Pass) => {
      gl.useProgram(pass.prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      const a = gl.getAttribLocation(pass.prog, "aPos");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    };

    const run = (dest: Buf | null, pass: Pass, setup: () => void) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dest ? dest.fbo : null);
      gl.viewport(0, 0, dest ? dest.w : canvas.width, dest ? dest.h : canvas.height);
      bindQuad(pass);
      setup();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const bind = (unit: number, tex: WebGLTexture | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    };

    /*
       Sampler uniforms default to unit 0 in GL. Every pass here reads two
       textures, so each one has to be told which unit to sample or it reads
       whatever happens to be bound first — which silently collapses the whole
       solver to zero.
    */
    const units = (pass: Pass, map: Record<string, number>) => {
      for (const [name, unit] of Object.entries(map)) {
        const l = pass.loc(name);
        if (l) gl.uniform1i(l, unit);
      }
    };

    /* ── loop ───────────────────────────────────────────────────────── */
    let raf = 0;
    let last = 0;
    let time = 0;
    let alive = true;
    let cleared = false;
    // The headline's resting opacity, so it can be restored exactly.
    const baseOpacity = getComputedStyle(target).opacity || "1";
    let prevOpacity = "";

    /*
       ── the handoff gate ──────────────────────────────────────────────
       The kinetic entrance animates every glyph with a transform, and the vector
       mask is a rasterisation of where those glyphs are AT THE MOMENT it is
       painted. Taking the surface over before the animation has landed therefore
       does three things wrong at once: the mask records letters mid-flight, the
       DOM copy fades out first, and for a few hundred milliseconds after a reload
       the headline is simply missing.

       So the crossfade waits for the type to stop moving. "Stopped" is measured,
       not assumed: the glyph rects are sampled on a timer, and the handoff opens
       once two consecutive samples agree. When it opens, the mask is repainted
       from the settled geometry, so the canvas copy is aligned with the DOM copy
       it replaces and the crossfade is invisible.
    */
    let settled = false;
    const letterSig = () => {
      let sig = "";
      for (const el of target.querySelectorAll<HTMLElement>("[data-letter]")) {
        const r = el.getBoundingClientRect();
        sig += `${r.left.toFixed(2)},${r.top.toFixed(2)};`;
      }
      return sig;
    };
    const probeSettle = () => {
      if (settled) return;
      const sig = letterSig();
      if (sig === lastSig) {
        settled = true;
        clearInterval(settleTimer);
        // Geometry is final now: re-rasterise so the copy is pixel-aligned.
        uploadMask();
      } else {
        lastSig = sig;
      }
    };
    let lastSig = letterSig();
    const settleTimer = window.setInterval(probeSettle, 140);
    /*
       Hard stop. The observer above only decides WHEN to hand over; it must never
       be the reason the effect fails to appear, so after a few seconds the
       handoff opens regardless of what the sampler saw.
    */
    const settleDeadline = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        clearInterval(settleTimer);
        uploadMask();
      }
    }, 4000);
    /*
       The shader draws the type once it has fully taken over, so the DOM headline
       is hidden then. It has to stay in the document — it is what the glyph mask
       is measured from — but showing it too would stack a still copy under a
       strained one.

       The fade is held back until the canvas is essentially at full strength, and
       only then runs quickly. Fading the DOM copy out at the same rate the canvas
       fades in produces a visible dip: for a few frames neither copy is fully
       opaque, which reads as the headline blinking as it swaps. Because the two
       copies are pixel-aligned at rest, letting them overlap is invisible.
    */
    const opacityFor = (p: number) => {
      const t = Math.min(1, Math.max(0, (p - 0.88) / 0.12));
      return String(Number(baseOpacity) * (1 - t));
    };

    const frame = (now: number) => {
      if (!alive) return;
      raf = window.requestAnimationFrame(frame);

      const dtRaw = last ? (now - last) / 1000 : 1 / 60;
      last = now;
      /*
         Two clocks. The solver needs a clamped step for stability, but the
         fades are interface timing and must follow the wall clock — tying them
         to the clamped step made the whole ramp run at a fraction of real speed
         whenever the frame rate dipped.
      */
      const dt = Math.min(Math.max(dtRaw, 1 / 240), 1 / 30);
      /*
         0.25s, not 0.1s: clamping tighter than this makes the fades crawl on a
         slow GPU, where a handful of frames can take seconds of wall clock.
      */
      const uiDt = Math.min(dtRaw, 0.25);
      if (!reduce) time += dt;
      pointerSeen += uiDt;

      // Ease the pointer sample: a hard step injects a velocity spike and the
      // solver rings. This is also what gives fast movement its longer tail.
      const ease = Math.min(1, uiDt * 14);
      const prevX = pointer.x;
      const prevY = pointer.y;
      pointer.x += (pointerTarget.x - pointer.x) * ease;
      pointer.y += (pointerTarget.y - pointer.y) * ease;

      const idle = pointerSeen > 0.4;
      const vx = idle ? 0 : (pointer.x - prevX) / Math.max(uiDt, 1e-3);
      const vy = idle ? 0 : (pointer.y - prevY) / Math.max(uiDt, 1e-3);
      // Smooth the drag, so one jittery frame cannot yank the fluid.
      const ke = Math.min(1, uiDt * 9);
      pointerVel.x += (vx - pointerVel.x) * ke;
      pointerVel.y += (vy - pointerVel.y) * ke;

      /*
         Always on. The metal is the headline's own finish from the first frame;
         the pointer only adds strain. `present` is kept as the single fade
         channel so the arrival is still soft rather than a snap.
      */
      /*
         Drive, not a fade. The force is only injected while the cursor is
         actually moving; once it stops, `gate` eases to zero and the velocity
         field is left to itself — advected, anchored inside the glyphs and
         damped. That decay IS the gather: the oil creeps back into the
         letterform and the dead zone in the display pass then returns the type
         to perfectly clean, not to a faint permanent wobble.
      */
      /*
         0.4s, not something tighter: `pointerSeen` is advanced by the wall clock
         once per frame, so on a slow GPU a single frame can add more than a
         hundred milliseconds and a tight window would close between two moves.
         Four hundred milliseconds reads as "still moving" to a person and is
         comfortably longer than a frame on any hardware.
      */
      const want = pointerSeen < 0.4 ? 1 : 0;
      gate += (want - gate) * Math.min(1, uiDt * (want > gate ? 10 : 1.6));

      // ── the canvas only takes over once the entrance has landed ────
      if (settled) present += (1 - present) * Math.min(1, uiDt * 3.0);
      if (present > 0.999) present = 1;

      if (!vel || !pressure || !divergence || !curl || !warpField || !maskTex) return;

      /*
         Dormant pool: no fluid work at all. The sim is continuous, so without
         this the solver and its twenty-odd passes would run forever behind a
         headline nobody is pointing at.
      */
      /*
         While the metal is present it draws the letterforms itself, so the DOM
         headline is faded underneath it. Two copies would otherwise show: a
         still one and a twisted one.
      */
      const opacity = opacityFor(present);
      if (prevOpacity !== opacity) {
        target.style.opacity = opacity;
        prevOpacity = opacity;
      }

      if (present === 0) {
        if (!cleared) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          cleared = true;
        }
        return;
      }
      cleared = false;

      const aspect = sim.w / sim.h;
      const force = P.force!;
      const advect = P.advect!;
      const curlP = P.curl!;
      const vort = P.vorticity!;
      const visc = P.viscosity!;
      const divP = P.divergence!;
      const presP = P.pressure!;
      const gradP = P.gradient!;

      // 1 — advect velocity by itself
      run(vel[1], advect, () => {
        bind(0, vel![0].tex);
        bind(1, vel![0].tex);
        units(advect, { uVelocity: 0, uSource: 1 });
        gl.uniform2f(advect.loc("uTexel"), 1 / sim.w, 1 / sim.h);
        gl.uniform1f(advect.loc("uDt"), dt);
        gl.uniform1f(advect.loc("uDissipation"), 0.45);
      });
      swap();

      // 2 — vorticity confinement
      run(curl!, curlP, () => {
        bind(0, vel![0].tex);
        units(curlP, { uVelocity: 0 });
        gl.uniform2f(curlP.loc("uTexel"), 1 / sim.w, 1 / sim.h);
      });
      run(vel[1], vort, () => {
        bind(0, vel![0].tex);
        bind(1, curl!.tex);
        units(vort, { uVelocity: 0, uCurl: 1 });
        gl.uniform2f(vort.loc("uTexel"), 1 / sim.w, 1 / sim.h);
        gl.uniform1f(vort.loc("uDt"), dt);
        /*
           Gated on `gate`, not just damped. Confinement renormalises the curl,
           so it happily takes a residual of 1e-9 and pumps it back up into a
           visible swirl: an ungated solver never actually stops. Scaling it
           with the drive lets the field decay all the way to zero.
        */
        gl.uniform1f(vort.loc("uStrength"), VORTICITY_STRENGTH * gate);
      });
      swap();

      // 3 — viscous diffusion: this is the "thick" in thick mercury
      for (let i = 0; i < VISCOSITY_STEPS; i++) {
        run(vel[1], visc, () => {
          bind(0, vel![0].tex);
          units(visc, { uVelocity: 0 });
          gl.uniform2f(visc.loc("uTexel"), 1 / sim.w, 1 / sim.h);
          gl.uniform1f(visc.loc("uNu"), VISCOSITY_NU);
        });
        swap();
      }

      // 4 — incompressible projection
      run(divergence!, divP, () => {
        bind(0, vel![0].tex);
        units(divP, { uVelocity: 0 });
        gl.uniform2f(divP.loc("uTexel"), 1 / sim.w, 1 / sim.h);
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, pressure[0].fbo);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (let i = 0; i < PRESSURE_STEPS; i++) {
        run(pressure[1], presP, () => {
          bind(0, pressure![0].tex);
          bind(1, divergence!.tex);
          units(presP, { uPressure: 0, uDivergence: 1 });
          gl.uniform2f(presP.loc("uTexel"), 1 / sim.w, 1 / sim.h);
        });
        swapPressure();
      }
      run(vel[1], gradP, () => {
        bind(0, pressure![0].tex);
        bind(1, vel![0].tex);
        units(gradP, { uPressure: 0, uVelocity: 1 });
        gl.uniform2f(gradP.loc("uTexel"), 1 / sim.w, 1 / sim.h);
      });
      swap();

      /*
         5 — forces, applied AFTER the projection on purpose: the projection

         The attraction is a radial field — the gradient of a potential — and an
         incompressible projection cancels gradient components outright. Injected
         before the pressure solve, almost all of it was erased and the dye only
         ever gained a soft halo. Post-projection injection is the usual place
         for an external force for exactly this reason.
      */
      run(vel[1], force, () => {
        bind(0, vel![0].tex);
        bind(1, maskTex);
        units(force, { uVelocity: 0, uMask: 1 });
        gl.uniform2f(force.loc("uTexel"), 1 / sim.w, 1 / sim.h);
        gl.uniform1f(force.loc("uDt"), dt);
        gl.uniform1f(force.loc("uTime"), time);
        gl.uniform1f(force.loc("uAspect"), aspect);
        gl.uniform2f(force.loc("uPointer"), pointer.x, pointer.y);
        gl.uniform2f(force.loc("uPointerVel"), pointerVel.x * DRAG, pointerVel.y * DRAG);
        gl.uniform1f(force.loc("uBubbleR"), BUBBLE_R);
        gl.uniform1f(force.loc("uPull"), PULL * present * gate);
        gl.uniform1f(force.loc("uFalloff"), FALLOFF);
        gl.uniform1f(force.loc("uAnchor"), ANCHOR);
        gl.uniform1f(force.loc("uDamp"), DAMP);
      });
      swap();

      /*
         6 — the warp field. Two wide blurs of the velocity, at a bigger radius
         the second time. This is not physics: it exists so the text is bent by a
         low-frequency field rather than chewed by the solver's own small curls.
      */
      const smoothP = P.smooth!;
      let src = vel[0];
      for (let i = 0; i < 2; i++) {
        const dst = warpField[i % 2];
        run(dst, smoothP, () => {
          bind(0, src.tex);
          units(smoothP, { uSource: 0 });
          gl.uniform2f(smoothP.loc("uTexel"), 1 / sim.w, 1 / sim.h);
          gl.uniform1f(smoothP.loc("uRadius"), i === 0 ? 2.2 : 3.4);
        });
        src = dst;
      }

      /*
         7 — display. Only the mask and the warp field are bound: the text is
         displaced by the flow and drawn as white. Nothing else exists.
      */
      const disp = P.display!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      bindQuad(disp);
      bind(0, maskTex);
      bind(1, src.tex);
      units(disp, { uMask: 0, uVelocity: 1 });
      gl.uniform2f(disp.loc("uVelTexel"), 1 / sim.w, 1 / sim.h);
      /*
         `uStrength` is presence only — whether the canvas is drawing at all. The
         deformation is not gated here: it comes entirely from the velocity field,
         which decays on its own when the cursor stops, so the type gathers back
         under inertia instead of fading.
      */
      gl.uniform1f(disp.loc("uStrength"), present);
      gl.uniform1f(disp.loc("uOil"), OIL);
      gl.uniform1f(disp.loc("uReach"), REACH);
      gl.uniform1f(disp.loc("uAspect"), canvas.width / Math.max(canvas.height, 1));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
    };

    const swap = () => {
      if (!vel) return;
      const t = vel[0];
      vel[0] = vel[1];
      vel[1] = t;
    };
    const swapPressure = () => {
      if (!pressure) return;
      const t = pressure[0];
      pressure[0] = pressure[1];
      pressure[1] = t;
    };

    // Kick the pool so it is already liquid when the pointer arrives.
    raf = window.requestAnimationFrame(frame);

    return () => {
      alive = false;
      window.cancelAnimationFrame(raf);
      clearInterval(settleTimer);
      clearTimeout(settleDeadline);
      ro.disconnect();
      window.removeEventListener("resize", resize);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerleave", onLeave);
      target.removeEventListener("pointerdown", onMove);
      target.style.opacity = "";
      teardownTargets();
      for (const p of Object.values(P)) if (p) gl.deleteProgram(p.prog);
      gl.deleteBuffer(vbo);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 z-30 w-full"
        /*
           Explicit height, not inset stretching: a <canvas> carries an intrinsic
           aspect ratio from its width/height attributes, and with height:auto
           that wins over top/bottom, pinning the element to the 96px line box and
           clipping every strand the fluid tried to grow.
        */
        style={{ top: "-50px", height: "calc(100% + 62px)" }}
      />
      {/*
         The bubble itself: a 6px dot that tracks the cursor. It is the visible
         body whose parting of the oil the canvas above renders, and it is what
         makes the deformation legible — without a marked centre, oil bulging away
         from nothing reads as the letters wobbling rather than as something
         moving through them.

         Its own fixed layer with `will-change: transform`, driven straight from
         the pointer handler, so it stays glued to the cursor rather than lagging
         one animation frame behind the fluid it causes.
      */}
      <span
        ref={bubbleRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-40 size-1.5 rounded-full will-change-transform"
        style={{
          /*
             No opacity transition here on purpose. A transition on this element
             stalled at progress 0 in a software renderer — the inline value was
             "1" while the computed value stayed "0" — so the bubble never
             appeared at all. It is a pointer affordance, and a cursor should
             appear immediately anyway.
          */
          opacity: 0,
          /*
             `translate3d` rather than left/top: the dot is composited, so moving
             it never touches layout. The -50% centres it on the cursor.

             Painted as a HOLE, not a highlight. An air bubble in oil is a void
             with a bright meniscus film around it, so the centre is the page
             background and the ring is white. A white fill would vanish the
             moment the bubble crossed a letter — white on white — which is
             exactly where it needs to be seen.
          */
          transform: "translate3d(-50%, -50%, 0)",
          background: "#0A0A0A",
          boxShadow:
            "0 0 0 1px rgba(255,255,255,0.9), 0 0 0 2.5px rgba(215,239,255,0.28), 0 0 9px 2px rgba(215,239,255,0.35)",
        }}
      />
    </>
  );
}
