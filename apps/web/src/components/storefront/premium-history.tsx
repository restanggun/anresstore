"use client";
import { useEffect, useState } from "react";
import Link from "./domain-link";
import { apiUrl } from "@/lib/auth-api";
type Row={id:string;product_name:string;amount:number;status:string;created_at:string};
export function PremiumHistory(){
 const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState("");
 useEffect(()=>{const controller=new AbortController();void fetch(`${apiUrl}/premium-orders`,{credentials:"include",cache:"no-store",signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error();if(!controller.signal.aborted)setRows(data.rows)}).catch(()=>{if(!controller.signal.aborted)setError("Pesanan aplikasi belum dapat dimuat.")});return()=>controller.abort()},[]);
 return <section className="account-section"><h2>Pesanan aplikasi premium</h2>{error&&<p role="alert">{error}</p>}{rows.length?<div className="account-links">{rows.map(row=><Link key={row.id} className="account-link" href={`/premium-order/${row.id}`}><strong>{row.product_name}</strong><p>Rp{Number(row.amount).toLocaleString("id-ID")} · {row.status}</p></Link>)}</div>:!error?<p>Belum ada pesanan aplikasi premium.</p>:null}</section>;
}
