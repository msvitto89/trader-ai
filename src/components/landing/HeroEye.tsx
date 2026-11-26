"use client";

import { useCallback, useEffect, useRef } from "react";
import { armEyeAudio, playBlink, playPop } from "./eye/Sound";

/**
 * HeroEye — a large eye that lives BEHIND the "Read the market" headline.
 *
 * The eye is not a decoration placed above the type. Its lower portion extends
 * behind the headline and dissolves into the page through a vertical alpha
 * gradient, so the pair reads as one object emerging from behind the typography
 * rather than as a sticker above a heading.
 *
 * ── why the fade is an alpha mask, not a clipped box ────────────────────────
 * A rectangular clip leaves a visible horizontal edge, and on a black page a hard
 * edge is exactly the "cut-out" look to avoid. The eye is drawn in a standalone
 * SVG and masked with a linear gradient over its own coordinates, so the alpha
 * falloff is smooth and independent of the element's box — no straight line can
 * ever appear, at any size.
 *
 * ── layering ────────────────────────────────────────────────────────────────
 * The eye renders at z-10 and the headline at z-20, inside the same wrapper, so
 * the type genuinely sits in front of the eye rather than the eye being pasted
 * on top with a fake gradient. The headline is untouched: white, static, legible.
 */

/** Phase durations in ms. Total ≈ 1.38s, inside the 1.2–1.8s brief. */
const T = {
  popUp: 320,
  look: 300,
  blink: 215,
  popDown: 320,
} as const;

/** Iris travel as a fraction of the eye's width. */
const LOOK = 0.075;

export function HeroEye() {
  const eyeRef = useRef<HTMLDivElement | null>(null);
  const irisRef = useRef<SVGGElement | null>(null);
  const lidRef = useRef<SVGGElement | null>(null);
  const timers = useRef<number[]>([]);
  const busy = useRef(false);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const at = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /*
     The iris is moved with a CSS transform on the <g> rather than through the SVG
     `transform` attribute, because the attribute is not animatable without
     requestAnimationFrame bookkeeping and the browser's own interpolation with
     a spring easing is better than anything hand-rolled here.
  */
  const look = useCallback((dx: number, ms: number) => {
    const iris = irisRef.current;
    if (!iris) return;
    iris.style.transition = ms
      ? `transform ${ms}ms cubic-bezier(0.34, 1.36, 0.64, 1)`
      : "none";
    iris.style.transform = `translateX(${dx}px)`;
  }, []);

  /*
     The blink, as a vertical squash of the whole eye.

     Every other approach was worse. Animating the lid path's `d` is not smoothly
     interpolatable across browsers, and covering the eye with a shape means
     deciding the eyelid's colour — which is wrong here, because the eye sits on a
     partially transparent gradient, so a "closed lid" rectangle would be visible
     as a block.

     Scaling the group is what an eyelid actually does to the shape it covers: the
     aperture closes to a line and reopens. It is a transform, so it is composited,
     and the close is deliberately faster than the open — that asymmetry is what
     makes it read as a blink instead of a squash.
  */
  const blink = useCallback(() => {
    const lid = lidRef.current;
    if (!lid) return;
    /*
       The close gets 45% of the budget and the open 55%, and the whole thing is
       215ms — inside the 150–220ms the brief allows. That split matters: a blink
       whose close is a single frame does not read as a blink at all, it reads as a
       flicker, and 100ms of closing is roughly what a real eyelid takes.
    */
    lid.style.transition = `transform ${T.blink * 0.45}ms cubic-bezier(0.45, 0, 0.75, 1)`;
    lid.style.transform = "scaleY(0.03)";
    window.setTimeout(() => {
      lid.style.transition = `transform ${T.blink * 0.55}ms cubic-bezier(0.22, 1, 0.35, 1)`;
      lid.style.transform = "scaleY(1)";
    }, T.blink * 0.45);
  }, []);

  const run = useCallback(() => {
    if (busy.current) return;
    const eye = eyeRef.current;
    if (!eye) return;
    busy.current = true;
    clear();

    /*
       Hidden state: dropped back behind the type and dimmed. Dimmed rather than
       fully transparent, because the point is that it goes behind the headline,
       not that it switches off — and because the headline has gaps between the
       letters, a bright eye sitting exactly there would read as being in front.
    */
    eye.style.transition = "none";
    eye.style.transform = "translate3d(0, 62%, 0) scale(0.94)";
    eye.style.opacity = "0.28";
    look(0, 0);

    // 1 — POP UP, from behind the headline, with a small overshoot.
    at(20, () => {
      eye.style.transition = `transform ${T.popUp}ms cubic-bezier(0.34, 1.5, 0.64, 1), opacity ${T.popUp}ms ease-out`;
      eye.style.transform = "translate3d(0, 0, 0) scale(1)";
      eye.style.opacity = "1";
      playPop();
    });

    // 2 — LOOK LEFT, then 3 — LOOK RIGHT.
    const lookAt = T.popUp + 40;
    at(lookAt, () => look(-LOOK * 100, T.look));
    at(lookAt + T.look + 20, () => look(LOOK * 100, T.look));

    // 4 — BLINK, once.
    const blinkAt = lookAt + T.look * 2 + 60;
    at(blinkAt, () => {
      blink();
      playBlink();
    });

    // 5 — POP DOWN, back behind the headline.
    const downAt = blinkAt + T.blink + 90;
    at(downAt, () => {
      eye.style.transition = `transform ${T.popDown}ms cubic-bezier(0.5, 0, 0.75, 0.5), opacity ${T.popDown}ms ease-in`;
      eye.style.transform = "translate3d(0, 62%, 0) scale(0.94)";
      eye.style.opacity = "0";
    });

    at(downAt + T.popDown + 60, () => {
      busy.current = false;
    });
  }, [blink, look]);

  useEffect(() => {
    const disarm = armEyeAudio();
    return () => {
      disarm();
      clear();
    };
  }, []);

  return (
    /*
       The eye's own zone.

       It reserves the vertical space the eye needs and nothing else does: the
       headline sits below this box, so the box's height is exactly the room the
       eye has to grow into, and the reserved space keeps the headline from moving
       when the eye pops. `bottom` places the eye so its lower portion hangs past
       the box's foot and behind the first line of type.
    */
    <div
      aria-hidden
      className="relative w-full"
      style={{ height: "var(--eye-zone)" }}
    >
      {/*
         The trigger. It covers the eye zone AND the headline below it, so the
         gesture is "the visitor is looking at the words", not "the pointer is
         within a few pixels of a hidden box".

         A touch pointer is ignored: `pointerenter` fires on the same tap that the
         visitor may be using to scroll or to reach the CTA, and a 1.4s flourish
         per tap would be a defect rather than a delight.
      */}
      <div
        className="absolute inset-x-0 -bottom-[var(--headline-h)] top-0 z-30"
        onPointerEnter={(e) => {
          if (e.pointerType === "touch") return;
          run();
        }}
      />

      {/*
         The eye, behind the type. Anchored to the bottom of its zone and allowed
         to hang below it, so the lower part of the eye is genuinely underneath the
         headline rather than stopping short of it.
      */}
      <div
        ref={eyeRef}
        data-hero-eye
        className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 opacity-0"
        style={{
          bottom: "calc(-0.20 * var(--eye-size))",
          width: "var(--eye-size)",
          willChange: "transform, opacity",
        }}
      >
        <EyeArt irisRef={irisRef} lidRef={lidRef} />
      </div>
    </div>
  );
}

