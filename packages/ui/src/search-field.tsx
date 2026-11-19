import type { ComponentProps, ReactNode } from "react";
import { ArrowRight, Search } from "lucide-react";
import { cn } from "./utils";

type SearchFieldProps = Omit<ComponentProps<"input">, "type" | "children"> & {
  children?: ReactNode;
};

export function SearchField({ className, children, ...inputProps }: SearchFieldProps) {
  return (
    <div className={cn("anres-search", className)}>
      <Search className="anres-search-icon" size={19} aria-hidden="true" />
      <input
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        {...inputProps}
        type="search"
        className="anres-search-input"
      />
      {children}
    </div>
  );
}

export function SearchSubmit({ label }: { label: string }) {
  return (
    <button type="submit" className="anres-search-submit" aria-label={label}>
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  );
}
