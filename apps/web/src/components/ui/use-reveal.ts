"use client";

import { useReducedMotion } from "motion/react";

/** Shared viewport entrance; spread onto the existing motion element. */
export function useReveal() {
  const reduce = useReducedMotion();
  return (delay = 0) => ({
    initial: reduce ? false as const : { opacity: 0, y: 12 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.15 },
    transition: { duration: reduce ? 0 : 0.36, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] as const },
  });
}
