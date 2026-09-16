"use client";

import { useEffect, useId, useRef } from "react";

/**
 * PakistanMap — built once, used at three scales.
 *
 *   scale="hero"     full frame, home page
 *   scale="inset"    half width, About — the three branches
 *   scale="corridor" simplified, service pages — one corridor only
 *
 * This is a diagram of an active network, not a feed. It carries no
 * vehicle identifiers and no tonnages, and nothing here is described as
 * live. Movement is anonymous by construction: the nodes breathe, they
 * do not report.
 *
 * Amber is the corridor, and this is the only component allowed to use
 * it. Context roads are steel; the outline is a line value.
 *
 * The corridor draws on by scaling a clip mask on the X axis — a
 * transform — rather than animating a stroke property, so the reveal
 * stays within transform and opacity.
 */

/* Plotted positions, projected from longitude and latitude so the country
   and the cities on it are recognisable:
     x = (lon − 60) × 29.4      y = (37 − lat) × 42.86
   A schematic, not a survey. */
const CITY = {
  gwadar: { x: 69, y: 509, name: "Gwadar" },
  karachi: { x: 206, y: 520, name: "Karachi" },
  portQasim: { x: 216, y: 524, name: "Port Qasim" },
  hyderabad: { x: 246, y: 497, name: "Hyderabad" },
  sukkur: { x: 260, y: 399, name: "Sukkur" },
  quetta: { x: 206, y: 292, name: "Quetta" },
  multan: { x: 338, y: 291, name: "Multan" },
  faisalabad: { x: 385, y: 239, name: "Faisalabad" },
  sargodha: { x: 372, y: 211, name: "Sargodha" },
  lahore: { x: 422, y: 234, name: "Lahore" },
  islamabad: { x: 384, y: 142, name: "Islamabad" },
  peshawar: { x: 340, y: 128, name: "Peshawar" },
} as const;

type CityKey = keyof typeof CITY;

/* The national outline, traced through the same projection: the northern
   spur, the Durand Line down the west, the Punjab border east, and the
   long Makran coast back along the bottom. */
const OUTLINE =
  "M412 4 L470 51 L500 64 L429 107 L429 171 L450 257 L426 300 " +
  "L409 343 L382 386 L323 394 L303 450 L312 484 L323 544 L259 561 " +
  "L220 566 L197 523 L176 506 L147 510 L118 506 L88 506 L47 506 " +
  "L56 459 L47 407 L27 343 L27 304 L68 326 L120 317 L185 304 " +
  "L220 249 L250 227 L273 219 L291 171 L309 133 L326 124 L323 86 " +
  "L338 43 Z";

/* Context roads — the wider network the corridor sits inside. */
const CONTEXT: [CityKey, CityKey][] = [
  ["karachi", "quetta"],
  ["quetta", "multan"],
  ["islamabad", "peshawar"],
  ["lahore", "islamabad"],
  ["gwadar", "karachi"],
];

/* One corridor per service. Highest-volume routes are still an open
   question in the PRD, so these follow the assumed Karachi–Sargodha spine
   and should be revisited once real volumes are confirmed. */
const CORRIDORS = {
  "edible-oil": {
    stops: ["portQasim", "hyderabad", "sukkur", "multan", "faisalabad", "sargodha"],
    caption: "Port Qasim inland to central and northern Punjab",
  },
  molasses: {
    stops: ["hyderabad", "sukkur", "multan", "faisalabad", "lahore"],
    caption: "Sugar-mill belt to processing and export",
  },
  containers: {
    stops: ["portQasim", "karachi", "sukkur", "multan", "lahore"],
    caption: "Port Qasim to the upcountry distribution centres",
  },
} satisfies Record<string, { stops: CityKey[]; caption: string }>;

const BRANCHES: CityKey[] = ["karachi", "portQasim", "sargodha"];

