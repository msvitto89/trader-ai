"use client";

import { useCallback, useEffect, useRef } from "react";
import { armEyeAudio, playBlink, playPop } from "./eye/Sound";

/**
 * HeroEye — a large eye that lives BEHIND the "Read the market" headline.
 *
 * The eye is not a decoration placed above the type. It rises from behind the
 * headline when hovered — that is what the pop and the retracting pop-down are
 * for — and when it settles it hangs just above the type, with the lowest tenth
 * of the artwork empty so the two never touch or smear into each other.
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
       An overlay, not a row.

       Nothing here participates in layout: the box is anchored to the headline's
       top edge, has no height of its own, and the eye is drawn upwards out of it.
       That is deliberate — the eye can then be any size at all without moving the
       headline, the paragraph, the buttons or anything else on the page. Only the
       design decides where those sit (the wrapper's own padding), never the eye.

       `--eye-h` is the artwork's rendered height and `--eye-anchor` the distance
       from the headline's top edge to the top of that box: with the oval running
       0.113…0.827 of the box, a 0.6127 offset leaves exactly 30% of the eye's
       height below the headline's top edge.
    */
    <div
      aria-hidden
      /*
         No `z-index` here on purpose. A z-index would make this box a stacking
         context and trap the trigger beneath the headline (which is z-20), so the
         hover would never fire. Left at `auto`, the trigger (z-30) and the eye
         (z-10) both participate in the wrapper's stacking context and land on the
         right sides of the type: eye behind, trigger in front.
      */
      className="pointer-events-none absolute inset-x-0"
      style={{ top: "var(--eye-zone)" }}
    >
      {/*
         The trigger. It covers the eye's box AND the headline below it, so the
         gesture is "the visitor is looking at the words", not "the pointer is
         within a few pixels of a hidden box".

         A touch pointer is ignored: `pointerenter` fires on the same tap that the
         visitor may be using to scroll or to reach the CTA, and a 1.4s flourish
         per tap would be a defect rather than a delight.
      */}
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-[calc(-1*var(--headline-h))] z-30"
        style={{ top: "var(--eye-anchor)" }}
        onPointerEnter={(e) => {
          if (e.pointerType === "touch") return;
          run();
        }}
      />

      {/*
         A halo, not a decoration. On a page this dark a white object has nothing
         to sit on: it reads as pasted on rather than lit. A wide, very faint ice
         bloom behind the iris gives the eye a source and separates it from the
         black without ever resolving into a visible shape — it lives in the same
         layout-free overlay, so it cannot move anything either.
      */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2"
        style={{
          top: "var(--eye-anchor)",
          width: "calc(1.9 * var(--eye-size))",
          height: "calc(1.9 * var(--eye-size))",
          transform: "translate(-50%, -22%)",
          background:
            "radial-gradient(circle at 50% 46%, rgba(141,220,247,0.16) 0%, rgba(141,220,247,0.07) 34%, rgba(61,143,201,0.03) 56%, transparent 72%)",
        }}
      />

      {/*
         The eye itself: an absolutely positioned box hanging off the headline's
         top edge. Its lower 30% overlaps the type, which is the point — the
         headline is z-20 against this z-10, so the letters paint on top and the
         eye reads as rising from behind them.
      */}
      <div
        ref={eyeRef}
        data-hero-eye
        className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 opacity-0"
        style={{
          top: "var(--eye-anchor)",
          width: "var(--eye-size)",
          willChange: "transform, opacity",
        }}
      >
        {/*
           `--eye-alpha` is the eye's overall strength, kept separate from the
           pop animation's own opacity so the two can be tuned independently: the
           animation needs 0..1 to fade in and out, the design needs the eye dimmer
           than full white while it is up. Multiplying them here rather than
           overriding `style.opacity` leaves the animation honest.
        */}
        <div style={{ opacity: "var(--eye-alpha)" }}>
          <EyeArt irisRef={irisRef} lidRef={lidRef} />
        </div>
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
  /*
     Iris fibres. They are what turns a dark circle into an eye at this size: a
     ring of very low-opacity strokes radiating out of the pupil, longer at the
     sides than at the top, broken up so no two neighbours match. Generated once
     from a fixed seed rather than hand-written, so the angles stay tidy.
  */
  const fibres = Array.from({ length: 44 }, (_, i) => {
    const a = (i / 44) * Math.PI * 2;
    const wobble = Math.sin(i * 12.9898) * 0.5 + 0.5; // deterministic 0..1
    const r1 = 15 + wobble * 4;
    const r2 = 30 + wobble * 9;
    return {
      x1: 160 + Math.cos(a) * r1,
      y1: 140 + Math.sin(a) * r1,
      x2: 160 + Math.cos(a) * r2,
      y2: 140 + Math.sin(a) * r2,
      o: 0.10 + wobble * 0.16,
    };
  });

  return (
    <svg viewBox="0 0 320 300" fill="none" aria-hidden className="block w-full">
      <defs>
        {/*
           The fade-out, and the reason the last version looked cheap: an alpha
           ramp that reaches zero in two stops draws its own edge. A band of
           constant falloff reads as a straight horizontal line across the eye no
           matter how soft the numbers are.

           So the falloff is a curve with twelve stops and a long, thin tail. The
           eye is at full strength through its upper two thirds, then loses opacity
           the way light falls off — quickly at first, then almost imperceptibly —
           and is mathematically zero from 70% down, which is the band that sits
           behind the headline.
        */}
        <linearGradient
          id="eyeFade"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="34"
          x2="0"
          y2="248"
        >
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.26" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.36" stopColor="#fff" stopOpacity="0.99" />
          <stop offset="0.44" stopColor="#fff" stopOpacity="0.96" />
          <stop offset="0.50" stopColor="#fff" stopOpacity="0.90" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.81" />
          <stop offset="0.59" stopColor="#fff" stopOpacity="0.69" />
          <stop offset="0.63" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.66" stopColor="#fff" stopOpacity="0.40" />
          <stop offset="0.685" stopColor="#fff" stopOpacity="0.26" />
          <stop offset="0.70" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="0.71" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="0.72" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>

        {/*
           The foot of the eye needs a fade that follows the SHAPE, not a
           horizontal band. A straight ramp multiplied over a curved silhouette
           always leaves the same tell: a level line where the alpha hits zero,
           crossing the flank and meeting the outline in a soft right-angle. The
           fix is a second, radial falloff centred on the eye itself, so the alpha
           contours curve with the body and the dissolve reads as depth instead of
           as a ruler line. Both masks multiply, which is exactly what is wanted.
        */}
        <radialGradient
          id="eyeVignette"
          gradientUnits="userSpaceOnUse"
          cx="160"
          cy="128"
          r="132"
        >
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.62" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.82" stopColor="#fff" stopOpacity="0.92" />
          <stop offset="0.93" stopColor="#fff" stopOpacity="0.62" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.18" />
        </radialGradient>

        {/* The lit surface: ice at the crown, white through the middle. */}
        <linearGradient id="eyeBody" x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0" stopColor="#F7FCFF" />
          <stop offset="0.34" stopColor="#FFFFFF" />
          <stop offset="0.72" stopColor="#EAF6FD" />
          <stop offset="1" stopColor="#C9E0EE" />
        </linearGradient>

        {/* A rim of light along the top edge — the single strongest "lit object" cue. */}
        <linearGradient id="eyeRim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#CFEAF9" stopOpacity="0.25" />
          <stop offset="1" stopColor="#CFEAF9" stopOpacity="0" />
        </linearGradient>

        {/* Shadow pooling where the eyeball meets the lid, to give the sphere volume. */}
        <radialGradient id="eyeShade" cx="0.5" cy="0.34" r="0.62">
          <stop offset="0.45" stopColor="#0B1216" stopOpacity="0" />
          <stop offset="0.86" stopColor="#0B1216" stopOpacity="0.16" />
          <stop offset="1" stopColor="#0B1216" stopOpacity="0.30" />
        </radialGradient>

        <radialGradient id="irisDepth" cx="0.42" cy="0.34" r="0.78">
          <stop offset="0" stopColor="#33424E" />
          <stop offset="0.48" stopColor="#141B21" />
          <stop offset="0.86" stopColor="#070A0C" />
          <stop offset="1" stopColor="#020405" />
        </radialGradient>

        <radialGradient id="pupilFill" cx="0.5" cy="0.42" r="0.72">
          <stop offset="0" stopColor="#0A0F13" />
          <stop offset="1" stopColor="#000000" />
        </radialGradient>

        <radialGradient id="irisLight" cx="0.36" cy="0.28" r="0.6">
          <stop offset="0" stopColor="#8FD8F7" stopOpacity="0.34" />
          <stop offset="0.7" stopColor="#8DDCF7" stopOpacity="0.05" />
          <stop offset="1" stopColor="#8DDCF7" stopOpacity="0" />
        </radialGradient>

        {/* The soft contact shadow under the iris, so it sits ON the sclera. */}
        <radialGradient id="irisShadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.72" stopColor="#0B1216" stopOpacity="0.34" />
          <stop offset="1" stopColor="#0B1216" stopOpacity="0" />
        </radialGradient>

        <clipPath id="eyeClip">
          <path d="M 40 140 C 110 34 210 34 280 140 C 210 246 110 246 40 140 Z" />
        </clipPath>

        <mask
          id="eyeMask"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="320"
          height="300"
        >
          <rect x="0" y="0" width="320" height="300" fill="url(#eyeFade)" />
          <rect
            x="0"
            y="0"
            width="320"
            height="300"
            fill="url(#eyeVignette)"
            style={{ mixBlendMode: "multiply" }}
          />
        </mask>

        {/*
           A whisper of blur, and no more. At 350px a mathematically crisp path
           reads as a sticker, but too much blur does something worse: it smears
           ink past the silhouette, and once that ink meets the alpha ramp at the
           foot it looks like fog rather than an eye receding into the dark. Half a
           pixel is enough to take the vector edge off and not enough to smear.
        */}
        <filter id="eyeSoft" x="-6%" y="-6%" width="112%" height="112%">
          <feGaussianBlur stdDeviation="0.55" />
        </filter>
      </defs>

      <g mask="url(#eyeMask)">
        <g
          ref={lidRef}
          data-eye-lid
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          {/* Body, softly edged. */}
          <g filter="url(#eyeSoft)">
            <path
              d="M 40 140 C 110 34 210 34 280 140 C 210 246 110 246 40 140 Z"
              fill="url(#eyeBody)"
            />
          </g>

          <g clipPath="url(#eyeClip)">
            {/* Volume: shadow gathering toward the lid. */}
            <path
              d="M 40 140 C 110 34 210 34 280 140 C 210 246 110 246 40 140 Z"
              fill="url(#eyeShade)"
            />
            {/* Rim light along the crown. */}
            <path
              d="M 62 128 C 118 46 202 46 258 128"
              stroke="url(#eyeRim)"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />

            {/* Iris. */}
            <g
              ref={irisRef}
              data-eye-iris
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            >
              <circle cx="160" cy="140" r="56" fill="url(#irisShadow)" />
              <circle cx="160" cy="140" r="46" fill="url(#irisDepth)" />
              {/* Limbal ring: a darker edge, which is what makes an iris read round. */}
              <circle
                cx="160"
                cy="140"
                r="45.4"
                fill="none"
                stroke="#05090B"
                strokeOpacity="0.85"
                strokeWidth="2.2"
              />
              {/* Fibres. */}
              <g stroke="#9FC9DA" strokeWidth="0.9" strokeLinecap="round">
                {fibres.map((f, i) => (
                  <line
                    key={i}
                    x1={f.x1}
                    y1={f.y1}
                    x2={f.x2}
                    y2={f.y2}
                    strokeOpacity={f.o}
                  />
                ))}
              </g>
              {/* A cool wash across the upper iris. */}
              <circle cx="160" cy="140" r="45" fill="url(#irisLight)" />
              {/* Pupil. */}
              <circle cx="160" cy="140" r="19" fill="url(#pupilFill)" />
              <circle
                cx="160"
                cy="140"
                r="19"
                fill="none"
                stroke="#000"
                strokeOpacity="0.5"
                strokeWidth="1.4"
              />
              {/* Two catchlights: one broad and soft, one sharp. The pair is what
                  makes the eye look wet rather than painted. */}
              <circle cx="145" cy="123" r="11.5" fill="#fff" fillOpacity="0.95" />
              <circle cx="145" cy="123" r="19" fill="#fff" fillOpacity="0.10" />
              <circle cx="176" cy="158" r="4.2" fill="#fff" fillOpacity="0.5" />
            </g>

            {/* The lid's shadow falling across the top of the iris. */}
            <path
              d="M 40 140 C 110 34 210 34 280 140 C 250 92 200 74 160 74 C 120 74 70 92 40 140 Z"
              fill="#0B1216"
              fillOpacity="0.10"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
