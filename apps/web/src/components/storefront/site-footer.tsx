import Link from "@/components/storefront/domain-link";
import { categorySlugs } from "@/lib/catalog";
import { storeTagline } from "@/lib/store-copy";
import { categoryInfo } from "@/lib/storefront";
import { Brand } from "./brand";
import "./site-footer.css";

const socialLinks = [
  { name: "WhatsApp", icon: "whatsapp", href: "https://wa.me/6285129354014" },
  { name: "Instagram", icon: "instagram", href: "https://www.instagram.com/anres_store/" },
  { name: "TikTok", icon: "tiktok", href: "https://www.tiktok.com/@anres_store" },
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer-main">
          <div className="site-footer-brand">
            <Link href="/" className="brand" aria-label="Anres Store, beranda">
              <Brand />
            </Link>
            <p>{storeTagline}</p>
            <ul className="site-footer-socials" aria-label="Kanal resmi Anres Store">
              {socialLinks.map(({ name, icon, href }) => (
                <li key={name}>
                  <a href={href} aria-label={name} title={name}>
                    <span className={`site-footer-icon site-footer-icon-${icon}`} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <nav className="site-footer-nav" aria-label="Layanan dan informasi Anres">
            <div>
              <h2>Layanan</h2>
              <ul>
                <li><Link href="/katalog">Semua layanan</Link></li>
                {categoryInfo.map(({ name }) => (
                  <li key={name}><Link href={`/katalog/${categorySlugs[name]}`}>{name}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <h2>Informasi</h2>
              <ul>
                <li><Link href="/about">Tentang Anres</Link></li>
                <li><Link href="/bantuan">Pusat bantuan</Link></li>
                <li><Link href="/invoice">Cek invoice</Link></li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="site-footer-legal">&copy; {new Date().getFullYear()} Anres Store</div>
      </div>
    </footer>
  );
}
