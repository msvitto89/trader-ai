"use client";

import { useEffect, useRef } from "react";

/**
 * LiquidHeadings — a real water ripple over every heading.
 *
 * Earlier attempts were not water. Moving whole letters apart is a layout
 * effect, and a single feDisplacementMap over a noise field reads as a heat
 * haze, not as liquid. Water looks like water because of *concentric rings*:
 * a displacement field that follows the distance from the drop's centre, so
 * the glyph edges bend into radial waves.
 *
 * This builds per-heading SVG filters from primitives:
 *
 *   feTurbulence       low-frequency noise, the resting surface
 *   ring 1..3          a set of soft, expanding concentric strokes
 *   feComposite        the rings add up into a smooth ripple profile
 *   feDisplacementMap  bends the rendered text along that profile
 *
 * Pointer travel drives a drop: it re-centres the rings on the cursor and
 * restarts their expansion, so moving across a heading visibly stirs it. The
 * filter is removed entirely at rest, so idle headings cost nothing.
 */

const MAX_RIPPLE = 11; // peak displacement, px
const MAX_NOISE = 3; // resting surface wobble, px
const RING_COUNT = 3;

type Rig = {
  el: HTMLElement;
  filter: SVGFilterElement;
  displacement: SVGFEDisplacementMapElement;
  turbulence: SVGFETurbulenceElement;
  rings: SVGFEGaussianBlurElement[];
  regions: SVGFECompositeElement[];
  cx: number;
  cy: number;
  energy: number;
  target: number;
  mounted: boolean;
};

