"use client";

/**
 * Mercury — a GPU fluid driven by the cursor, sourced from the headline.
 *
 * The type is not animated. It is a fixed shape, and its glyphs are the inflow
 * boundary of an actual stable-fluids solver running on the GPU:
 *
 *   pointer → force field → velocity → incompressible projection → dye
 *
 * The dye field is seeded from the letterforms and relaxed back toward them
 * every frame. So the liquid exists only as a sheet clinging to the text; the
 * cursor's attraction pumps it outward into strands, and the relaxation drags
 * it home when the cursor leaves. Nothing is ever advected away from the type
 * permanently, which is why the body stays continuous instead of breaking into
 * particles, and why the text itself never moves.
 *
 * Steps per frame, all in fragment shaders on RGBA16F targets:
 *   advect velocity → curl → vorticity confinement → viscous diffusion →
 *   divergence → Jacobi pressure → subtract gradient → inject forces →
 *   advect dye → inflow + spring relaxation → shade the mercury
 */

import { useEffect, useRef } from "react";
import {
  ADVECT,
  CURL,
  DIVERGENCE,
  DISPLAY,
  DYE,
  FORCE,
  GRADIENT_SUBTRACT,
  PRESSURE,
  VERT,
  VISCOSITY,
  VORTICITY,
} from "./mercury/glsl";

/* ── tuning, in one place ───────────────────────────────────────────────
   Velocities are in normalised crop units per second, so the physics does not
   change with screen size. Everything here was chosen for "thick syrup": slow,
   heavy, and slow to let go.
*/
/**
 * Accel toward the pointer, in crop-widths per second squared. The first value
 * tried here (3.4) combined with the damping below gave a terminal velocity of
 * several crop widths per second: the dye left the domain in a few frames and
 * the surface never had time to look viscous.
 */
const PULL = 3.6;
/** Falloff exponent of the attraction field; higher = tighter to the cursor. */
const FALLOFF = 6.2;
/**
 * How much of the pointer's own motion is fed into the fluid. This is what makes
 * a fast pass drag a long trail and a direction change bend the strand.
 */
const DRAG = 0.35;
/** Velocity is bled away where the glyphs are: the anchor. */
const ANCHOR = 7.0;
/** Global viscous damping of the velocity field. */
const DAMP = 1.0;
/** Vorticity confinement: keeps curls rolling instead of diffusing. */
const VORTICITY_STRENGTH = 30;
/** Viscous diffusion coefficient per Jacobi step. */
const VISCOSITY_NU = 0.007;
const VISCOSITY_STEPS = 1;
const PRESSURE_STEPS = 18;
/** Dye seeded from the glyphs per second. */
const INFLOW = 13.0;
/** Spring rate pulling the dye back onto the glyphs. */
const RETURN = 0.42;
/** How fast stretched mercury evaporates once unsupported. */
const DYE_DISSIPATION = 0.30;
/** Relief used for the surface normal: higher = more violent highlights. */
const RELIEF = 3.4;
/**
 * Peak rotation, in radians, that the type is twisted through at the pointer.
 * Applied in the display pass rather than the solver: a rotation about a point
 * is close to curl-free, so the pressure projection would flatten it.
 */
const TWIST = 0.17;
/**
 * How hard the letterforms are displaced by the fluid's own velocity. This is
 * what fuses type and metal — the glyphs are sampled through the flow, so they
 * shear and stretch with it instead of merely being covered by it. Kept small:
 * the first attempt read as the word being torn apart rather than strained.
 */
const TEXT_WARP = 0.4;
/**
 * Simulation rows. Sizing by the long edge gave a ~13:1 band only sixteen cells
 * tall, which read as blocks; the row count is what actually needs guaranteeing.
 */
const SIM_ROWS = 168;
/** Mask texture cells across the crop's long edge. */
const MASK_LONG = 1600;

const TARGET_SELECTOR = "[data-fluid-target]";

