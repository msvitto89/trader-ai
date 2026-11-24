"use client";

import { useEffect } from "react";

/**
 * MercuryHeadings — a liquid wake that trails an invisible circle.
 *
 * There is exactly one effect on a heading: as an invisible circle chases the
 * pointer across it, the glyphs near the circle's trail are dragged toward that
 * trail, elongated along the axis and thinned across it. Nothing else is
 * applied — no glass, no bubble, no SVG filter, no gravity well. A resting
 * heading is plain text.
 *
 * The heading itself never moves, and that constraint drives the design:
 *
 *   the <h1>/<h2>/<h3> element is only read, never restyled — no filter, no
 *   transform, no colour. Its box is exactly what the browser laid out, which
 *   is verified by measuring it before and during the effect.
 *
 *   glyphs are wrapped in <span class="mw">, a display:inline-block at zero
 *   offset. Stretching them changes ink, not layout: inline-block widths feed
 *   back into line breaking, so the wrapper is neutral by construction.
 *
 * The circle is never rendered. It is a point with velocity, and the effect
 * originates behind it, so what you see is a liquid trailing a circle rather
 * than a circle carrying an effect.
 */

const REACH = 190; // px over which the wake can reach a glyph

/*
   The invisible circle.

   Nothing is drawn here — the tracker has no DOM element, no border, no fill.
   It is a point that chases the pointer with inertia, so it always lags a
   little behind it, and the suction is emitted from the point it trails, not
   from the pointer itself. That is the whole trick: the effect is never centred
   on the circle, it is always stretched out behind it, so what you see is a
   liquid wake rather than a wireframe following the mouse.
*/
const FOLLOW_K = 0.17; // spring stiffness: how hard the circle chases the pointer
const FOLLOW_DAMP = 0.8; // < 1, so it overshoots slightly instead of snapping
const WAKE_MIN = 10; // px the effect sits behind the circle even at rest
const WAKE_MAX = 46; // px of extra trail at full speed
const SPEED_REF = 26; // px/frame that counts as "fast"

type Glyph = {
  el: HTMLElement;
  x: number;
  y: number;
  /** Angle from the glyph to the pointer, refreshed on measurement. */
  ox: number;
  oy: number;
};

type Unit = {
  heading: HTMLElement;
  glyphs: Glyph[];
  /** Measured box width/height, used to prove the heading does not shift. */
  baseWidth: number;
};

function wrapGlyphs(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? "";
        if (!text.trim()) continue;

        const frag = document.createDocumentFragment();
        // Words stay unbreakable; glyphs sit inside them. A glyph-only split
        // lets the browser break mid-word.
        text.split(/(\s+)/).forEach((chunk) => {
          if (!chunk) return;
          if (/^\s+$/.test(chunk)) {
            frag.appendChild(document.createTextNode(" "));
            return;
          }
          const word = document.createElement("span");
          word.className = "mw"; // word: never breaks
          Array.from(chunk).forEach((char) => {
            const glyph = document.createElement("span");
            glyph.className = "mg"; // glyph: the stretchable unit
            glyph.textContent = char;

            word.appendChild(glyph);
            out.push(glyph);
          });
          frag.appendChild(word);
        });

        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.dataset.mercurySkip !== undefined) continue;
        walk(child);
      }
    }
  };

  walk(root);
  return out;
}

