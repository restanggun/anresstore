"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "motion/react";
import { LayoutGrid, ShoppingBag, Box, CreditCard, CircleHelp, Users, ChartNoAxesCombined, Activity, ShieldCheck, ArrowRight, Menu, X, Bell, Clock, Sparkles, Ticket, Star } from "lucide-react";
import { useApiHealth } from "../components/health-chart";
import { AdminGate } from "../components/admin-gate";
import { Brand } from "../components/brand";
import { SupportTicketBadge, SupportNotifications } from "../components/support-notifications";

function WorkspaceLoading() { return <p role="status">Memuat ruang kerja...</p>; }
const Operations = dynamic(() => import("../components/operations").then(module => module.Operations), { loading: WorkspaceLoading });
const AssistantWorkspace = dynamic(() => import("../components/assistant-workspace").then(module => module.AssistantWorkspace), { loading: WorkspaceLoading });
const OrderWorkspace = dynamic(() => import("../components/order-workspace").then(module => module.OrderWorkspace), { loading: WorkspaceLoading });
const ProductWorkspace = dynamic(() => import("../components/product-workspace").then(module => module.ProductWorkspace), { loading: WorkspaceLoading });
const VoucherWorkspace = dynamic(() => import("../components/voucher-workspace").then(module => module.VoucherWorkspace), { loading: WorkspaceLoading });
const ReviewWorkspace = dynamic(() => import("../components/review-workspace").then(module => module.ReviewWorkspace), { loading: WorkspaceLoading });
const TransactionAnalytics = dynamic(() => import("../components/transaction-analytics").then(module => module.TransactionAnalytics), { loading: WorkspaceLoading });
const ServiceWorkspace = dynamic(() => import("../components/service-workspace").then(module => module.ServiceWorkspace), { loading: WorkspaceLoading });
const TaskWorkspace = dynamic(() => import("../components/task-workspace").then(module => module.TaskWorkspace), { loading: WorkspaceLoading });
const PremiumWorkspace = dynamic(() => import("../components/premium-workspace").then(module => module.PremiumWorkspace), { loading: WorkspaceLoading });
const SystemMonitor = dynamic(() => import("../components/system-monitor").then(module => module.SystemMonitor), { loading: WorkspaceLoading });

