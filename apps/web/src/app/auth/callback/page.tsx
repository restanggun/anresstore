import { redirect } from "next/navigation";
export default function Callback() { redirect("/login?auth_error=callback"); }
