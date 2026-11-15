import {Injectable,type OnModuleInit,type OnModuleDestroy} from "@nestjs/common";
import nodemailer from "nodemailer";
import {adminDb} from "../admin/admin-store";
type Job={id:string;claim_token:string;conversation_id:string;event:"new"|"in_progress"|"closed"|"rejected";recipient_role:"staff"|"customer";recipient_user_id:string|null;subject:string;rejection_reason:string|null};
const email=(value:string)=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
export function supportEmailContent(job:Job,origin:string){
 const title={new:"Tiket CS baru",in_progress:"Tiketmu diterima CS",closed:"Tiketmu selesai",rejected:"Tiketmu ditolak"}[job.event];
 const detail={new:"Ada pelanggan yang menunggu bantuan. Buka dashboard untuk menerima tiket dan memulai chat.",in_progress:"Tim CS sudah menerima tiketmu. Buka room chat untuk melanjutkan percakapan.",closed:"Tim CS menandai tiketmu selesai. Jika masih membutuhkan bantuan, kamu dapat membuat tiket baru.",rejected:"Tim CS menolak tiketmu."}[job.event];
 const url=new URL(job.recipient_role==="staff"?"/":"/profil#support-inbox",origin).toString();
 return {subject:`${title} · #${job.conversation_id.slice(0,8).toUpperCase()}`,text:`${title}\n\n${job.subject}\n\n${detail}${job.event==="rejected"&&job.rejection_reason?`\n\nAlasan: ${job.rejection_reason}`:""}\n\nBuka tiket: ${url}\n\nAnres Store\nEmail ini hanya untuk pembaruan tiket. Pesan chat tidak dikirim satu per satu melalui email.`};
}
@Injectable()
export class SupportEmailWorker implements OnModuleInit,OnModuleDestroy{
 private timer?:ReturnType<typeof setInterval>;
 private running=false;
 onModuleInit(){if(process.env.SUPPORT_EMAIL_ENABLED!=="true")return;this.timer=setInterval(()=>void this.run().catch(()=>console.warn("support.email_queue_unavailable")),30000);this.timer.unref();}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 private settings(){
  const host=process.env.SMTP_HOST,port=Number(process.env.SMTP_PORT||587),user=process.env.SMTP_USER,password=process.env.SMTP_PASSWORD,from=process.env.SMTP_FROM;
  const recipients=(process.env.SUPPORT_CS_EMAILS||"").split(",").map(s=>s.trim()).filter(Boolean);
  if(!host||!user||!password||!from||/[\r\n]/.test(from)||!Number.isInteger(port)||port<1||port>65535||!recipients.length||recipients.length>10||recipients.some(value=>!email(value)))throw new Error("Support SMTP configuration incomplete");
  const sender=from.match(/<([^<>]+)>/)?.[1]||from;if(!email(sender))throw new Error("Support SMTP sender invalid");
  return {host,port,user,password,from,recipients,domain:sender.split("@")[1]};
 }
 protected createTransport(config:{host:string;port:number;user:string;password:string}){
  return nodemailer.createTransport({host:config.host,port:config.port,secure:process.env.SMTP_SECURE==="true"||config.port===465,requireTLS:process.env.SMTP_SECURE!=="true"&&config.port!==465,auth:{user:config.user,pass:config.password},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,tls:{rejectUnauthorized:true}});
 }
 async run(){
  if(this.running||process.env.SUPPORT_EMAIL_ENABLED!=="true")return;this.running=true;
  try{
   const config=this.settings();
   const transport=this.createTransport(config);
   const jobs=await adminDb<Job>("rpc/claim_support_emails","","POST",{});
   try{for(const job of jobs){
    let providerId:string|null=null,success=false;
    try{
     let to=config.recipients;
     if(job.recipient_role==="customer"){
      if(!job.recipient_user_id)throw new Error("Missing recipient");
      const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||"",url=process.env.SUPABASE_URL?.replace(/\/$/,"");
      const response=await fetch(`${url}/auth/v1/admin/users/${job.recipient_user_id}`,{headers:{apikey:key,...(key.startsWith("sb_secret_")?{}:{Authorization:`Bearer ${key}`})},redirect:"error",signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error("Recipient lookup unavailable");
      const recipient=await response.json() as {email?:string;email_confirmed_at?:string};
      if(!recipient.email||!email(recipient.email)||!recipient.email_confirmed_at)throw new Error("Verified recipient unavailable");
      to=[recipient.email];
     }
     const origin=(job.recipient_role==="staff"?process.env.AUTH_ADMIN_ORIGIN:process.env.AUTH_APP_ORIGIN||process.env.AUTH_WEB_ORIGIN)||"http://localhost:3000";
     const content=supportEmailContent(job,origin);
     const result=await transport.sendMail({from:config.from,to,subject:content.subject,text:content.text,messageId:`<support-${job.id}@${config.domain}>`});
     if(result.rejected?.length)throw new Error("SMTP rejected recipient");
     providerId=result.messageId;success=true;
    }catch{console.warn("support.email_delivery_failed");}
    // A stale lease cannot acknowledge a job claimed by another worker.
    await adminDb("rpc/finish_support_email","","POST",{p_id:job.id,p_claim:job.claim_token,p_success:success,p_provider:providerId,p_error:success?null:"SMTP delivery or verified recipient unavailable"});
   }}finally{transport.close();}
  }finally{this.running=false;}
 }
}
