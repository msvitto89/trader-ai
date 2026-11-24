"use client";

import { useEffect, useRef } from "react";

/**
 * LiquidHeadings — a water-surface displacement on every heading.
 *
 * Earlier approach rebuilt each heading into stacked glyph layers. That was
 * fragile: a pixel-identical clone doubled the text, a frozen snapshot drifted
 * against scroll, and hiding one layer blanked the heading for reduced-motion
 * users. None of it was necessary.
 *
 * This applies an SVG filter to the heading element itself instead, so the
 * heading's own DOM is never touched. It works on every heading, including the
 * hero's kinetic one, whose per-glyph transforms still run underneath because a
 * filter operates on the rendered result, not on the markup.
 *
 * The filter is a turbulence field driving a displacement map — the same pair
 * browsers use for liquid distortion:
 *   feTurbulence       a noise field, the "surface" of the water
 *   feDisplacementMap  pushes each pixel along that field
 *
 * On hover the displacement scale ramps up and the noise slowly drifts, so the
 * text ripples like a reflection on moving water rather than sitting under a
 * static warp. Leaving the heading ramps it back to zero and the filter is
 * removed entirely, so idle headings cost nothing.
 */

const MAX_SCALE = 15;
const BASE_FREQ = 0.005;

type Rig = {
  el: HTMLElement;
  filter: SVGFilterElement;
  turbulence: SVGFETurbulenceElement;
  displacement: SVGFEDisplacementMapElement;
  scale: number;
  target: number;
};

export function LiquidHeadings() {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.querySelector("main");
    if (!root) return;

    const headings = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3"));
    if (!headings.length) return;

    const NS = "http://www.w3.org/2000/svg";
    const rigs: Rig[] = [];

    headings.forEach((el, index) => {
      const id = `liquid-heading-${index}`;

      const filter = document.createElementNS(NS, "filter") as SVGFilterElement;
      filter.setAttribute("id", id);
      // Generous region: displacement pushes pixels outside the text box.
      filter.setAttribute("x", "-25%");
      filter.setAttribute("y", "-25%");
      filter.setAttribute("width", "150%");
      filter.setAttribute("height", "150%");
      filter.setAttribute("color-interpolation-filters", "sRGB");

      const turbulence = document.createElementNS(NS, "feTurbulence") as SVGFETurbulenceElement;
      turbulence.setAttribute("type", "fractalNoise");
      turbulence.setAttribute("baseFrequency", `${BASE_FREQ} ${BASE_FREQ * 4}`);
      turbulence.setAttribute("numOctaves", "2");
      turbulence.setAttribute("seed", String(index + 1));
      turbulence.setAttribute("result", "noise");

      const displacement = document.createElementNS(NS, "feDisplacementMap") as SVGFEDisplacementMapElement;
      displacement.setAttribute("in", "SourceGraphic");
      displacement.setAttribute("in2", "noise");
      displacement.setAttribute("scale", "0");
      displacement.setAttribute("xChannelSelector", "R");
      displacement.setAttribute("yChannelSelector", "G");

      filter.appendChild(turbulence);
      filter.appendChild(displacement);
      svg.appendChild(filter);

      rigs.push({ el, filter, turbulence, displacement, scale: 0, target: 0 });
    });

    let raf = 0;
    let px = -9999;
    let py = -9999;
    let phase = 0;

    const apply = () => {
      raf = 0;
      let active = false;

      for (const rig of rigs) {
        const rect = rig.el.getBoundingClientRect();

        // Hover test with a little slack above and below, so the water stirs
        // as the pointer approaches rather than snapping on at the edge.
        const pad = 18;
        const inside =
          px >= rect.left - pad &&
          px <= rect.right + pad &&
          py >= rect.top - pad &&
          py <= rect.bottom + pad &&
          rect.height > 0 &&
          px > -100;

        rig.target = inside ? MAX_SCALE : 0;
        // Ease out as quickly as it came in; water settles fast.
        rig.scale += (rig.target - rig.scale) * (inside ? 0.16 : 0.075);

        if (rig.scale > 1.2) {
          active = true;
          rig.displacement.setAttribute("scale", rig.scale.toFixed(2));

          // Drift the noise so the surface moves. Two frequency bands keep it
          // from reading as a single repeating pattern.
          const f = BASE_FREQ * (1 + Math.sin(phase * 0.7) * 0.18);
          rig.turbulence.setAttribute("baseFrequency", `${f.toFixed(5)} ${(f * 4).toFixed(5)}`);

          if (rig.el.style.filter !== `url(#${rig.filter.id})`) {
            rig.el.style.filter = `url(#${rig.filter.id})`;
          }
        } else if (rig.el.style.filter) {
          // Fully settled: drop the filter so idle headings paint normally.
          rig.el.style.filter = "";
          rig.displacement.setAttribute("scale", "0");
        }
      }

      // Keep running while any heading is still animating OR still settling.
      const settling = rigs.some((r) => r.el.style.filter);
      if (active || settling) {
        phase += 0.05;
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
