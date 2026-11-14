import NextLink, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes } from "react";
import { domains } from "@/lib/domains";
import { routeSurface } from "@/lib/domain-routing";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps | "href"> & LinkProps;

export default function DomainLink({ href, ...props }: Props) {
  if (typeof href === "string" && href.startsWith("/")) {
    const target = new URL(domains[routeSurface(href.split(/[?#]/, 1)[0] || "/")]);
    if (new URL(domains.web).host !== new URL(domains.auth).host || new URL(domains.web).host !== new URL(domains.app).host) {
      return <NextLink href={`${target.origin}${href}`} prefetch={false} {...props} />;
    }
  }
  return <NextLink href={href} {...props} />;
}
