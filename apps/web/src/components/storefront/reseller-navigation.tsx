import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import Link from "./domain-link";

const links = [
  ["Program reseller", "/reseller"],
  ["Cara bergabung", "/reseller#cara-bergabung"],
  ["Perbandingan harga", "/reseller#perbandingan-harga"],
  ["Level reseller", "/reseller#level-reseller"],
] as const;

export function ResellerNavigation({ current, onSelect }: { current: boolean; onSelect?: () => void }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || onSelect) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !groupRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open, onSelect]);

  return (
    <div
      ref={groupRef}
      className="reseller-nav"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={event => {
        if (event.key !== "Escape" || !open) return;
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <button ref={triggerRef} type="button" className="reseller-nav-trigger" data-current={current} aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        Reseller <ChevronDown size={16} aria-hidden="true" />
      </button>
      <ul id={listId} className="reseller-nav-links" hidden={!open}>
        {links.map(([label, href]) => (
          <li key={href}>
            <Link
              href={current && href.includes("#") ? href.slice(href.indexOf("#")) : href}
              aria-current={current && href === "/reseller" ? "page" : undefined}
              onNavigate={() => {
                setOpen(false);
                onSelect?.();
              }}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
