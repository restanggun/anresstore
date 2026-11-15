"use client";
import { AccessManager } from "./access-manager";
export function Operations({ section }: { section: string }) {
  return section === "access" ? <div className="operations"><AccessManager/></div> : null;
}
