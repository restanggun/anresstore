import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

/** Inline navigation action matching the storefront's existing text links. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="text-link">{children}<ArrowRight size={17} aria-hidden="true" /></Link>;
}
