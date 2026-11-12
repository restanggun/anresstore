import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus)] disabled:pointer-events-none disabled:opacity-50",
  { variants: { variant: {
    default: "gap-4 bg-[var(--primary)] text-[var(--foreground)] hover:bg-[var(--primary-hover)]",
    outline: "border border-[var(--border)] bg-white text-[var(--foreground)] hover:bg-[var(--primary-soft)]",
  } }, defaultVariants: { variant: "default" } },
);

export function Button({ className, variant, asChild = false, ...props }:
  React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, className }))} {...props} />;
}
