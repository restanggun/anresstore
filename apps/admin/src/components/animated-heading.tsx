"use client";
import { motion, useReducedMotion } from "motion/react";

export function AnimatedHeading({ text }: { text: string }) {
  const reduced = useReducedMotion();
  return <><span className="sr-only">{text}</span><span aria-hidden="true">{text.split(/\s+/).map((word, index) => <motion.span className="heading-word" key={`${word}-${index}`} initial={reduced ? false : { opacity: 0, filter: "blur(4px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ duration: reduced ? 0 : .34, delay: reduced ? 0 : .08 + index * .06 }}>{word}{" "}</motion.span>)}</span></>;
}
