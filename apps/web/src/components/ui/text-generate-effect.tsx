"use client";
// Adapted from Aceternity UI TextGenerateEffect. See frontend-toolkit.md for source.
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { ElementType } from "react";

export function TextGenerateEffect({ words, className, filter = true, duration = 0.5, delay = 0, revealOnView = false, as: Tag = "div" }: {
  words: string; className?: string; filter?: boolean; duration?: number; delay?: number; revealOnView?: boolean; as?: ElementType;
}) {
  const reduceMotion = useReducedMotion();
  return <Tag className={cn("text-generate", className)}>
    <span className="sr-only">{words}</span>
    <span aria-hidden="true">{words.split(/\s+/).map((word, index) => <motion.span
      key={`${word}-${index}`} className="inline-block"
      initial={{ opacity: 0, filter: filter ? "blur(4px)" : "none" }}
      {...(revealOnView ? { whileInView: { opacity: 1, filter: "none" }, viewport: { once: true, amount: 0.15 } } : { animate: { opacity: 1, filter: "none" } })}
      transition={{ duration: reduceMotion ? 0 : duration, delay: reduceMotion ? 0 : delay + 0.1 + index * 0.06 }}
    >{word}<span className="whitespace-pre"> </span></motion.span>)}</span>
  </Tag>;
}

