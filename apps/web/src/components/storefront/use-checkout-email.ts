"use client";
import { useEffect, useState } from "react";
import { authRequest } from "@/lib/auth-api";

export function useCheckoutEmail() {
 const [accountEmail, setAccountEmail] = useState<string | null>(null);
 const [loading, setLoading] = useState(true);
 useEffect(() => {
  let active = true;
  authRequest<{user:{email:string}|null}>("session")
   .then(({user}) => { if (active) setAccountEmail(user?.email || null); })
   .catch(() => { if (active) setAccountEmail(null); })
   .finally(() => { if (active) setLoading(false); });
  return () => { active = false; };
 }, []);
 return { accountEmail, loading };
}