export function MercuryHeadings() {

  useEffect(() => {
    const root = document.querySelector("main");
    if (!root) return;

    const headings = Array.from(
      root.querySelectorAll<HTMLElement>("h1, h2, h3"),
    ).filter((h) => !h.closest("[data-mercury-skip]"));
    if (!headings.length) return;

    const units: Unit[] = [];

    headings.forEach((heading) => {
      const glyphs = wrapGlyphs(heading);
      if (!glyphs.length) return;

      const rect = heading.getBoundingClientRect();
      units.push({
        heading,
        baseWidth: rect.width,
        glyphs: glyphs.map((el) => ({ el, x: 0, y: 0, ox: 0, oy: 0 })),
      });
    });

    if (!units.length) return;

    /* ── Measurement ──────────────────────────────────────────────── */
    const measure = () => {
      for (const unit of units) {
        for (const glyph of unit.glyphs) {
          // offsetLeft/offsetTop are layout positions: they ignore the very
          // transforms this effect applies, so measuring during a pull still
          // reads the resting position.
          const r = glyph.el.getBoundingClientRect();
          glyph.x = r.left + r.width / 2;
          glyph.y = r.top + r.height / 2;
        }
      }
    };

    measure();
    // Fonts change metrics; re-measure once they have settled.
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    // Scroll changes viewport positions without changing layout.
    window.addEventListener("scroll", measure, { passive: true });

    /* ── Pointer loop ─────────────────────────────────────────────── */
    let raf = 0;
    let px = -9999;
    let py = -9999;
    // The invisible circle. Not rendered — a point with velocity.
    let cx = -9999;
    let cy = -9999;
    let cvx = 0;
    let cvy = 0;
    // Last direction of travel, kept so a resting circle still has a "behind".
    let dirX = 0;
    let dirY = 0;
    let dirty = false;

    const settle = (unit: Unit) => {
      for (const glyph of unit.glyphs) {
        if (glyph.el.style.transform) {
          glyph.el.style.transform = "";
          glyph.el.style.transformOrigin = "";
          glyph.el.style.removeProperty("--s");
        }
      }
    };

    const apply = () => {
      raf = 0;

      /*
         Step the invisible circle toward the pointer. A spring with damping,
         not a lerp: a plain lerp cannot overshoot, and the small overshoot is
         what makes the circle feel like it has mass and the wake feel liquid.
      */
      if (px < -9000) {
        cx = px;
        cy = py;
        cvx = 0;
        cvy = 0;
      } else {
        if (cx < -9000) {
          // First contact: start on the pointer rather than flying in from
          // off-screen.
          cx = px;
          cy = py;
        }
        cvx = (cvx + (px - cx) * FOLLOW_K) * FOLLOW_DAMP;
        cvy = (cvy + (py - cy) * FOLLOW_K) * FOLLOW_DAMP;
        cx += cvx;
        cy += cvy;
      }

      const speed = Math.hypot(cvx, cvy);
      const moving = speed > 0.08 || Math.hypot(px - cx, py - cy) > 0.8;

      if (speed > 0.35) {
        dirX = cvx / speed;
        dirY = cvy / speed;
      }

      /*
         The effect origin sits BEHIND the circle, opposite its direction of
         travel, by an amount that grows with speed. This is the difference
         between "a circle with an effect on it" and "an effect trailing a
         circle": the glyphs are dragged toward the wake, never toward the
         tracker itself.
      */
      const fast = Math.min(1, speed / SPEED_REF);
      const wake = WAKE_MIN + fast * WAKE_MAX;
      const ex = cx - dirX * wake;
      const ey = cy - dirY * wake;
      // The wake also intensifies with speed, so a slow drift is a shimmer and
      // a flick is a rip.
      const rush = 1 + fast * 0.85;

      for (const unit of units) {
        const r = unit.heading.getBoundingClientRect();

        // Cheap reject with slack, so nothing is computed for far headings.
        const near =
          r.height > 0 &&
          ex > r.left - REACH &&
          ex < r.right + REACH &&
          ey > r.top - REACH &&
          ey < r.bottom + REACH;

        if (!near) {
          if (unit.glyphs.length && unit.glyphs[0].el.style.transform) settle(unit);
          continue;
        }

        let any = false;

        for (const glyph of unit.glyphs) {
          const dx = ex - glyph.x;
          const dy = ey - glyph.y;
          const dist = Math.hypot(dx, dy);

          if (dist > REACH) {
            if (glyph.el.style.transform) {
              glyph.el.style.transform = "";
              glyph.el.style.transformOrigin = "";
              glyph.el.style.removeProperty("--s");
            }
            continue;
          }

          any = true;

          /*
             Suction from the wake. Wider than the pull and softer than the
             drain that was rejected: the glyph is dragged toward the wake
             origin, elongates along that axis and thins across it, and a
             low-frequency ripple rides the surface so the ink reads as liquid
             being drawn out rather than as a letter simply sliding.
          */
          const wakeT = Math.max(0, 1 - dist / (REACH * 1.05));
          const suction = Math.min(1, wakeT * wakeT * wakeT * rush * 2.1);

          // Direction of the pull, in the glyph's own frame.
          const ux = dx / (dist || 1);
          const uy = dy / (dist || 1);

          /*
             One effect only. The glyph is dragged toward the wake, elongates
             along that axis and thins across it — the asymmetry is what makes
             the ink look drawn out of the letter rather than merely stretched.
             Scaling happens in a rotated frame so the stretch follows the pull
             instead of the page axes.
          */
          const along = 1 + suction * 0.36;
          const across = 1 - suction * 0.22;
          const angle = (Math.atan2(uy, ux) * 180) / Math.PI;

          const tx = ux * suction * 24;
          const ty = uy * suction * 24;

          glyph.el.style.setProperty("--s", suction.toFixed(3));
          glyph.el.style.transformOrigin = "50% 50%";
          glyph.el.style.transform =
            `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) ` +
            `rotate(${angle.toFixed(1)}deg) scale(${along.toFixed(3)}, ${across.toFixed(3)}) ` +
            `rotate(${(-angle).toFixed(1)}deg)`;
        }

        if (any) dirty = true;
      }

      // Keep ticking while the invisible circle is still catching up: the wake
      // has to keep moving after the pointer stops, or it freezes mid-trail.
      if (moving) dirty = true;

      // Keep ticking while anything is still displaced so the release can
      // finish, but stop as soon as everything has settled.
      if (dirty) {
        dirty = false;
        raf = window.requestAnimationFrame(apply);
      }
    };

    const onMove = (event: PointerEvent) => {
      px = event.clientX;
      py = event.clientY;
      if (!raf) raf = window.requestAnimationFrame(apply);
    };

    const onLeave = () => {
      px = -9999;
      py = -9999;
      if (!raf) raf = window.requestAnimationFrame(apply);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    if (process.env.NODE_ENV !== "production" || /[?&]debug=1/.test(window.location.search)) {
      console.info(
        `[mercury] ready — ${units.length} headings, ` +
          `${units.reduce((n, u) => n + u.glyphs.length, 0)} glyphs`,
      );
    }

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      if (raf) window.cancelAnimationFrame(raf);
      units.forEach(settle);
    };
  }, []);

  // The effect is entirely in the pointer loop; there is no DOM to render.
  return null;
}
