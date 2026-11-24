"use client";

import { useEffect } from "react";

/**
 * HeadingDistortion — per-glyph lens distortion on every landing heading.
 *
 * A font effect has to be done per glyph: warping a whole heading as one block
 * reads as a camera wobble, not as type bending. So on mount this splits each
 * `h1`/`h2`/`h3` into spans and wraps them in a positioned shell that carries
 * three stacked layers:
 *
 *   fill   the real text, left in the document flow
 *   warp   a clone whose glyphs swell, lift and separate as the pointer nears
 *   split  an RGB pair of the same text, offset horizontally, that only
 *          appears in the middle of the cursor's travel
 *
 * The visible result: as the cursor crosses a heading, the letters near it
 * swell away from the pointer, colour-fringe, and the line momentarily opens up
 * — the pointer reads as though it is passing *through* the word, pushing the
 * letters aside.
 *
 * The DOM is the source of truth. Existing glyph markup (like the hero's
 * kinetic letters) is preserved: if a heading already contains nested spans,
 * only the leaf text nodes are wrapped, so kinetic and static headings share
 * one behaviour.
 */

const REACH = 128;

/** Collect the deepest text nodes under a heading. */
function leafTextNodes(root: HTMLElement): Text[] {
  const out: Text[] = [];
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        if ((child.textContent ?? "").trim()) out.push(child as Text);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.dataset.distortSkip !== undefined) return;
        walk(child);
      }
    });
  };
  walk(root);
  return out;
}

/**
 * Wrap each visible character of every leaf text node in a glyph span, keeping
 * surrounding inline styling intact.
 */
function splitToGlyphs(root: HTMLElement): HTMLElement[] {
  const nodes = leafTextNodes(root);
  const glyphs: HTMLElement[] = [];

  nodes.forEach((textNode) => {
    const text = textNode.textContent ?? "";
    if (!text.trim()) return;

    const frag = document.createDocumentFragment();
    // Split into words first, then glyphs. Each word is one nowrap unit: a
    // glyph-per-span alone lets the browser break mid-word ("Watc / h").
    text.split(/(\s+)/).forEach((chunk) => {
      if (!chunk) return;
      if (/^\s+$/.test(chunk)) {
        frag.appendChild(document.createTextNode(" "));
        return;
      }
      const word = document.createElement("span");
      word.className = "hw";
      Array.from(chunk).forEach((char) => {
        const span = document.createElement("span");
        span.className = "hg";
        span.textContent = char;
        word.appendChild(span);
        glyphs.push(span);
      });
      frag.appendChild(word);
    });

    textNode.replaceWith(frag);
  });

  return glyphs;
}