type IconName = "grid"|"bag"|"box"|"card"|"help"|"users"|"chart"|"pulse"|"shield"|"arrow"|"menu"|"close"|"bell"|"clock"|"assistant"|"ticket"|"star";
const icons: Record<IconName, typeof LayoutGrid> = {grid:LayoutGrid,bag:ShoppingBag,box:Box,card:CreditCard,help:CircleHelp,users:Users,chart:ChartNoAxesCombined,pulse:Activity,shield:ShieldCheck,arrow:ArrowRight,menu:Menu,close:X,bell:Bell,clock:Clock,assistant:Sparkles,ticket:Ticket,star:Star};
function Icon({name,size=20}:{name:IconName;size?:number}) { const Component=icons[name]; return <Component size={size} strokeWidth={1.7} aria-hidden="true"/>; }
type Section={id:string;label:string;icon:IconName;group:string;description:string;metrics:string[];chart:string;chartDescription:string;list:string;listDescription:string};
const sections:Section[]=[
 {id:"overview",label:"Ringkasan",icon:"grid",group:"Utama",description:"",metrics:[],chart:"",chartDescription:"",list:"",listDescription:""},
 {id:"assistant",label:"Asisten Anres",icon:"assistant",group:"Utama",description:"",metrics:[],chart:"",chartDescription:"",list:"",listDescription:""},
 {id:"vouchers",label:"Voucher",icon:"ticket",group:"Operasional",description:"",metrics:[],chart:"",chartDescription:"",list:"",listDescription:""},
 {id:"orders",label:"Pesanan & invoice",icon:"bag",group:"Operasional",description:"Pantau pesanan, invoice, dan proses pemenuhan dalam satu tempat.",metrics:["Pesanan baru","Menunggu pembayaran","Perlu ditinjau","Selesai"],chart:"Tren pesanan",chartDescription:"Jumlah pesanan berdasarkan waktu.",list:"Pesanan terbaru",listDescription:"Pesanan dan transaksi produksi yang tercatat di server."},
 {id:"fulfillment",label:"Antrean pemenuhan",icon:"box",group:"Operasional",description:"Tinjau pembayaran terverifikasi dan status pengiriman provider.",metrics:[],chart:"",chartDescription:"",list:"",listDescription:""},
 {id:"tasks",label:"Joki tugas",icon:"bag",group:"Operasional",description:"Tangani pesanan tugas setelah pembayaran terverifikasi.",metrics:[],chart:"",chartDescription:"",list:"",listDescription:""},
 {id:"apps",label:"Aplikasi premium",icon:"box",group:"Operasional",description:"Tangani pengiriman akun premium secara manual.",metrics:[],chart:"",chartDescription:"",list:"",listDescription:""},
 {id:"payments",label:"Pembayaran",icon:"card",group:"Operasional",description:"Pantau pembayaran, kegagalan, dan transaksi yang membutuhkan tindak lanjut.",metrics:["Menunggu pembayaran","Pembayaran berhasil","Gagal atau kedaluwarsa","Pengembalian dana"],chart:"Status pembayaran",chartDescription:"Perbandingan status pembayaran dalam periode terpilih.",list:"Aktivitas pembayaran",listDescription:"Status pembayaran nyata akan muncul setelah integrasi tersedia."},
 {id:"catalog",label:"Katalog & harga",icon:"box",group:"Operasional",description:"Pantau produk, kategori, harga, dan ketersediaan layanan.",metrics:["Produk tersedia","Kategori layanan","Produk tidak tersedia","Perubahan harga"],chart:"Produk per kategori",chartDescription:"Sebaran produk yang tersedia di katalog.",list:"Kondisi katalog",listDescription:"Katalog game dan prabayar mengambil data dari penyedia; kategori lainnya masih dalam persiapan."},
 {id:"customers",label:"Pelanggan",icon:"users",group:"Pelanggan",description:"Kelola profil akun pelanggan dari website utama.",metrics:["Total akun","Akun baru","Pelanggan berpesanan","Aktivitas akun"],chart:"Pertumbuhan akun",chartDescription:"Jumlah akun baru berdasarkan waktu.",list:"Akun terbaru",listDescription:"Data profil pelanggan hanya dapat ditampilkan melalui akses admin yang aman."},
 {id:"reviews",label:"Rating & ulasan",icon:"star",group:"Pelanggan",description:"Tinjau rating dan komentar pada setiap produk.",metrics:[],chart:"",chartDescription:"",list:"",listDescription:""},
 {id:"conversations",label:"Room chat CS",icon:"help",group:"Pelanggan",description:"Percakapan dan tiket customer dari halaman Bantuan.",metrics:[],chart:"",chartDescription:"",list:"",listDescription:""},
 {id:"support",label:"Bantuan pelanggan",icon:"help",group:"Pelanggan",description:"Pantau permintaan bantuan dari formulir di website.",metrics:["Permintaan baru","Sedang ditangani","Selesai","Total permintaan"],chart:"Permintaan bantuan",chartDescription:"Jumlah permintaan bantuan berdasarkan waktu.",list:"Permintaan terbaru",listDescription:"Formulir bantuan menyimpan permintaan, tetapi akses dan balasan admin belum tersedia."},
 {id:"reports",label:"Laporan",icon:"chart",group:"Analisis",description:"Pahami perkembangan toko dari pesanan, pembayaran, dan pelanggan.",metrics:["Nilai transaksi","Pesanan selesai","Pelanggan baru","Tingkat keberhasilan"],chart:"Perkembangan toko",chartDescription:"Tren transaksi yang telah terverifikasi berdasarkan waktu.",list:"Ringkasan laporan",listDescription:"Laporan akan tersedia setelah data transaksi terverifikasi terhubung."},
 {id:"system",label:"Status sistem",icon:"pulse",group:"Analisis",description:"Pantau koneksi layanan dan kesiapan integrasi toko.",metrics:["API","Database","Penyedia katalog","Pembayaran"],chart:"Ketersediaan layanan",chartDescription:"Riwayat layanan membutuhkan pemantauan berkelanjutan.",list:"Status integrasi",listDescription:"Pemeriksaan API hanya menunjukkan proses API dapat dijangkau, bukan kondisi database atau penyedia."},
 {id:"access",label:"Akses admin",icon:"shield",group:"Pengaturan",description:"Atur siapa yang dapat mengakses data dan operasional toko.",metrics:["Administrator","Peran akses","Aktivitas admin","Keamanan"],chart:"Aktivitas akses",chartDescription:"Riwayat akses membutuhkan audit log yang terhubung.",list:"Keamanan ruang kerja",listDescription:"Role dan izin dikelola oleh super admin."},
];
export default function AdminHome(){ return <AdminGate><AdminDashboard /></AdminGate>; }
function AdminDashboard(){
 const [active,setActive]=useState("overview"),[menuOpen,setMenuOpen]=useState(false);
 useEffect(()=>{const handler=(event:Event)=>{const section=(event as CustomEvent<{section?:string}>).detail?.section;if(section==="apps"||section==="tasks")setActive(section)};window.addEventListener("anres-open-manual-order",handler);return()=>window.removeEventListener("anres-open-manual-order",handler)},[]);
 const {health,samples,refresh,fetching}=useApiHealth(); const reducedMotion=useReducedMotion();
 const [transactionStatus,setTransactionStatus]=useState<string>();
 const select=(id:string,status?:string)=>{setActive(id);setTransactionStatus(status);setMenuOpen(false)}; const current=sections.find(x=>x.id===active)!;
 const drawer = useRef<HTMLDialogElement>(null);
 useEffect(() => {
   const panel = drawer.current;
   if (menuOpen && !panel?.open) panel?.showModal();
   if (!menuOpen && panel?.open) panel.close();
 }, [menuOpen]);
 useEffect(() => {
   const desktop = window.matchMedia("(min-width: 768px)");
   const closeDrawer = () => { if (desktop.matches) setMenuOpen(false); };
   desktop.addEventListener("change", closeDrawer);
   return () => desktop.removeEventListener("change", closeDrawer);
 }, []);

 const alerts=health==="offline"?1:0;
 const logout=async()=>{try{await fetch(`${(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1").replace(/\/$/, "")}/auth/logout`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:"{}"});}finally{window.location.reload();}};
 const sidebarContents = <><div className="sidebar-top"><a className="brand" href="/" aria-label="Anres Store admin"><Brand/></a><button className="icon-button sidebar-close" onClick={()=>setMenuOpen(false)} aria-label="Tutup menu"><Icon name="close"/></button></div><div className="workspace"><span className="workspace-icon"><Icon name="grid" size={19}/></span><span><strong>Ruang kerja</strong><small>Anres Store admin</small></span><span className="workspace-dot"/></div><nav className="side-nav" aria-label="Menu utama">{["Utama","Operasional","Pelanggan","Analisis","Pengaturan"].map(group=><div className="nav-group" key={group}><p>{group}</p>{sections.filter(item=>item.group===group).map(item=><button key={item.id} onClick={()=>select(item.id)} className={`nav-item ${active===item.id?"active":""}`} aria-current={active===item.id?"page":undefined}><Icon name={item.icon}/><span className="nav-item-label">{item.label}</span>{item.id==="conversations"&&<SupportTicketBadge/>}{item.id==="system"&&alerts>0?<span className="notification-count" aria-label={`${alerts} masalah terdeteksi`}>{alerts}</span>:active===item.id?<span className="nav-indicator"/>:null}</button>)}</div>)}</nav><div className="sidebar-bottom"><div className="sidebar-footer"><span className="avatar" aria-hidden="true">A</span><span className="sidebar-profile-copy"><strong>Admin Anres</strong><small>Akses administrator</small></span></div></div></>;
 return <div className="admin-shell">
 <aside className="sidebar sidebar-desktop" aria-label="Navigasi admin">{sidebarContents}</aside>
 <dialog ref={drawer} id="admin-navigation" className="sidebar sidebar-drawer" aria-label="Navigasi admin"
   onCancel={event=>{event.preventDefault();setMenuOpen(false);}}
   onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)setMenuOpen(false);}}}>
   {menuOpen&&sidebarContents}
 </dialog>
 <div className="main-wrap"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" onClick={()=>setMenuOpen(true)} aria-label="Buka menu" aria-controls="admin-navigation" aria-expanded={menuOpen}><Icon name="menu"/></button><span className="breadcrumb"><span className="breadcrumb-root">Ruang kerja</span> <span className="breadcrumb-divider">/</span> <strong>{current.label}</strong></span></div><div className="topbar-right"><span className="setup-pill"><span/> Akses administrator</span><button className="text-button" onClick={() => void logout()}>Keluar</button><SupportNotifications onNavigate={select} systemAlerts={alerts}/><span className="top-avatar">A</span></div></header>
 <motion.main id="main" className="main-content" key={active} initial={reducedMotion ? false : {opacity:0}} animate={{opacity:1}} transition={{duration:reducedMotion ? 0 : 0.15}}>
 {active === "overview" && <TransactionAnalytics overview onNavigate={select}/>}
 {active === "assistant" && <AssistantWorkspace onNavigate={select}/>}
 {active === "reports" && <TransactionAnalytics onNavigate={select}/>}
 {["orders","payments","fulfillment"].includes(active) && <OrderWorkspace view={active as "orders"|"payments"|"fulfillment"} initialStatus={transactionStatus}/>}
 {active === "tasks" && <TaskWorkspace/>}
 {active === "apps" && <PremiumWorkspace/>}
 {active === "catalog" && <ProductWorkspace/>}
 {active === "vouchers" && <VoucherWorkspace/>}
 {active === "reviews" && <ReviewWorkspace/>}
 {["customers","conversations","support"].includes(active) && <><div className="workspace-heading"><div><h1>{current.label}</h1><p>{current.description}</p></div></div><ServiceWorkspace kind={active==="support"?"conversations":active as "customers"|"conversations"}/></>}
 {["access"].includes(active) && <><div className="workspace-heading"><div><h1>{current.label}</h1><p>{current.description}</p></div></div><Operations section={active}/></>}
 {active === "system" && <SystemMonitor samples={samples} refresh={refresh} fetching={fetching}/>}
 </motion.main></div></div>;
}
