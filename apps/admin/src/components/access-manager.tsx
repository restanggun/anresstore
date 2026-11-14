"use client";
import { CustomSelect } from "./custom-select";
import { useEffect, useState, type FormEvent } from "react";

type Role = { id: string; name: string; permissions: string[]; categories: string[]; product_slugs: string[] };
type Assignment = { user_id: string; role_id: string | null; is_super: boolean };
type Audit = { actor_id: string; action: string; target: string; created_at: string };
const api = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/v1").replace(/\/$/, "");
const permissionOptions = [["orders.read", "Lihat pesanan"], ["orders.write", "Proses pesanan manual"], ["payments.read", "Lihat pembayaran"], ["support.read", "Lihat bantuan"], ["support.write", "Ubah status dan balas tiket CS"], ["customers.read", "Lihat pelanggan"], ["customers.write", "Ubah nama pelanggan"], ["products.read", "Lihat produk"], ["products.write", "Ubah produk dan harga"]] as const;
const categoryOptions = [["game", "Game"], ["prepaid", "PPOB"], ["apps", "App premium"], ["social", "Sosmed"], ["tasks", "Joki tugas"]] as const;
async function request(path: string, body?: unknown) {
  const response = await fetch(`${api}/admin/${path}`, { method: body === undefined ? "GET" : "POST", credentials: "include", cache: "no-store", headers: body === undefined ? {} : { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof result.message === "string" ? result.message : "Permintaan gagal.");
  return result;
}
const emptyRole = (): Role => ({ id: "", name: "", permissions: [], categories: [], product_slugs: [] });
export function AccessManager() {
  const [roles, setRoles] = useState<Role[]>([]); const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [role, setRole] = useState<Role>(emptyRole); const [userId, setUserId] = useState(""); const [choice, setChoice] = useState("");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function load() { try { const data = await request("access"); setRoles(data.roles); setAssignments(data.assignments); setAudit(data.audit); } catch (error) { setMessage((error as Error).message); } }
  useEffect(() => { void load(); }, []);
  function toggle(field: "permissions" | "categories", value: string) { setRole(current => ({ ...current, [field]: current[field].includes(value) ? current[field].filter(v => v !== value) : [...current[field], value] })); }
  async function saveRole(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); try { await request("roles", { ...role, product_slugs: role.product_slugs.map(s => s.trim()).filter(Boolean), id: role.id || crypto.randomUUID() }); setRole(emptyRole()); await load(); setMessage("Role disimpan."); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  async function assign(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); try { await request("assignments", { userId: userId.trim(), roleId: choice === "super" || choice === "remove" ? null : choice, superAdmin: choice === "super" }); setUserId(""); setChoice(""); await load(); setMessage("Akses diperbarui."); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  return <section className="panel access-workspace"><h2>Role dan administrator</h2><p>Hanya super admin dapat mengelola akses. Perubahan berlaku saat permintaan berikutnya.</p>{message && <p role="status" className="ops-notice">{message}</p>}
    <h3>Role</h3><ul>{roles.map(item => <li key={item.id}>{item.name} <button className="text-button" onClick={() => setRole(item)}>Edit izin</button></li>)}</ul>
    <form className="admin-login-form" onSubmit={saveRole}><label>Nama role<input required maxLength={80} value={role.name} onChange={e => setRole({ ...role, name: e.target.value })} /></label><fieldset><legend>Izin</legend>{permissionOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={role.permissions.includes(value)} onChange={() => toggle("permissions", value)} /> {label}</label>)}</fieldset><fieldset><legend>Cakupan layanan</legend>{categoryOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={role.categories.includes(value)} onChange={() => toggle("categories", value)} /> {label}</label>)}</fieldset><label>Slug sublayanan, pisahkan dengan koma<input value={role.product_slugs.join(",")} placeholder="Contoh: mobile-legends, free-fire" onChange={e => setRole(current => ({ ...current, product_slugs: e.target.value.split(",") }))} /></label><p>Kosongkan slug untuk akses semua produk dalam kategori yang dipilih. Pesanan, pembayaran, dan bantuan memerlukan akses semua layanan dan tanpa batas slug.</p><div><button className="ops-button" disabled={busy}>Simpan role</button> {role.id && <button type="button" className="text-button" onClick={() => setRole(emptyRole())}>Buat role baru</button>}</div></form>
    <h3>Tambahkan atau ubah akses akun</h3><p>Masukkan UUID akun Supabase yang sudah ada. Akses super admin memberi seluruh izin, termasuk pengelolaan administrator.</p><form className="admin-login-form" onSubmit={assign}><label>UUID akun<input required value={userId} onChange={e => setUserId(e.target.value)} /></label><label>Role<CustomSelect required value={choice} onChange={e => setChoice(e.target.value)}><option value="">Pilih role</option><option value="super">Super admin</option>{roles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="remove">Cabut akses yang ditetapkan</option></CustomSelect></label><button className="ops-button" disabled={busy}>Simpan akses</button></form>
    <h3>Administrator yang ditetapkan</h3><ul>{assignments.map(item => <li key={item.user_id}>{item.user_id} — {item.is_super ? "Super admin" : roles.find(r => r.id === item.role_id)?.name || "Role tidak ditemukan"}</li>)}</ul><p>Akun super admin awal yang dikonfigurasi di server tidak tercantum di daftar ini dan hanya dapat dicabut lewat konfigurasi server.</p>
    <h3>50 percobaan perubahan terakhir</h3><p>Log mencatat percobaan sebelum perubahan, bukan hasil keberhasilannya.</p><ul>{audit.map((entry, index) => <li key={`${entry.created_at}-${index}`}>{new Date(entry.created_at).toLocaleString("id-ID")} · {entry.action} · {entry.target} · {entry.actor_id}</li>)}</ul>
  </section>;
}
