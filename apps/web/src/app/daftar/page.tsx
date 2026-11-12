import type { Metadata } from "next";
import { AuthForm } from "@/components/storefront/auth-form";
export const metadata: Metadata = {title:"Daftar | Anres Store",robots:{index:false,follow:false}};
export default function Page() {return <AuthForm mode="register"/>;}
