"use client";

import { useEffect, useRef } from "react";

/**
 * LiquidCursor — a small ring that replaces the pointer on the landing page.
 *
 * Deliberately plain: no blur, no refraction, no specular. A 40px disc with a
 * grey wash and a 1px white border at 40%. Anything heavier competes with the
 * page and reads as decoration rather than as a pointer.
 *
 * Behaviour is limited to what a cursor owes you: it follows, it lifts slightly
 * over a link so interactive targets are legible, and it shrinks on press. The
 * follow is damped by a small factor — enough to feel weighted, not enough to
 * lag behind the real pointer.
 */

const DISC = 20; // diameter: radius 10px

export function LiquidCursor() {
  const discRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const disc = discRef.current;
    if (!disc) return;

    // Only replace the pointer when there is a real fine pointer.
    const finePointer = window.matchMedia("(any-pointer: fine)");
    if (!finePointer.matches) return;

    // Reduced motion still gets the cursor — it is a pointer, not an effect —
    // but it tracks 1:1 with no easing and no scaling.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let cx = -999;
    let cy = -999;
    let tx = -999;
    let ty = -999;
    let scale = 1;
    let targetScale = 1;
    let visible = false;

    const tick = () => {
      raf = 0;
      if (still) {
        cx = tx;
        cy = ty;
        scale = 1;
      } else {
        // A gentle follow: the disc trails the pointer by a few pixels.
        cx += (tx - cx) * 0.24;
        cy += (ty - cy) * 0.24;
        scale += (targetScale - scale) * 0.16;
      }

      disc.style.transform = `translate3d(${(cx - DISC / 2).toFixed(1)}px, ${(cy - DISC / 2).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;

      const settled = still
        ? true
        : Math.abs(tx - cx) < 0.25 &&
          Math.abs(ty - cy) < 0.25 &&
          Math.abs(targetScale - scale) < 0.003;
      if (!settled) raf = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (!raf) raf = window.requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      tx = event.clientX;
      ty = event.clientY;

      const target = event.target as HTMLElement | null;
      const onControl = !!target?.closest("a, button, input, select, textarea");
      // A small lift on interactive targets, nothing more.
      targetScale = still ? 1 : onControl ? 1.35 : 1;

      if (!visible) {
        visible = true;
        cx = tx;
        cy = ty;
        disc.style.opacity = "1";
      }
      start();
    };

    const onDown = () => {
      targetScale = still ? 1 : 0.8;
      start();
    };

    const onUp = () => {
      targetScale = 1;
      start();
    };

    const onLeave = () => {
      visible = false;
      disc.style.opacity = "0";
    };

    const onPointerCapabilityChange = () => {
      if (!finePointer.matches) onLeave();
    };

    finePointer.addEventListener?.("change", onPointerCapabilityChange);
    document.documentElement.classList.add("has-liquid-cursor");
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);

    return () => {
      finePointer.removeEventListener?.("change", onPointerCapabilityChange);
      document.documentElement.classList.remove("has-liquid-cursor");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[200]">
      <div
        ref={discRef}
        className="liquid-cursor"
        style={{ width: DISC, height: DISC, opacity: 0 }}
      />
    </div>
  );
}