export function HeadingDistortion() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.querySelector("main");
    if (!root) return;

    const headings = Array.from(
      root.querySelectorAll<HTMLElement>("h1, h2, h3"),
    ).filter((h) => !h.closest("[data-distort-skip]"));

    if (!headings.length) return;

    const cleanups: Array<() => void> = [];

    headings.forEach((heading) => {
      // Split into glyphs, then snapshot the markup so the warp/split clones
      // match the fill exactly, styling and all.
      splitToGlyphs(heading);
      const innerHTML = heading.innerHTML;
      const fillClass = heading.className;

      // The heading becomes a shell; the original moves into a fill layer.
      const shell = document.createElement("span");
      shell.className = "hdistort";
      shell.dataset.hdistort = "1";

      const fill = document.createElement("span");
      fill.className = `${fillClass} hdistort__layer hdistort__fill`;
      // Invisible but still in flow: it defines the box the warp sits in.
      fill.setAttribute("aria-hidden", "false");
      fill.innerHTML = innerHTML;

      const warp = document.createElement("span");
      warp.className = `${fillClass} hdistort__layer hdistort__warp`;
      warp.innerHTML = innerHTML;
      warp.setAttribute("aria-hidden", "true");

      const splitR = document.createElement("span");
      splitR.className = `${fillClass} hdistort__layer hdistort__split hdistort__split--r`;
      splitR.innerHTML = innerHTML;
      splitR.setAttribute("aria-hidden", "true");

      const splitC = document.createElement("span");
      splitC.className = `${fillClass} hdistort__layer hdistort__split hdistort__split--c`;
      splitC.innerHTML = innerHTML;
      splitC.setAttribute("aria-hidden", "true");

      // Reset the heading's own layout classes onto the shell, so the shell
      // occupies exactly the space the heading used to.
      heading.className = "hdistort-host";
      heading.textContent = "";
      shell.appendChild(fill);
      shell.appendChild(warp);
      shell.appendChild(splitR);
      shell.appendChild(splitC);
      heading.appendChild(shell);

      const warpGlyphs = Array.from(
        warp.querySelectorAll<HTMLElement>(".hg"),
      );
      const rGlyphs = Array.from(splitR.querySelectorAll<HTMLElement>(".hg"));
      const cGlyphs = Array.from(splitC.querySelectorAll<HTMLElement>(".hg"));

      // Cache glyph centres; recompute on resize and before any sweep.
      let rects: Array<{ x: number; y: number }> = [];
      const measure = () => {
        rects = warpGlyphs.map((g) => {
          const r = g.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
      };

      let frame = 0;
      let px = -9999;
      let py = -9999;
      let currentlyLit = false;

      const clear = () => {
        warpGlyphs.forEach((g) => {
          g.style.transform = "";
          g.style.opacity = "";
          g.style.filter = "";
        });
        rGlyphs.forEach((g) => {
          g.style.transform = "";
          g.style.opacity = "0";
        });
        cGlyphs.forEach((g) => {
          g.style.transform = "";
          g.style.opacity = "0";
        });
        shell.dataset.lit = "0";
        currentlyLit = false;
      };

      const apply = () => {
        frame = 0;
        const hr = heading.getBoundingClientRect();
        // Cheap reject: pointer nowhere near this heading.
        if (px < hr.left - REACH || px > hr.right + REACH || py < hr.top - REACH * 1.4 || py > hr.bottom + REACH * 1.4) {
          if (currentlyLit) clear();
          return;
        }

        let anyHot = false;

        for (let i = 0; i < warpGlyphs.length; i += 1) {
          const point = rects[i];
          if (!point) continue;
          const g = warpGlyphs[i];
          const dx = px - point.x;
          const dy = py - point.y;
          const dist = Math.hypot(dx, dy);

          if (dist > REACH) {
            if (g.style.transform) {
              g.style.transform = "";
              g.style.opacity = "";
              g.style.filter = "";
            }
            if (rGlyphs[i]) rGlyphs[i].style.opacity = "0";
            if (cGlyphs[i]) cGlyphs[i].style.opacity = "0";
            continue;
          }

          anyHot = true;
          const t = 1 - dist / REACH;
          const eased = t * t * (3 - 2 * t); // smoothstep

          // Push away from the pointer: the glyph nearest the cursor moves
          // furthest, so the word appears to open around it.
          // Away from the cursor: the glyph nearest the pointer is displaced
          // furthest, so the word visibly parts around it.
          const ndx = dx / (dist || 1);
          const ndy = dy / (dist || 1);
          const push = eased * 13;
          // Vertical displacement is flattened; paragraphs of headings should
          // part sideways, not jump up and down.
          g.style.transform = `translate3d(${(ndx * push).toFixed(2)}px, ${(ndy * push * 0.34).toFixed(2)}px, 0) scale(${(1 - eased * 0.1).toFixed(3)})`;
          g.style.filter = `blur(${(eased * 1.6).toFixed(2)}px)`;
          g.style.opacity = String(1 - eased * 0.06);

          // Chromatic dispersion peaks at the mid-range of the travel, so the
          // fringe sweeps across the word rather than clinging to the cursor.
          const fringe = Math.sin(eased * Math.PI);
          if (rGlyphs[i]) {
            rGlyphs[i].style.transform = `translate3d(${(-3.2 * fringe).toFixed(2)}px, 0, 0) scale(${(1 + eased * 0.14).toFixed(3)})`;
            rGlyphs[i].style.opacity = (0.5 * fringe).toFixed(3);
          }
          if (cGlyphs[i]) {
            cGlyphs[i].style.transform = `translate3d(${(3.6 * fringe).toFixed(2)}px, 0, 0) scale(${(1 + eased * 0.14).toFixed(3)})`;
            cGlyphs[i].style.opacity = (0.42 * fringe).toFixed(3);
          }
        }

        shell.dataset.lit = anyHot ? "1" : "0";
        currentlyLit = anyHot;
      };

      const onMove = (event: PointerEvent) => {
        px = event.clientX;
        py = event.clientY;
        if (!frame) frame = window.requestAnimationFrame(apply);
      };

      const onResize = () => {
        measure();
        if (currentlyLit) apply();
      };

      const onLeave = () => {
        px = -9999;
        py = -9999;
        if (!frame) frame = window.requestAnimationFrame(apply);
      };

      // Only start once fonts are settled, otherwise the cached centres are
      // measured against fallback metrics and every glyph is offset.
      if (document.fonts?.status === "loaded") measure();
      document.fonts?.ready.then(measure).catch(() => measure());

      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("scroll", onResize, { passive: true });
      window.addEventListener("resize", onResize);
      document.addEventListener("pointerleave", onLeave);

      cleanups.push(() => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("scroll", onResize);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("pointerleave", onLeave);
        if (frame) window.cancelAnimationFrame(frame);
      });
    });

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