/**
 * The eye artwork, kept separate so the animation component stays about timing.
 *
 * Restrained on purpose: a body, an iris with one highlight, and the lid. Nothing
 * else — at this size every extra detail reads as cartoon.
 */
function EyeArt({
  irisRef,
  lidRef,
}: {
  irisRef: React.Ref<SVGGElement>;
  lidRef: React.Ref<SVGGElement>;
}) {
  return (
    <svg viewBox="0 0 320 300" fill="none" aria-hidden className="block w-full">
      <defs>
        {/*
           The vertical alpha ramp. Offsets are placed against the OVAL's own
           extent (y ≈ 34..246 of 300), not the viewBox, so these numbers mean what
           the design asks for: a bright upper body dissolving to 10% at the lowest
           edge, with no straight line anywhere.

           Weighted heavy through the middle on purpose: a straight 90→10 line
           makes the whole eye look like a ghost, whereas holding the core bright
           and dissolving only the last third makes it look solid AND buried.
        */}
        <linearGradient id="eyeFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.92" />
          <stop offset="0.30" stopColor="#fff" stopOpacity="0.90" />
          <stop offset="0.52" stopColor="#fff" stopOpacity="0.76" />
          <stop offset="0.70" stopColor="#fff" stopOpacity="0.52" />
          <stop offset="0.85" stopColor="#fff" stopOpacity="0.27" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.10" />
        </linearGradient>
        {/*
           A faint ice tint at the top and a cooler foot. Pure #FFF at these alphas
           reads flat; the two-degree gradient is what makes it feel like a lit
           surface rather than a grey shape.
        */}
        <linearGradient id="eyeBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2FAFF" />
          <stop offset="0.5" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#CFE4F0" />
        </linearGradient>
        <mask
          id="eyeMask"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="320"
          height="300"
        >
          <rect x="0" y="0" width="320" height="300" fill="url(#eyeFade)" />
        </mask>
      </defs>

      <g mask="url(#eyeMask)">
        {/*
           The blinking group. Anything inside squashes together, which is the
           blink: the aperture closes to a line and reopens, and the iris flattening
           with the lid is exactly right.
        */}
        <g
          ref={lidRef}
          data-eye-lid
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          <path
            d="M 40 140 C 110 34 210 34 280 140 C 210 246 110 246 40 140 Z"
            fill="url(#eyeBody)"
          />
          {/*
             The iris. A dark disc on a white body is the whole character of the
             eye, so it is the only element with any detail: an outer disc, a
             slightly lifted inner one for depth, and a single off-centre
             highlight — the one cue that reads as "alive".
          */}
          <g
            ref={irisRef}
            data-eye-iris
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          >
            <circle cx="160" cy="140" r="45" fill="#07090A" />
            <circle cx="160" cy="140" r="27" fill="#141A1F" />
            <circle cx="147" cy="126" r="9" fill="#fff" fillOpacity="0.9" />
          </g>
        </g>
      </g>
    </svg>
  );
}
