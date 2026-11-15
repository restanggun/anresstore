"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authRequest } from "@/lib/auth-api";
import { HomeContent } from "./home";

export function HomeEntry() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    authRequest<{ user: { id: string } | null }>("session")
      .then(({ user }) => { if (active) { setSignedIn(!!user); if (user) router.replace("/dashboard"); } })
      .catch(() => { if (active) setSignedIn(false); });
    return () => { active = false; };
  }, [router]);
  if (signedIn !== false) return <main id="main" className="container account-page"><p role="status">{signedIn ? "Membuka dashboard..." : "Memuat beranda..."}</p></main>;
  return <HomeContent />;
}
