"use client";

import { useEffect, useState } from "react";
import { resellerRequest } from "@/lib/reseller-api";
import Link from "./domain-link";

export function ResellerRegistration() {
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    resellerRequest<{ registrationOpen: boolean }>("public", undefined, controller.signal)
      .then(data => setOpen(data.registrationOpen)).catch(() => {});
    return () => controller.abort();
  }, []);
  return <Link className="text-link" href="/dashboard/reseller">
    {open === true ? "Daftar reseller atau lihat status" : open === false ? "Pendaftaran ditutup · Lihat status" : "Cek pendaftaran reseller"}
  </Link>;
}