type Buf = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };
type Pass = {
  prog: WebGLProgram;
  loc: (name: string) => WebGLUniformLocation | null;
};

export function Mercury() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
      dye: makePass(DYE),
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
    const makeBuf = (w: number, h: number): Buf => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
    let dye: [Buf, Buf] | null = null;
    let pressure: [Buf, Buf] | null = null;
    let divergence: Buf | null = null;
    let curl: Buf | null = null;
    let maskTex: WebGLTexture | null = null;
    let maskSize = { w: 1, h: 1 };

    const teardownTargets = () => {
      vel?.forEach(dispose);
      dye?.forEach(dispose);
      pressure?.forEach(dispose);
      dispose(divergence);
      dispose(curl);
      if (maskTex) gl.deleteTexture(maskTex);
      vel = dye = pressure = null;
      divergence = curl = null;
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

      const long = MASK_LONG;
      const scale = long / Math.max(cw, ch);
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
      maskCtx.textAlign = "center";
      maskCtx.textBaseline = "middle";
      maskCtx.fillStyle = "#fff";
      maskCtx.scale(k, k);

      for (const el of target.querySelectorAll<HTMLElement>("[data-letter]")) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        maskCtx.fillText(
          el.textContent ?? "",
          r.left + r.width / 2 - base.left,
          r.top + r.height / 2 - base.top,
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
      dye = [makeBuf(w, h), makeBuf(w, h)];
      pressure = [makeBuf(w, h), makeBuf(w, h)];
      divergence = makeBuf(w, h);
      curl = makeBuf(w, h);
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
    let pointerSeen = 0; // seconds since the pointer last moved
    let present = 0; // 0..1 — ramps the whole effect, so it never snaps

    let clientX = -9999;
    let clientY = -9999;
    const toUv = (e: PointerEvent) => {
      clientX = e.clientX;
      clientY = e.clientY;
      const r = canvas.getBoundingClientRect();
      pointerTarget = {
        x: (e.clientX - r.left) / Math.max(r.width, 1),
        // Canvas rows run bottom-up in GL space.
        y: 1 - (e.clientY - r.top) / Math.max(r.height, 1),
      };
    };
    const onMove = (e: PointerEvent) => {
      toUv(e);
      pointerSeen = 0;
    };
    const onLeave = () => {
      pointerSeen = 99;
    };
    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onMove, { passive: true });

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
    const opacityFor = (p: number) => {
      // Hand over to the shader's own type exactly as it reaches full strength.
      const t = Math.min(1, Math.max(0, (p - 0.35) / 0.4));
      const still = 1 - t * t * (3 - 2 * t);
      return String(Number(baseOpacity) * still);
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

      const idle = pointerSeen > 0.12;
      const vx = idle ? 0 : (pointer.x - prevX) / Math.max(uiDt, 1e-3);
      const vy = idle ? 0 : (pointer.y - prevY) / Math.max(uiDt, 1e-3);
      // Smooth the drag, so one jittery frame cannot yank the fluid.
      const ke = Math.min(1, uiDt * 9);
      pointerVel.x += (vx - pointerVel.x) * ke;
      pointerVel.y += (vy - pointerVel.y) * ke;

      /*
         Presence. The pool must be dormant until the pointer comes near the
         headline, then arrive quickly and leave slowly — the mercury is viscous,
         so it should sag back rather than switch off.
      */
      /*
         Measured against the headline's own box, not the canvas: the canvas is
         deliberately taller than the line, so a canvas-relative test stayed
         true everywhere on the page and the pool never went dormant.
      */
      const box = target.getBoundingClientRect();
      const padX = box.width * 0.06;
      const padY = box.height * 3.2;
      const nearHero =
        pointerSeen < 3.0 &&
        clientX > box.left - padX &&
        clientX < box.right + padX &&
        clientY > box.top - padY &&
        clientY < box.bottom + box.height * 0.9;
      const want = nearHero ? 1 : 0;
      // Arrive briskly, leave slowly enough that the mercury visibly sags back.
      const rate = want > present ? 1 / 0.7 : 1 / 1.1;
      present += (want > present ? 1 : -1) * Math.min(Math.abs(want - present), uiDt * rate);
      present = Math.max(0, Math.min(1, present));

      if (!vel || !dye || !pressure || !divergence || !curl || !maskTex) return;

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
      const dyeP = P.dye!;

      // 1 — advect velocity by itself
      run(vel[1], advect, () => {
        bind(0, vel![0].tex);
        bind(1, vel![0].tex);
        units(advect, { uVelocity: 0, uSource: 1 });
        gl.uniform2f(advect.loc("uTexel"), 1 / sim.w, 1 / sim.h);
        gl.uniform1f(advect.loc("uDt"), dt);
        gl.uniform1f(advect.loc("uDissipation"), 0.12);
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
        gl.uniform1f(vort.loc("uStrength"), VORTICITY_STRENGTH);
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
        gl.uniform1f(force.loc("uPull"), PULL * present);
        gl.uniform1f(force.loc("uFalloff"), FALLOFF);
        gl.uniform1f(force.loc("uAnchor"), ANCHOR);
        gl.uniform1f(force.loc("uDamp"), DAMP);
      });
      swap();

      // 6 — advect the mercury, then refill from the type
      run(dye[1], advect, () => {
        bind(0, vel![0].tex);
        bind(1, dye![0].tex);
        units(advect, { uVelocity: 0, uSource: 1 });
        gl.uniform2f(advect.loc("uTexel"), 1 / sim.w, 1 / sim.h);
        gl.uniform1f(advect.loc("uDt"), dt);
        gl.uniform1f(advect.loc("uDissipation"), 0.12);
      });
      swapDye();
      run(dye[1], dyeP, () => {
        bind(0, dye![0].tex);
        bind(1, maskTex);
        units(dyeP, { uDye: 0, uMask: 1 });
        gl.uniform1f(dyeP.loc("uDt"), dt);
        gl.uniform1f(dyeP.loc("uInflow"), INFLOW * Math.max(present, 0.25));
        gl.uniform1f(dyeP.loc("uReturn"), RETURN + (1 - present) * 6.0);
        gl.uniform1f(dyeP.loc("uDissip"), DYE_DISSIPATION);
      });
      swapDye();

      /*
         7 — shade. The velocity field is bound as well: the display pass reads
         the type through it, so the letterforms deform with the flow.
      */
      const disp = P.display!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      bindQuad(disp);
      bind(0, dye![0].tex);
      bind(1, maskTex);
      bind(2, vel![0].tex);
      units(disp, { uDye: 0, uMask: 1, uVelocity: 2 });
      gl.uniform2f(disp.loc("uTexel"), 1 / sim.w, 1 / sim.h);
      gl.uniform2f(disp.loc("uMaskTexel"), 1 / maskSize.w, 1 / maskSize.h);
      gl.uniform1f(disp.loc("uTime"), time);
      gl.uniform1f(disp.loc("uStrength"), present);
      gl.uniform1f(disp.loc("uRelief"), RELIEF);
      gl.uniform1f(disp.loc("uTwist"), TWIST * present * TEXT_WARP);
      gl.uniform2f(disp.loc("uPointer"), pointer.x, pointer.y);
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
    const swapDye = () => {
      if (!dye) return;
      const t = dye[0];
      dye[0] = dye[1];
      dye[1] = t;
    };

    // Kick the pool so it is already liquid when the pointer arrives.
    raf = window.requestAnimationFrame(frame);

    return () => {
      alive = false;
      window.cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", resize);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onMove);
      target.style.opacity = "";
      teardownTargets();
      for (const p of Object.values(P)) if (p) gl.deleteProgram(p.prog);
      gl.deleteBuffer(vbo);
    };
  }, []);

  return (
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
  );
}
