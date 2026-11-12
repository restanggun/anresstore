"use client";
import { useEffect, useState } from "react";
import { HomeContent } from "@/components/storefront/home";
import { AccountPage } from "@/components/storefront/account-page";
import { authRequest } from "@/lib/auth-api";
export default function Home() { const [state,setState]=useState<"loading"|"guest"|"user"|"error">("loading"); useEffect(() => { authRequest<{user:unknown}>("session").then(data => setState(data.user ? "user" : "guest")).catch(() => setState("error")); }, []); if(state === "user") return <AccountPage/>; if(state === "guest") return <HomeContent/>; return <main id="main" className="container account-page" role="status">{state === "loading" ? "Memuat..." : "Koneksi ke layanan akun gagal. Coba muat ulang halaman."}</main>; }
