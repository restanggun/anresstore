import type { ComponentProps } from "react";

export function AdminInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`admin-field ${className}`} />;
}
export function AdminTextarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`admin-field admin-textarea ${className}`} />;
}
