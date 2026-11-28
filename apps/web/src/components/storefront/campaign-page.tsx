"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Gift, LockKeyhole, Sparkles } from "lucide-react";
import { apiUrl } from "@/lib/auth-api";
import { domains } from "@/lib/domains";
import DomainLink from "./domain-link";
import { TextLink } from "./text-link";
import styles from "./campaign-page.module.css";

type Mission={id:"verified_email"|"first_completed_order"|"referral_rewarded";title:string;description:string};
type Campaign={enabled:boolean;title:string;description:string;startsAt:string|null;endsAt:string|null;missions:Mission[]};
type Progress={enabled:boolean;referralCode:string;referralCount:number;qualifiedReferralCount:number;rewardCount:number;emailVerified:boolean;firstCompletedOrder:boolean};

export function CampaignPage({embedded=false,showPageLink=embedded}:{embedded?:boolean;showPageLink?:boolean}){
 const [campaign,setCampaign]=useState<Campaign|null>(null),[progress,setProgress]=useState<Progress|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[copyStatus,setCopyStatus]=useState("");
 useEffect(()=>{const controller=new AbortController();Promise.all([
  fetch(apiUrl+"/campaign/public",{signal:controller.signal,cache:"no-store"}).then(async r=>{if(!r.ok)throw new Error("Campaign belum dapat dimuat.");return r.json();}),
  fetch(apiUrl+"/campaign/me",{signal:controller.signal,credentials:"include",cache:"no-store"}).then(async r=>r.ok?await r.json():null),
 ]).then(([publicData,userData])=>{if(controller.signal.aborted)return;setCampaign(publicData);if(userData?.referralCode)setProgress(userData);})
 .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Campaign belum dapat dimuat.");})
 .finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[]);
 const state=useMemo(()=>{const now=Date.now();if(!campaign?.enabled)return "off";if(campaign.startsAt&&Date.parse(campaign.startsAt)>now)return "upcoming";if(campaign.endsAt&&Date.parse(campaign.endsAt)<=now)return "ended";return "active";},[campaign]);
 const referralUrl=progress?domains.auth.replace(/\/$/,"")+"/daftar?ref="+encodeURIComponent(progress.referralCode):"";
 async function copyLink(){if(!referralUrl)return;try{await navigator.clipboard.writeText(referralUrl);setCopyStatus("Tautan referral berhasil disalin.");}catch{setCopyStatus("Clipboard tidak tersedia. Salin tautan dari kolom berikut.");}}
 async function shareLink(){if(!referralUrl)return;if(typeof navigator.share==="function"){try{await navigator.share({title:"Ajak teman ke Anres Store",text:"Daftar melalui tautan ini dan ikuti misi Grand Opening.",url:referralUrl});setCopyStatus("Tautan berhasil dibagikan.");return;}catch(e){if(e instanceof Error&&e.name==="AbortError")return;}}await copyLink();}
 const missionDone=(id:string)=>id==="verified_email"?!!progress?.emailVerified:id==="first_completed_order"?!!progress?.firstCompletedOrder:!!progress?.rewardCount;
 const missionPending=(id:string)=>id==="referral_rewarded"&&!!progress?.qualifiedReferralCount&&!progress.rewardCount;
 const Wrapper=embedded?"div":"main",Heading=embedded?"h2":"h1";
 return <Wrapper {...(!embedded?{id:"main"}:{})} className={`${styles.page} ${embedded?styles.embedded:""}`}><section className={styles.hero}><div className={styles.heroIcon}><Sparkles size={22}/></div><span className={styles.eyebrow}>PERSIAPAN GRAND OPENING</span><Heading>{campaign?.title||"Misi Grand Opening"}</Heading><p>{campaign?.description||"Selesaikan misi dan ajak teman berbelanja."}</p><span className={styles.state} data-state={state} role="status">{loading?"Memuat campaign…":state==="active"?"Campaign aktif":state==="upcoming"?"Segera dimulai":state==="ended"?"Campaign selesai":"Campaign belum diaktifkan"}</span>{showPageLink && <TextLink href="/misi">Buka halaman Misi</TextLink>}</section>
 {error&&<p className={styles.error} role="alert">{error}</p>}
 {campaign?.enabled&&<section className={styles.section} aria-labelledby="mission-heading"><header><div><span className={styles.eyebrow}>LANGKAH KECIL, HADIAH SPESIAL</span><h2 id="mission-heading">Misi kamu</h2></div>{progress&&<span className={styles.count}>{progress.rewardCount} referral berhadiah</span>}</header>
 {!progress?<div className={styles.join}><LockKeyhole size={21}/><div><strong>Masuk untuk melihat progres misi</strong><p>Progres dan kode referral terhubung ke akunmu.</p></div><div className={styles.joinActions}><DomainLink href="/daftar">Buat akun</DomainLink><DomainLink href="/login">Masuk</DomainLink></div></div>:<div className={styles.missions}>{campaign.missions.map((mission,index)=>{const done=missionDone(mission.id),pending=missionPending(mission.id);return <article className={styles.mission} key={mission.id} data-done={done}><span className={styles.number}>{done?<Check size={18}/>:index+1}</span><div><strong>{mission.title}</strong><p>{mission.description}</p>{pending&&<small>Transaksi teman valid, menunggu persetujuan admin untuk voucher.</small>}</div><span className={styles.missionState}>{done?"Selesai":pending?"Ditinjau":"Belum selesai"}</span></article>;})}</div>}
 </section>}
 {campaign?.enabled&&progress&&<section className={styles.referral} aria-labelledby="referral-heading"><div className={styles.referralCopy}><span className={styles.eyebrow}>AJAK TEMAN</span><h2 id="referral-heading">Bagikan tautan referral</h2><p>Temanmu perlu membuat akun baru, memverifikasi email, lalu menyelesaikan transaksi live yang memenuhi minimum campaign. Voucher untuk kalian diterbitkan setelah admin meninjau transaksi.</p><div className={styles.referralStats}><span><strong>{progress.referralCount}</strong> teman terverifikasi</span><span><strong>{progress.rewardCount}</strong> reward diterbitkan</span></div></div><div className={styles.shareCard}><label htmlFor="referral-link">Tautan akun kamu</label><input id="referral-link" name="referral-link" autoComplete="off" readOnly value={referralUrl} onFocus={event=>event.currentTarget.select()}/><div><button type="button" onClick={()=>void copyLink()}><Clipboard size={16} aria-hidden="true"/>Salin tautan</button><button type="button" onClick={()=>void shareLink()}><Gift size={16} aria-hidden="true"/>Bagikan</button></div>{copyStatus&&<p role="status" aria-live="polite">{copyStatus}</p>}</div></section>}
 {state==="off"&&!loading&&<section className={styles.info}><Gift size={18}/><p>Admin sedang menyiapkan misi dan hadiah Grand Opening. Kunjungi lagi setelah campaign diaktifkan.</p></section>}
 </Wrapper>;
}