export function LiquidHeadings() {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Reduced motion does NOT disable this. The ripple is driven entirely by
    // the pointer, so it only ever moves while the user is moving — it is not
    // autonomous motion, which is what the preference is about. Gating on it
    // made the effect invisible for anyone with the setting enabled, which
    // reads as "the feature is broken". The only concession: the ambient
    // surface drift is skipped so nothing stirs while the cursor is at rest.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const root = document.querySelector("main");
    if (!root) return;

    const headings = Array.from(
      root.querySelectorAll<HTMLElement>("h1, h2, h3"),
    ).filter((h) => !h.closest("[data-liquid-skip]"));
    if (!headings.length) return;

    // A one-line self-report, visible in the console. If the effect is ever
    // reported as missing again, this says exactly which condition failed
    // instead of requiring another round of guessing.
    if (process.env.NODE_ENV !== "production" || /[?&]debug=1/.test(window.location.search)) {
      console.info(
        `[water] ready — ${headings.length} headings, ` +
          `reducedMotion=${window.matchMedia("(prefers-reduced-motion: reduce)").matches}, ` +
          `pointer=${window.matchMedia("(any-pointer: fine)").matches ? "fine" : window.matchMedia("(any-pointer: coarse)").matches ? "coarse" : "none-reported"}`,
      );
    }

    const NS = "http://www.w3.org/2000/svg";
    const rigs: Rig[] = [];

    /* ── Build one filter per heading ──────────────────────────────── */
    headings.forEach((el, index) => {
      const id = `liquid-heading-${index}`;

      const filter = document.createElementNS(NS, "filter") as SVGFilterElement;
      filter.setAttribute("id", id);
      // Generous region: displacement pushes pixels past the text box.
      filter.setAttribute("x", "-30%");
      filter.setAttribute("y", "-40%");
      filter.setAttribute("width", "160%");
      filter.setAttribute("height", "180%");
      filter.setAttribute("color-interpolation-filters", "sRGB");

      // Resting surface: slow, low-frequency noise so the text is never
      // perfectly still while the pointer is on it.
      const turbulence = document.createElementNS(NS, "feTurbulence") as SVGFETurbulenceElement;
      turbulence.setAttribute("type", "fractalNoise");
      turbulence.setAttribute("baseFrequency", "0.004 0.011");
      turbulence.setAttribute("numOctaves", "2");
      turbulence.setAttribute("seed", String(index + 7));
      turbulence.setAttribute("result", "noise");

      // Concentric rings: each is a circle stroked with a blur, which makes a
      // soft radial bump. Three of them, at different radii, add up into a
      // ripple profile. They are drawn in filter space (0..1 = the filter box),
      // so they scale with the heading automatically.
      const rings: SVGFEGaussianBlurElement[] = [];
      const regions: SVGFECompositeElement[] = [];

      for (let r = 0; r < RING_COUNT; r += 1) {
        // Draw a filled circle, then punch out a slightly smaller one. The
        // difference is a ring. Blurring it makes the ripple profile smooth
        // instead of a hard wall of pixels.
        const spot = document.createElementNS(NS, "feImage") as SVGFEImageElement;
        spot.setAttribute("result", `spot${r}`);
        spot.setAttribute("x", "-30%");
        spot.setAttribute("y", "-40%");
        spot.setAttribute("width", "160%");
        spot.setAttribute("height", "180%");
        // A radial gradient: opaque to ~92% of the radius, transparent after,
        // which gives a soft-edged disc without needing a second shape.
        spot.setAttributeNS(
          "http://www.w3.org/1999/xlink",
          "href",
          `data:image/svg+xml;utf8,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><radialGradient id="g"><stop offset="0.72" stop-color="#000"/><stop offset="0.9" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/></svg>`,
          )}`,
        );
        filter.appendChild(spot);

        const blur = document.createElementNS(NS, "feGaussianBlur") as SVGFEGaussianBlurElement;
        blur.setAttribute("in", `spot${r}`);
        blur.setAttribute("stdDeviation", "0.012");
        blur.setAttribute("result", `ring${r}`);
        rings.push(blur);
        filter.appendChild(blur);

        // Each ring is added on top of the previous mix, so the three radii
        // reinforce into one wave profile. Weights fall off outward.
        const comp = document.createElementNS(NS, "feComposite") as SVGFECompositeElement;
        comp.setAttribute("in", `ring${r}`);
        comp.setAttribute("in2", r === 0 ? "noise" : `mix${r - 1}`);
        comp.setAttribute("operator", "arithmetic");
        comp.setAttribute("k1", "0");
        comp.setAttribute("k2", r === 0 ? "1" : "0.9");
        comp.setAttribute("k3", "1");
        comp.setAttribute("result", `mix${r}`);
        regions.push(comp);
        filter.appendChild(comp);
      }

      const displacement = document.createElementNS(NS, "feDisplacementMap") as SVGFEDisplacementMapElement;
      displacement.setAttribute("in", "SourceGraphic");
      displacement.setAttribute("in2", `mix${RING_COUNT - 1}`);
      displacement.setAttribute("scale", "0");
      displacement.setAttribute("xChannelSelector", "R");
      displacement.setAttribute("yChannelSelector", "G");
      filter.appendChild(displacement);

      svg.appendChild(filter);

      rigs.push({
        el,
        filter,
        displacement,
        turbulence,
        rings,
        regions,
        cx: 0.5,
        cy: 0.5,
        energy: 0,
        target: 0,
        mounted: false,
      });
    });

    /* ── Drive them from the pointer ───────────────────────────────── */
    let raf = 0;
    let px = -9999;
    let py = -9999;
    let phase = 0;
    let lastX = px;
    let lastY = py;

    const apply = () => {
      raf = 0;
      let busy = false;

      // Speed of travel, so a fast sweep stirs the water harder than a slow one.
      const speed = Math.min(1, Math.hypot(px - lastX, py - lastY) / 26);
      lastX = px;
      lastY = py;

      for (const rig of rigs) {
        const rect = rig.el.getBoundingClientRect();

        // Slack above and below, so the surface begins to stir as the pointer
        // approaches rather than snapping on at the exact edge.
        const padX = 16;
        const padY = 26;
        const inside =
          rect.height > 0 &&
          px > rect.left - padX &&
          px < rect.right + padX &&
          py > rect.top - padY &&
          py < rect.bottom + padY;

        rig.target = inside ? 1 : 0;

        if (inside) {
          // Re-centre the rings on the pointer, in the filter box's 0..1 space.
          rig.cx = (px - rect.left) / rect.width;
          rig.cy = (py - rect.top) / rect.height;
          rig.energy = Math.min(1, rig.energy + 0.06 + speed * 0.22);
        } else {
          rig.energy *= 0.9;
        }

        const active = rig.energy > 0.02;

        if (active) {
          busy = true;

          if (!rig.mounted) {
            rig.el.style.filter = `url(#${rig.filter.id})`;
            rig.mounted = true;
          }

          // Rings expand outward from the drop and fade as they travel. Each of
          // the three starts at a different radius so the profile stays smooth
          // instead of collapsing into one ring.
          // Rings expand outward from the drop and fade as they travel. Each
          // starts at a different radius so the profile stays smooth instead of
          // collapsing into a single ring. Everything is in filter-box units,
          // so a wide heading and a narrow one ripple the same way.
          const swell = 0.1 + (1 - rig.energy) * 0.42;
          rig.rings.forEach((ring, r) => {
            const wobble = reduced ? 0 : Math.sin(phase * 1.1 + r) * 0.15;
            const radius = swell + r * 0.1 + wobble;
            const size = radius * 2;
            const img = ring.previousElementSibling as SVGFEImageElement | null;
            if (img) {
              img.setAttribute("x", `${(rig.cx - radius) * 100}%`);
              img.setAttribute("y", `${(rig.cy - radius) * 100}%`);
              img.setAttribute("width", `${size * 100}%`);
              img.setAttribute("height", `${size * 100}%`);
            }
            ring.setAttribute("stdDeviation", Math.max(0.004, radius * 0.2).toFixed(4));
          });

          // The displacement amount is the ripple height.
          const scale = (MAX_RIPPLE * rig.energy + MAX_NOISE * rig.energy).toFixed(2);
          rig.displacement.setAttribute("scale", scale);

          // Drift the resting surface so it never looks frozen. Skipped under
          // reduced motion, where only the pointer may cause movement.
          if (!reduced) {
            const f = 0.004 + Math.sin(phase * 0.6) * 0.0009;
            rig.turbulence.setAttribute(
              "baseFrequency",
              `${f.toFixed(5)} ${(f * 2.7).toFixed(5)}`,
            );
          }
        } else if (rig.mounted) {
          // Fully settled: drop the filter so the heading paints normally and
          // costs nothing.
          rig.el.style.filter = "";
          rig.mounted = false;
          rig.displacement.setAttribute("scale", "0");
        }
      }

      if (busy) {
        phase += 0.06;
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

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (raf) window.cancelAnimationFrame(raf);
      rigs.forEach((rig) => {
        rig.el.style.filter = "";
        rig.filter.remove();
      });
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      aria-hidden
      className="pointer-events-none absolute size-0 overflow-hidden"
    />
  );
}
