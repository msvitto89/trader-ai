"use client";

import { useEffect, useRef } from "react";

/**
 * MercuryHeadings — a gravity well over every heading.
 *
 * As the pointer nears a heading, its glyphs reach toward the cursor like a
 * bead of mercury being pulled: they stretch along the axis of the pull, lean
 * into it, and slacken as the cursor passes. The heading itself never moves.
 *
 * That last part drives the whole design. The pointing device is the only
 * moving part:
 *
 *   the <h1>/<h2>/<h3> element is only read, never restyled — no filter, no
 *   transform, no colour. Its box is exactly what the browser laid out, which
 *   is verified by measuring it before and during the effect.
 *
 *   glyphs are wrapped in <span class="mw">, a display:inline-block at zero
 *   offset. Stretching them changes ink, not layout: inline-block widths feed
 *   back into line breaking, so the wrapper is neutral by construction.
 *
 * Each glyph is displaced toward the pointer and scaled along the pull, so a
 * letter near the cursor elongates into it while the rest of the word stays
 * put — the tear that reads as liquid, without the word ever leaving its place.
 */

const REACH = 190; // px at which the well starts to pull
/**
 * How far outside the heading's own box still counts as "near". The glass
 * surfaces within this band and nowhere else, so the border of the effect is
 * exactly 40px from the text.
 */
