"use client";

import { useEffect, useState, type FocusEvent } from "react";
import Link from "@/components/storefront/domain-link";
import { Pause, Play, ArrowUpRight } from "lucide-react";
import { useReducedMotion } from "motion/react";

type Config = { announcementEnabled:boolean; announcementText:string; announcementHref:string; announcementLabel:string; announcementMoving:boolean; startsAt:string|null; endsAt:string|null };
const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1").replace(/\/$/, "");

export function GrandOpeningBar() {
  const [config, setConfig] = useState<Config | null>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`${apiUrl}/storefront/landing`, { signal:controller.signal, cache:"no-store" })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Announcement unavailable")))
      .then(data => setConfig(data.config as Config)).catch(() => {});
    return () => controller.abort();
  }, []);
  if (!config?.announcementEnabled || !config.announcementText.trim()) return null;
  const now = Date.now();
  if (config.startsAt && Date.parse(config.startsAt) > now) return null;
  if (config.endsAt && Date.parse(config.endsAt) <= now) return null;
  const moving = config.announcementMoving && !reduce && !paused && !hovered && !focused;
  const clearFocusWithin = (event:FocusEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node|null)) setFocused(false); };
  const message = <>{config.announcementText}{config.announcementHref && <> <Link href={config.announcementHref} className="grand-opening-link">{config.announcementLabel}<ArrowUpRight size={13} aria-hidden="true"/></Link></>}</>;
  return <div className={`grand-opening-bar${config.announcementMoving ? " grand-opening-bar-moving" : ""}`} role="region" aria-label="Pengumuman Anres" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={clearFocusWithin}>
    <div className="grand-opening-viewport" aria-live="off">
      {moving ? <div className="grand-opening-track"><span>{message}</span><span aria-hidden="true" inert>{config.announcementText}{config.announcementHref && ` ${config.announcementLabel}`}</span></div> : <div className="grand-opening-static">{message}</div>}
    </div>
    {config.announcementMoving && !reduce && <button type="button" className="grand-opening-toggle" onClick={() => { setHovered(false); setFocused(false); setPaused(value => !value); }} aria-label={paused ? "Jalankan pengumuman" : "Jeda pengumuman"}>{paused ? <Play size={14} aria-hidden="true"/> : <Pause size={14} aria-hidden="true"/>}</button>}
  </div>;
}
