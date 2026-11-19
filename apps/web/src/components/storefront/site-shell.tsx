"use client";
import { domains } from "@/lib/domains";
import Link from "@/components/storefront/domain-link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, X, ChevronRight } from "lucide-react";
import { paymentRequest } from "@/lib/payment-api";
import { authRequest } from "@/lib/auth-api";
import { CartPopup } from "./cart-popup";
import { Brand } from "./brand";
import { CustomerNotificationsProvider, NotificationBanner, NotificationBell } from "./customer-notifications";
const navigation = [["Beranda", "/"], ["Katalog", "/katalog"], ["Misi", "/misi"], ["Invoice", "/invoice"], ["Tentang", "/about"], ["Bantuan", "/bantuan"]] as const;
const api = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1").replace(/\/$/, "");
const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3001" : "");
export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  const [account, setAccount] = useState<string | null>(null);
  const currentNavigation = account ? [["Dashboard", "/dashboard"], ...navigation.slice(1)] as const : navigation;
  const [admin, setAdmin] = useState<boolean | null>(null);
  const profileLabel = admin === false ? account : "Profil";
  const profileTitle = admin === false ? account ?? undefined : undefined;
  const profileCurrent = pathname === "/profil" ? "page" : undefined;
  useEffect(() => {
    let revision = 0;
    const update = async () => {
      const current = ++revision;
      setAdmin(null);
      try {
        const { user } = await authRequest<{user:{email:string;name:string}|null}>("session");
        if (current !== revision) return;
        setAccount(user?.name || user?.email || null);
        if (!user) return;
        void fetch(`${api}/admin/eligibility`, { credentials: "include", cache: "no-store" })
          .then(response => {
            if (current === revision && (response.ok || response.status === 403)) setAdmin(response.ok);
          }).catch(() => {});
        void paymentRequest<{attachedCount:number}>("guest/attach",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(result=>{if(current===revision&&result.attachedCount>0)window.dispatchEvent(new CustomEvent("invoice-ownership-updated",{detail:{attachedCount:result.attachedCount}}));}).catch(()=>{});
        const profile = await authRequest<{fullName:string}>("profile").catch(() => null);
        if (current === revision && profile?.fullName) setAccount(profile.fullName);
      } catch { if (current === revision) setAccount(null); }
    };
    void update();
    window.addEventListener("account-updated", update);
    return () => { revision++; window.removeEventListener("account-updated", update); };
  }, []);
  const logout = async () => { try { await authRequest("logout",{}); sessionStorage.removeItem("anres_confirm_email"); sessionStorage.removeItem("anres_recovery_email"); setAccount(null); close(); window.location.assign(domains.auth + "/login?logged_out=1"); } catch { /* Keep the visible session if logout fails. */ } };
  const [open, setOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);
  const reduce = useReducedMotion();
  const menuOpen = open && menuPath === pathname;
  const close = () => setOpen(false);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 901px)");
    const resize = () => { if (desktop.matches) setOpen(false); };
    document.addEventListener("pointerdown", dismiss);
    desktop.addEventListener("change", resize);
    return () => { document.removeEventListener("pointerdown", dismiss); desktop.removeEventListener("change", resize); };
  }, [menuOpen]);
  return <CustomerNotificationsProvider><>
    <div className="header-space"><NotificationBanner/><header ref={headerRef} className={`site-header${scrolled ? " is-scrolled" : ""}`} onKeyDown={event => { if (event.key === "Escape") { close(); document.getElementById("menu-toggle")?.focus(); } }}><div className="container nav-shell">
      <Link href={account ? "/dashboard" : "/"} className="brand" aria-label={account ? "Anres Store dashboard" : "Anres Store beranda"} onClick={close}><Brand /></Link>
      <nav className="desktop-nav" aria-label="Navigasi utama">{currentNavigation.map(([label,href]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{pathname === href && <motion.span className="nav-indicator" layoutId="active-navigation" transition={{type:"spring", stiffness:400,damping:35}} />}<span>{label}</span></Link>)}</nav>
      <div className="nav-actions"><CartPopup/><NotificationBell/><div className="nav-account">{account ? <>{admin && adminUrl && <a href={adminUrl} className="login-link">Dashboard admin</a>}<Link href="/profil" className="login-link account-name" title={profileTitle} aria-current={profileCurrent}>{profileLabel}</Link><button className="signup-link" onClick={logout}>Keluar</button></> : <><Link href="/login" className="login-link" aria-current={pathname === "/login" ? "page" : undefined}>Login</Link><Link href="/daftar" className="signup-link" aria-current={pathname === "/daftar" ? "page" : undefined}>Daftar</Link></>}</div>
      <button id="menu-toggle" className="menu-toggle" aria-label={menuOpen ? "Tutup menu" : "Buka menu"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => { setMenuPath(pathname); setOpen(!menuOpen); }}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></div>
      <AnimatePresence initial={false}>{menuOpen && <motion.nav id="mobile-navigation" className="mobile-nav" aria-label="Navigasi mobile" initial={{opacity:0,y:reduce?0:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduce?0:-5}} transition={{duration:reduce?0:.16}}>{currentNavigation.map(([label,href]) => <Link key={href} href={href} onClick={close} aria-current={pathname === href ? "page" : undefined}>{label}<ChevronRight size={17} aria-hidden="true" /></Link>)}<div className="mobile-account">{account ? <>{admin && adminUrl && <a href={adminUrl} className="login-link">Dashboard admin</a>}<Link href="/profil" className="login-link account-name" onClick={close} aria-current={profileCurrent}>{profileLabel}</Link><button className="signup-link" onClick={logout}>Keluar</button></> : <><Link href="/login" className="login-link" onClick={close} aria-current={pathname === "/login" ? "page" : undefined}>Login</Link><Link href="/daftar" className="signup-link" onClick={close} aria-current={pathname === "/daftar" ? "page" : undefined}>Daftar</Link></>}</div></motion.nav>}</AnimatePresence>
    </div></header></div>
    {children}
    <footer className="site-footer"><div className="container footer-inner"><div><Link href="/" className="brand" aria-label="Anres Store beranda footer"><Brand /></Link><p>Kebutuhan digital, dekat denganmu.</p></div><nav className="footer-nav" aria-label="Navigasi footer"><Link href="/about">Tentang Anres</Link><Link href="/bantuan">Pusat bantuan</Link><Link href="/katalog">Jelajahi katalog</Link></nav><div className="footer-meta"><span>Game. Karya. Keseharian.</span><span>&copy; {new Date().getFullYear()} Anres Store</span></div></div></footer>
  </></CustomerNotificationsProvider>;
}
