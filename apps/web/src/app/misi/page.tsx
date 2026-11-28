import { CampaignPage } from "@/components/storefront/campaign-page";
import { PermanentMissions } from "@/components/storefront/permanent-missions";
import styles from "@/components/storefront/reseller-dashboard.module.css";

export const metadata = { title: "Misi | Anres Store", description: "Lihat progres tier dan misi Grand Opening Anres Store." };
export default function MissionsPage() {
  return <main id="main" className={`container account-page ${styles.page}`}>
    <h1>Misi</h1>
    <nav className={styles.actions} aria-label="Bagian misi">
      <a className="text-link" href="#permanen">Misi Permanen</a>
      <a className="text-link" href="#grand-opening">Grand Opening</a>
    </nav>
    <PermanentMissions/>
    <div id="grand-opening" tabIndex={-1} className={styles.mission}><CampaignPage embedded showPageLink={false}/></div>
  </main>;
}
