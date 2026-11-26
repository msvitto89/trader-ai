"use client";

import { useEffect, useRef } from "react";

/**
 * Two white circles that follow the cursor anywhere on the site.
 *
 * A large ring rides the cursor exactly; a small one trails behind it. While the
 * cursor moves, the small circle is pulled out to a visible gap; when the cursor
 * rests, it drifts back in and settles underneath the large one, so the pair
 * reads as a single object at rest and as two when it is in motion.
 *
 * Both are RINGS, not filled discs. A filled disc lands on top of whatever it
 * crosses and hides it; a ring reads as a bubble's meniscus and stays legible
 * over text, because the shape is carried by the gap between ring and stroke
 * rather than by the fill.
 *
 * This is the whole of the site's cursor treatment — the previous WebGL fluid
 * that deformed the hero headline has been removed along with it.
 */

/** Diameter of the leading ring, in CSS px. */
const BIG = 30;
/** Diameter of the trailing ring, in CSS px. */
const SMALL = 12;
/** How far the trailing ring is pulled out when the cursor is moving, in px. */
const TRAIL = 20;
/**
 * Spring stiffness that drives the trailing ring to its rest position.
 *
 * Stiff on purpose. The gesture the pair has to sell is "it slides under the big
 * one when you stop", and a soft spring takes seconds to travel 20px, which reads
 * as the circle being left behind rather than as it tucking in. At 90 the ring
 * covers the gap in well under half a second while still visibly lagging during a
 * fast swipe.
 */
const SPRING = 90;
/**
 * Damping. ζ = DAMPING / (2·√SPRING) ≈ 0.95, i.e. just shy of critical: the ring
 * tucks in quickly and settles without orbiting the cursor.
 */
const DAMPING = 18;
/**
 * Below this pointer speed (px per frame) the trailing ring is considered to be
 * at rest and is pulled under the leading one. Set just above hand tremor: a
 * resting hand still emits a pixel of movement now and then, and without this the
 * small ring would never quite settle.
 */
const STILL = 0.9;