const GLASS_BAND = 40;
const PULL_X = 19.5; // max horizontal reach toward the cursor
const PULL_Y = 9.1; // vertical reach; flat, so lines do not collide
const STRETCH = 0.39; // max elongation along the pull axis

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
  /** display:contents wrapper that scopes the glass slab to this heading. */
  wrap: HTMLElement;
  /** The glass surface itself, painted behind the glyphs. */
  slab: HTMLElement;
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
            // A copy of the letter itself, painted on top by --b. This is what
            // makes each glyph read as a raised bubble: the lower copy carries
            // the body and rim shadow, the upper one carries the glossy top.
            const gloss = document.createElement("span");
            gloss.className = "mg-gloss";
            gloss.textContent = char;
            gloss.setAttribute("aria-hidden", "true");
            glyph.appendChild(gloss);

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
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const root = document.querySelector("main");
    if (!root) return;

    const headings = Array.from(
      root.querySelectorAll<HTMLElement>("h1, h2, h3"),
    ).filter((h) => !h.closest("[data-mercury-skip]"));
    if (!headings.length) return;

    const units: Unit[] = [];

    headings.forEach((heading) => {
      /*
         The heading must build a liquid-glass SURFACE of its own, not just
         refract itself. CSS cannot put a backdrop-filter on an element and have
         it sample that same element's text, so the slab is a separate element
         placed behind the heading — wrapped around it, since the heading's
         parent is a normal-flow block and an absolutely positioned sibling
         would escape to the nearest positioned ancestor.

         The wrapper is display: contents, so it generates no box and the
         heading's layout is untouched. The slab is absolute inside it.
      */
      const wrap = document.createElement("span");
      wrap.className = "mglass";
      heading.parentNode?.insertBefore(wrap, heading);
      wrap.appendChild(heading);

      const slab = document.createElement("span");
      slab.className = "mglass__slab";
      slab.setAttribute("aria-hidden", "true");
      // Lightning CSS drops the unprefixed backdrop-filter when it sees a
      // -webkit- twin, and only Chromium's prefixed one then exists. Set both
      // directly so every engine gets whichever it honours.
      slab.style.backdropFilter = "blur(9px) saturate(1.9) brightness(1.12)";
      slab.style.setProperty("-webkit-backdrop-filter", "blur(9px) saturate(1.9) brightness(1.12)");
      slab.innerHTML =
        '<span class="mglass__ring"></span>' +
        '<span class="mglass__specular"></span>';
      wrap.insertBefore(slab, heading);

      const glyphs = wrapGlyphs(heading);
      if (!glyphs.length) return;

      const rect = heading.getBoundingClientRect();
      units.push({
        heading,
        wrap,
        slab,
        baseWidth: rect.width,
        glyphs: glyphs.map((el) => ({ el, x: 0, y: 0, ox: 0, oy: 0 })),
      });
    });

    if (!units.length) return;

    /* ── Liquid-glass filter per heading ──────────────────────────────
       Layered on top of the gravity pull, this is the refraction pass:

         feTurbulence       slow noise, the resting surface of the liquid
         feDisplacementMap  bends the rendered glyphs along that noise
         feGaussianBlur     a hair of softness, so edges read as glass
         feSpecularLighting a light source raked across the surface, which is
                            what produces the wet highlight highlight

       The filter is only attached while a heading is being pulled, so a
       resting heading paints as plain text and costs nothing.
    */
    const NS = "http://www.w3.org/2000/svg";
    const filters = new Map<HTMLElement, {
      filter: SVGFilterElement;
      turb: SVGFETurbulenceElement;
      disp: SVGFEDisplacementMapElement;
      specular: SVGFEDistantLightElement;
      attached: boolean;
    }>();

    units.forEach((unit, index) => {
      const id = `mercury-liquid-${index}`;

      const filter = document.createElementNS(NS, "filter") as SVGFilterElement;
      filter.setAttribute("id", id);
      filter.setAttribute("x", "-20%");
      filter.setAttribute("y", "-30%");
      filter.setAttribute("width", "140%");
      filter.setAttribute("height", "160%");
      filter.setAttribute("color-interpolation-filters", "sRGB");

      const turb = document.createElementNS(NS, "feTurbulence") as SVGFETurbulenceElement;
      turb.setAttribute("type", "fractalNoise");
      turb.setAttribute("baseFrequency", "0.008 0.02");
      turb.setAttribute("numOctaves", "2");
      turb.setAttribute("seed", String(index + 3));
      turb.setAttribute("result", "noise");
      filter.appendChild(turb);

      const disp = document.createElementNS(NS, "feDisplacementMap") as SVGFEDisplacementMapElement;
      disp.setAttribute("in", "SourceGraphic");
      disp.setAttribute("in2", "noise");
      disp.setAttribute("scale", "0");
      disp.setAttribute("xChannelSelector", "R");
      disp.setAttribute("yChannelSelector", "G");
      disp.setAttribute("result", "warped");
      filter.appendChild(disp);

      const blur = document.createElementNS(NS, "feGaussianBlur") as SVGFEGaussianBlurElement;
      blur.setAttribute("in", "warped");
      blur.setAttribute("stdDeviation", "0.2");
      blur.setAttribute("result", "softened");
      filter.appendChild(blur);

      // Specular pass: lights the surface so the warp reads as wet glass
      // rather than as a pixel smear.
      const spec = document.createElementNS(NS, "feSpecularLighting") as SVGFESpecularLightingElement;
      spec.setAttribute("in", "noise");
      spec.setAttribute("surfaceScale", "2");
      spec.setAttribute("specularConstant", "0.55");
      spec.setAttribute("specularExponent", "18");
      spec.setAttribute("lighting-color", "#fff0d0");
      spec.setAttribute("result", "spec");
      const light = document.createElementNS(NS, "feDistantLight") as SVGFEDistantLightElement;
      light.setAttribute("azimuth", "225");
      light.setAttribute("elevation", "58");
      spec.appendChild(light);
      filter.appendChild(spec);

      // feSpecularLighting lights EVERY pixel in the filter region, not just the
      // glyphs, so on its own it paints a flat grey rectangle behind the text.
      // Clip it to the text's own alpha first: the highlight may only exist
      // where a letterform does.
      const clipSpec = document.createElementNS(NS, "feComposite") as SVGFECompositeElement;
      clipSpec.setAttribute("in", "spec");
      clipSpec.setAttribute("in2", "softened");
      clipSpec.setAttribute("operator", "in");
      clipSpec.setAttribute("result", "specClipped");
      filter.appendChild(clipSpec);

      // Then screen it over the warped text, so it only ever adds light.
      const merge = document.createElementNS(NS, "feBlend") as SVGFEBlendElement;
      merge.setAttribute("in", "specClipped");
      merge.setAttribute("in2", "softened");
      merge.setAttribute("mode", "screen");
      merge.setAttribute("result", "glass");
      filter.appendChild(merge);

      // Keep the original alpha so the result composites like text, not a box.
      const restore = document.createElementNS(NS, "feComposite") as SVGFECompositeElement;
      restore.setAttribute("in", "glass");
      restore.setAttribute("in2", "softened");
      restore.setAttribute("operator", "in");
      filter.appendChild(restore);

      svgRef.current?.appendChild(filter);

      filters.set(unit.heading, {
        filter, turb, disp, specular: light, attached: false,
      });
    });

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
    let dirty = false;
    let phase = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const settle = (unit: Unit) => {
      for (const glyph of unit.glyphs) {
        if (glyph.el.style.transform) {
          glyph.el.style.transform = "";
          glyph.el.style.transformOrigin = "";
          glyph.el.style.removeProperty("--b");
        }
      }
    };

    const apply = () => {
      raf = 0;

      for (const unit of units) {
        const r = unit.heading.getBoundingClientRect();

        // Cheap reject with slack, so nothing is computed for far headings.
        const near =
          r.height > 0 &&
          px > r.left - REACH &&
          px < r.right + REACH &&
          py > r.top - REACH &&
          py < r.bottom + REACH;

        // The glass appears only inside the 40px band around the heading.
        const inBand =
          r.height > 0 &&
          px > r.left - GLASS_BAND &&
          px < r.right + GLASS_BAND &&
          py > r.top - GLASS_BAND &&
          py < r.bottom + GLASS_BAND;

        const rig = filters.get(unit.heading);

        if (!near) {
          if (unit.glyphs.length && unit.glyphs[0].el.style.transform) settle(unit);
          if (rig?.attached) {
            unit.heading.style.filter = "";
            rig.disp.setAttribute("scale", "0");
            rig.attached = false;
          }
          continue;
        }

        let any = false;
        let strongest = 0;

        for (const glyph of unit.glyphs) {
          const dx = px - glyph.x;
          const dy = py - glyph.y;
          const dist = Math.hypot(dx, dy);

          if (dist > REACH) {
            if (glyph.el.style.transform) {
              glyph.el.style.transform = "";
              glyph.el.style.transformOrigin = "";
              glyph.el.style.removeProperty("--b");
            }
            continue;
          }

          any = true;

          // Falloff: full strength at the cursor, zero at REACH. Squared so the
          // well is tight rather than a broad smudge.
          const t = 1 - dist / REACH;
          const pull = t * t;

          // Track the strongest pull on this heading: the glass is a property
          // of the heading, not of each glyph, so it is driven once from the
          // closest letter rather than overwritten 37 times per frame.
          if (pull > strongest) strongest = pull;

          // Direction of the pull, in the glyph's own frame.
          const ux = dx / (dist || 1);
          const uy = dy / (dist || 1);

          // Stretch along the pull axis, slacken across it. Scaling in the
          // rotated frame is what makes it read as mercury rather than as a
          // letter sliding sideways.
          // Bubble: a rounder bulge. Where the gravity pull elongates, a bubble
          // inflates more evenly, so the two read as one rounded swell rather
          // than a flat smear. --b feeds the gloss/rim in CSS.
          const bulge = 1 + pull * 0.13;
          const along = (1 + pull * STRETCH) * bulge;
          const across = (1 - pull * 0.12) * bulge;
          const angle = (Math.atan2(uy, ux) * 180) / Math.PI;

          const tx = ux * pull * PULL_X;
          const ty = uy * pull * PULL_Y;

          glyph.el.style.setProperty("--b", pull.toFixed(3));
          glyph.el.style.transformOrigin = "50% 50%";
          glyph.el.style.transform =
            `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) ` +
            `rotate(${angle.toFixed(1)}deg) scale(${along.toFixed(3)}, ${across.toFixed(3)}) ` +
            `rotate(${(-angle).toFixed(1)}deg)`;
        }

        // Surface the glass. A soft ramp over the last few pixels of the band
        // keeps the edge from popping on.
        const bandT = inBand
          ? Math.min(
              1,
              Math.max(
                0,
                Math.min(
                  px - (r.left - GLASS_BAND),
                  r.right + GLASS_BAND - px,
                  py - (r.top - GLASS_BAND),
                  r.bottom + GLASS_BAND - py,
                ) / 12,
              ),
            )
          : 0;
        // Exact geometry, every frame. `position: fixed` does NOT mean
        // viewport coordinates here: an ancestor with a transform, filter or
        // will-change becomes the containing block, and several sections have
        // one. So the slab's own viewport origin is measured and subtracted —
        // this holds regardless of which ancestor ends up anchoring it.
        const pad = 10 + bandT * 8;
        const slabOrigin = unit.slab.getBoundingClientRect();
        const originX = slabOrigin.left - (parseFloat(unit.slab.style.left) || 0);
        const originY = slabOrigin.top - (parseFloat(unit.slab.style.top) || 0);
        unit.slab.style.left = `${(r.left - pad - originX).toFixed(1)}px`;
        unit.slab.style.top = `${(r.top - pad - originY).toFixed(1)}px`;
        unit.slab.style.width = `${(r.width + pad * 2).toFixed(1)}px`;
        unit.slab.style.height = `${(r.height + pad * 2).toFixed(1)}px`;
        unit.slab.style.setProperty("--g", bandT.toFixed(3));
        unit.slab.style.setProperty("--gx", `${Math.round(((px - r.left) / (r.width || 1)) * 100)}%`);
        unit.slab.style.setProperty("--gy", `${Math.round(((py - r.top) / (r.height || 1)) * 100)}%`);
        unit.slab.dataset.on = bandT > 0.01 ? "1" : "0";

        if (rig) {
          if (any && strongest > 0.02) {
            if (!rig.attached) {
              unit.heading.style.filter = `url(#${rig.filter.id})`;
              rig.attached = true;
            }
            rig.disp.setAttribute("scale", (strongest * 7.8).toFixed(2));
            // Nudge the noise so the surface is alive while the pointer moves.
            if (!reducedMotion) {
              const f = 0.008 + Math.sin(phase * 0.9) * 0.0016;
              rig.turb.setAttribute("baseFrequency", `${f.toFixed(5)} ${(f * 2.4).toFixed(5)}`);
            }
          } else if (rig.attached) {
            unit.heading.style.filter = "";
            rig.disp.setAttribute("scale", "0");
            rig.attached = false;
          }
        }

        if (any) dirty = true;
      }

      // Keep ticking while anything is still displaced so the release can
      // finish, but stop as soon as everything has settled.
      if (dirty) {
        dirty = false;
        phase += 0.09;
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
          `${units.reduce((n, u) => n + u.glyphs.length, 0)} glyphs, ` +
          `reducedMotion=${window.matchMedia("(prefers-reduced-motion: reduce)").matches}`,
      );
    }

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      if (raf) window.cancelAnimationFrame(raf);
      units.forEach(settle);
      filters.forEach((rig, heading) => {
        heading.style.filter = "";
        rig.filter.remove();
      });
      // Unwrap: put the heading back where it was so nothing is left behind.
      units.forEach((unit) => {
        unit.wrap.parentNode?.insertBefore(unit.heading, unit.wrap);
        unit.wrap.remove();
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
