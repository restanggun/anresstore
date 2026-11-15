export const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1").replace(/\/$/, "");
export class AuthRequestError extends Error {
 constructor(message:string,readonly status:number) { super(message); }
}
export async function authRequest<T = {ok:boolean}>(path:string, body?:unknown):Promise<T> { const response=await fetch(`${apiUrl}/auth/${path}`,{method:body === undefined ? "GET" : "POST",credentials:"include",cache:"no-store",headers:body === undefined ? {} : {"Content-Type":"application/json"},...(body === undefined ? {} : {body:JSON.stringify(body)})}); const data=await response.json().catch(()=>({})); if(!response.ok) throw new AuthRequestError(typeof data.message === "string" ? data.message : "Autentikasi gagal.",response.status); return data as T; }