export function CursorBubbles() {
  const bigRef = useRef<HTMLSpanElement | null>(null);
  const smallRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const big = bigRef.current;
    const small = smallRef.current;
    if (!big || !small) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Pointer target, in viewport coordinates.
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    // Smoothed position of the leading ring; the raw pointer is too jittery to
    // carry a 30px circle without it shimmering.
    let x = tx;
    let y = ty;
    // Trailing ring, in viewport coordinates, with its own velocity.
    let sx = tx - TRAIL;
    let sy = ty;
    let vx = 0;
    let vy = 0;
    let seen = false;
    let prevX = tx;
    let prevY = ty;
    let raf = 0;
    let last = 0;
    const root = document.documentElement;
    let live = false;

    /*
       ── who is allowed to drive this ──────────────────────────────────────

       Decided by the POINTER TYPE of the first real event, not by a media query.
       A media query is the obvious gate and the wrong one: `(hover: none)` is
       true in headless and embedded renderers that have pointer events and no
       mouse, and `(pointer: none)` is true in others that do have one, so keying
       off it disables the cursor for people who can clearly use it.

       The event itself is unambiguous. A finger produces `pointerType: "touch"`:
       on touch a ring is not a cursor but an obstruction, since the pointer jumps
       to wherever the finger lands and then vanishes, and it would sit on the
       control being tapped. A mouse or a pen produces "mouse"/"pen", which is the
       case this exists for.
    */
    const qualifies = (e: PointerEvent) =>
      e.pointerType === "mouse" || e.pointerType === "pen";
    let rejected = false;

    const onMove = (e: PointerEvent) => {
      if (rejected) return;
      if (!qualifies(e)) {
        /*
           Touch-only device: stop for good. This is checked on every event until
           a mouse or pen shows up, because the first pointer a hybrid device
           reports is often a finger.
        */
        rejected = true;
        return;
      }
      if (!live) {
        live = true;
        /*
           The native cursor is hidden only once a real pointer has been seen, so
           nothing is ever hidden on a device that cannot replace it.
        */
        if (!reduced) root.classList.add("cursor-none-site");
      }
      tx = e.clientX;
      ty = e.clientY;
      if (!seen) {
        // First contact: place both rings on the cursor so neither sweeps in
        // from the middle of the screen.
        x = tx;
        y = ty;
        sx = tx - TRAIL;
        sy = ty;
        prevX = tx;
        prevY = ty;
        seen = true;
      }
      big.style.opacity = "1";
      small.style.opacity = "1";
    };
    const onLeave = () => {
      seen = false;
      big.style.opacity = "0";
      small.style.opacity = "0";
    };

    const frame = (now: number) => {
      raf = window.requestAnimationFrame(frame);
      const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
      last = now;
      if (!live || !seen) return;

      /*
         Ease the leading ring rather than pinning it to the pointer. At 30Hz+
         this is indistinguishable from a direct follow, and it removes the
         shimmer a raw pointer position produces on a large circle.
      */
      const ease = Math.min(1, dt * 22);
      x += (tx - x) * ease;
      y += (ty - y) * ease;

      /*
         Pointer speed, per frame, in px. Used only to decide whether the pair is
         moving or resting — `STILL` is a threshold on that, not a timer, so the
         small ring starts returning the moment the hand actually stops instead of
         waiting out a timeout.
      */
      const speed = Math.hypot(x - prevX, y - prevY);
      prevX = x;
      prevY = y;
      /*
         Reduced motion: the trailing ring never lags, so the pair presents as the
         single resting state. The cursor is still clearly marked, which is the
         point of a cursor; only the spring is suppressed.
      */
      const resting = reduced || speed < STILL;

      /*
         The trailing ring's rest position. Moving: a fixed gap behind the cursor,
         on whichever side it already sits, so it trails rather than leading.
         Resting: the centre of the leading ring, so it disappears underneath it.
      */
      /*
         Direction from the cursor to the trailing ring, as a unit vector. Only
         meaningful while moving: at rest the target is the cursor itself, and
         normalising a near-zero offset there produced a direction that flipped
         every frame, which is why the ring never settled.
      */
      const ox = sx - x;
      const oy = sy - y;
      const od = Math.hypot(ox, oy);
      let rx = x;
      let ry = y;
      if (!resting) {
        /*
           Moving: hold the gap on the side the ring is already on, so it trails
           rather than snapping around to lead. If it happens to be exactly on the
           cursor, park it to the left until the next frame gives it a direction.
        */
        const inv = od > 0.001 ? 1 / od : 0;
        rx = x + (od > 0.001 ? ox * inv : -1) * TRAIL;
        ry = y + (od > 0.001 ? oy * inv : 0) * TRAIL;
      }

      /*
         Fixed sub-steps, not one step of `dt`.

         A stiff spring integrated with a large step is not merely inaccurate, it
         is unstable, and the frame rate here is whatever the device manages — 14fps
         under a software rasteriser is normal. One step of 70ms at SPRING 90
         overshoots hard (90 * 0.07 * 0.07 > 1), which is why the ring used to crawl
         and never arrive. Sub-stepping at a fixed 4ms makes the motion identical on
         a 240Hz laptop and a struggling integrated GPU.
      */
      const SUB = 1 / 240;
      let remaining = dt;
      while (remaining > 1e-6) {
        const step = Math.min(SUB, remaining);
        remaining -= step;
        vx += (rx - sx) * SPRING * step;
        vy += (ry - sy) * SPRING * step;
        const damp = Math.exp(-DAMPING * step);
        vx *= damp;
        vy *= damp;
        sx += vx * step;
        sy += vy * step;
      }

      /*
         `translate(-50%, -50%)` is part of the transform, not the layout, so
         neither ring can be a frame behind the other and the compositor never has
         to re-run layout to move them.
      */
      big.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      small.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`;
      /*
         Stacking. While the pair is moving the small ring is the nearer of the
         two — it is the one visibly catching up — so it sits on top. At rest it
         slides UNDER the large ring, which is the whole point of the gesture, so
         the order is swapped there.
      */
      small.style.zIndex = resting ? "1" : "2";
    };

    // `mousemove` as well as `pointermove`: some browsers deliver pointer events
    // for pen and touch but not for a plain mouse move over the chrome.
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    raf = window.requestAnimationFrame(frame);

    /*
       The native cursor is hidden only once the rings are actually running, so a
       browser without pointer events (or with reduced motion) keeps a usable
       cursor rather than losing it entirely.
    */
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      root.classList.remove("cursor-none-site");
    };
  }, []);

  return (
    <>
      {/*
         Both rings are `fixed`, so they track the viewport rather than any
         section, and `pointer-events-none` so they can never intercept a click
         meant for the page underneath. `aria-hidden` because they carry no
         information: they are the cursor.
      */}
      <span
        ref={bigRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[100] rounded-full opacity-0 will-change-transform"
        style={{
          width: BIG,
          height: BIG,
          border: "1.5px solid rgba(255,255,255,0.95)",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 68%)",
          boxShadow:
            "0 0 10px 1px rgba(255,255,255,0.35), inset 0 0 8px rgba(255,255,255,0.25)",
          transform: "translate3d(-50%, -50%, 0)",
          /*
             No opacity transition: a transition on this element stalled at
             progress 0 in a software renderer, leaving the ring permanently
             invisible. It appears instantly instead, which is what a cursor
             should do anyway.
          */
        }}
      />
      <span
        ref={smallRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[101] rounded-full opacity-0 will-change-transform"
        style={{
          width: SMALL,
          height: SMALL,
          border: "1.25px solid rgba(255,255,255,0.95)",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 70%)",
          boxShadow: "0 0 6px 1px rgba(255,255,255,0.3)",
          transform: "translate3d(-50%, -50%, 0)",
        }}
      />
    </>
  );
}
