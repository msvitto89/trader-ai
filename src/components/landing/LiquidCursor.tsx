"use client";

import { useEffect, useRef } from "react";

/**
 * LiquidCursor — a liquid-glass disc that replaces the pointer.
 *
 * Earlier version sampled a cloned snapshot of the hero for "refraction". That
 * was abandoned: a frozen clone cannot track scroll, so the lens showed ghost
 * text that drifted out of alignment with the page behind it. A lens that lies
 * about what is underneath it looks like a bug, not like glass.
 *
 * The disc is now built from what the compositor can actually sample — the live
 * page through backdrop-filter:
 *   blur + saturate   frosts and lifts what is underneath
 *   warm tint         two radial gradients, warm from one side
 *   rim               conic-gradient ring, masked to a 1px border
 *   specular          a soft highlight where light would catch the bevel
 *   follow            slow damped tracking, so the glass has weight
 *
 * Grow over headings and controls, shrink on press, and fall back to the native
 * cursor on touch and under reduced motion.
 */

const DISC = 118;

export function LiquidCursor() {
  const discRef = useRef<HTMLDivElement | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const disc = discRef.current;
    if (!disc) return;

    // Only replace the pointer when there is a real fine pointer. Testing
    // `hover: none` alone is too blunt: hybrids and some VMs report it while
    // still having a mouse, and the cursor disappeared for them entirely.
    const finePointer = window.matchMedia("(any-pointer: fine)");
    if (!finePointer.matches) return;

    // Reduced motion still gets the glass — it is a pointer, not an effect —
    // but it tracks the pointer 1:1 with no easing and no scaling.
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
        cx += (tx - cx) * 0.2;
        cy += (ty - cy) * 0.2;
        scale += (targetScale - scale) * 0.14;
      }

      disc.style.transform = `translate3d(${(cx - DISC / 2).toFixed(1)}px, ${(cy - DISC / 2).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;

      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${tx - 2}px, ${ty - 2}px, 0)`;
      }

      const settled = still
        ? true
        : Math.abs(tx - cx) < 0.3 &&
          Math.abs(ty - cy) < 0.3 &&
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
      const onHeading = !!target?.closest("h1, h2, h3");
      const onControl = !!target?.closest("a, button, input, select, textarea");
      targetScale = still ? 1 : onHeading ? 1.4 : onControl ? 1.14 : 1;
      disc.dataset.heading = onHeading ? "1" : "0";

      if (!visible) {
        visible = true;
        cx = tx;
        cy = ty;
        disc.style.opacity = "1";
      }
      start();
    };

    const onDown = () => {
      targetScale = 0.88;
      disc.dataset.press = "1";
      start();
    };

    const onUp = () => {
      targetScale = 1;
      disc.dataset.press = "0";
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
        data-heading="0"
        data-press="0"
      >
        <div className="liquid-cursor__glass" />
        <div className="liquid-cursor__rim" />
        <div className="liquid-cursor__specular" />
      </div>

      {/* A true pointer dot, so the pointer never feels lost inside the glass */}
      <div ref={dotRef} className="liquid-cursor__dot" />
    </div>
  );
}