export default function PakistanMap({
  scale = "corridor",
  corridor = "edible-oil",
  label,
  className = "",
}: {
  scale?: "hero" | "inset" | "corridor";
  corridor?: keyof typeof CORRIDORS;
  /** Accessible description of what the diagram shows. */
  label: string;
  className?: string;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const uid = useId().replace(/:/g, "");

  const active = CORRIDORS[corridor];

  const stops: CityKey[] =
    scale === "inset"
      ? BRANCHES
      : scale === "hero"
        ? (CORRIDORS["edible-oil"].stops as CityKey[])
        : (active.stops as CityKey[]);

  const showContext = scale !== "inset";
  const showCorridor = scale !== "inset";

  const corridorPath = stops
    .map((key, index) => `${index === 0 ? "M" : "L"}${CITY[key].x} ${CITY[key].y}`)
    .join(" ");

  /* Three anonymous movement nodes, spaced along the corridor. They mark
     that the network is working. They do not identify anything on it. */
  const pulses = showCorridor
    ? [0.22, 0.52, 0.81].map((t) => {
        const span = (stops.length - 1) * t;
        const index = Math.min(Math.floor(span), stops.length - 2);
        const fraction = span - index;
        const from = CITY[stops[index]];
        const to = CITY[stops[index + 1]];
        return {
          x: from.x + (to.x - from.x) * fraction,
          y: from.y + (to.y - from.y) * fraction,
        };
      })
    : [];

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const [{ gsap }, motion, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("@/lib/motion"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;

      const { EASE, DUR, START, STAGGER, flow, prefersReducedMotion } = motion;
      const mask = root.querySelector<SVGRectElement>("[data-draw]");
      const nodes = root.querySelectorAll<SVGGElement>("[data-node]");
      const dots = root.querySelectorAll<SVGCircleElement>("[data-pulse]");
      if (!mask) return;

      /* Reduced motion: final state, instantly, and no looping pulse. */
      if (prefersReducedMotion()) {
        gsap.set(mask, { scaleX: 1 });
        gsap.set(nodes, { opacity: 1 });
        gsap.set(dots, { opacity: 0.55, scale: 1 });
        return;
      }

      gsap.set(mask, { scaleX: 0, transformOrigin: "left center" });
      gsap.set(nodes, { opacity: 0 });
      gsap.set(dots, { opacity: 0, scale: 0.6, transformOrigin: "center" });

      /* Below 768px the map is a static draw-on-enter: no scrub, no
         parallax, and the looping pulse is left off. */
      const isNarrow = window.matchMedia("(max-width: 768px)").matches;

      /* Positions are derived from the vocabulary rather than written as
         offsets, so the nodes and pulses finish as the corridor finishes
         drawing. Nothing here is a raw number. */
      const timeline = gsap.timeline({ paused: true });
      timeline
        .to(mask, { scaleX: 1, duration: DUR.carry, ease: EASE.carry }, 0)
        .to(
          nodes,
          { opacity: 1, duration: DUR.lift, ease: EASE.lift, stagger: STAGGER },
          DUR.lift,
        )
        .to(
          dots,
          { opacity: 0.55, scale: 1, duration: DUR.lift, ease: EASE.lift },
          DUR.carry - DUR.lift,
        );

      const loops: gsap.core.Tween[] = [];

      const trigger = ScrollTrigger.create({
        trigger: root,
        start: START,
        once: true,
        onEnter: () => {
          timeline.play();
          if (isNarrow) return;

          /* Anonymous movement: the nodes breathe out of phase. Transform
             and opacity only, and nothing identifies a vehicle. */
          dots.forEach((dot, index) => {
            const loop = flow(dot, { opacity: 0.2, scale: 1.7 }, { offset: index * 1.2 });
            if (loop) loops.push(loop as gsap.core.Tween);
          });
        },
      });

      cleanup = () => {
        trigger.kill();
        timeline.kill();
        loops.forEach((loop) => loop.kill());
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [corridorPath]);

  return (
    <figure ref={rootRef} className={`m-0 ${className}`.trim()}>
      <svg
        viewBox="10 -14 520 600"
        role="img"
        aria-label={label}
        preserveAspectRatio="xMidYMid meet"
        className="h-auto w-full overflow-visible"
      >
        <defs>
          <clipPath id={`draw-${uid}`} clipPathUnits="userSpaceOnUse">
            <rect data-draw x="10" y="-14" width="520" height="600" />
          </clipPath>
        </defs>

        <path d={OUTLINE} className="fill-fill-subtle stroke-line-strong" strokeWidth={1.25} strokeLinejoin="round" />

        {showContext && (
          <g className="stroke-steel opacity-50" strokeWidth={1} strokeDasharray="3 5">
            {CONTEXT.map(([a, b]) => (
              <line key={`${a}-${b}`} x1={CITY[a].x} y1={CITY[a].y} x2={CITY[b].x} y2={CITY[b].y} />
            ))}
          </g>
        )}

        <g clipPath={`url(#draw-${uid})`}>
          {showCorridor && (
            <path
              d={corridorPath}
              className="fill-none stroke-amber"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {pulses.map((pulse, index) => (
            <circle key={index} data-pulse cx={pulse.x} cy={pulse.y} r={4} className="fill-amber" />
          ))}
        </g>

        <g>
          {stops.map((key) => (
            <g key={key} data-node>
              <circle cx={CITY[key].x} cy={CITY[key].y} r={3.5} className="fill-cream" />
              <text
                x={CITY[key].x + 11}
                y={CITY[key].y + 4}
                className="fill-mist font-mono text-[12px] tracking-[0.08em] max-md:text-[15px]"
              >
                {CITY[key].name}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {scale === "corridor" && (
        <figcaption className="type-mono mt-4 text-steel">{active.caption}</figcaption>
      )}
    </figure>
  );
}
