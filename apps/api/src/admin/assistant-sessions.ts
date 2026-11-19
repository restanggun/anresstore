import { HttpException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { uuid } from "../help/conversations.controller";
import { adminDb } from "./admin-store";
import { redactAssistantText } from "./assistant-model";

export type AssistantSessionAccess = {
  id: string; superAdmin: boolean; roleId: string | null;
  permissions: string[]; categories: string[]; productSlugs: string[];
};

type AssistantTurn = {
  id: string;
  user: { text: string; sentAt: string };
  reply: { text: string; sentAt: string; section?: string; model?: string; sources?: { title: string; url: string; checkedAt: string }[] };
};
type SessionSummary = { id: string; title: string; touched_at: string };
type Session = SessionSummary & { revision: number; turns: AssistantTurn[] };

const summaries = "id,title,touched_at";

function scope(access: AssistantSessionAccess) {
  const { superAdmin, roleId, permissions, categories, productSlugs } = access;
  return createHash("sha256").update(JSON.stringify([
    superAdmin, roleId, [...permissions].sort(), [...categories].sort(), [...productSlugs].sort(),
  ])).digest("hex");
}

function owned(access: AssistantSessionAccess, id?: string) {
  if (id !== undefined && !uuid(id)) throw new HttpException("Sesi chat tidak valid.", 422);
  return `?actor_id=eq.${encodeURIComponent(access.id)}&access_scope=eq.${scope(access)}${id ? `&id=eq.${id}` : ""}`;
}

export async function listAssistantSessions(access: AssistantSessionAccess, offset: number) {
  const rows = await adminDb<SessionSummary>("admin_assistant_sessions",
    `${owned(access)}&select=${summaries}&order=touched_at.desc,id.desc&limit=31&offset=${offset}`);
  return { sessions: rows.slice(0, 30), more: rows.length > 30 };
}

export async function createAssistantSession(access: AssistantSessionAccess) {
  const [session] = await adminDb<SessionSummary>("admin_assistant_sessions", `?select=${summaries}`, "POST",
    { actor_id: access.id, access_scope: scope(access) });
  if (!session) throw new HttpException("Sesi chat belum dapat dibuat.", 503);
  return session;
}

export async function getAssistantSession(access: AssistantSessionAccess, id: string) {
  const [session] = await adminDb<Session>("admin_assistant_sessions", `${owned(access, id)}&select=${summaries},revision,turns&limit=1`);
  if (!session) throw new HttpException("Sesi chat tidak ditemukan.", 404);
  return session;
}

export async function renameAssistantSession(access: AssistantSessionAccess, id: string, title: unknown) {
  if (typeof title !== "string" || !title.trim() || title.trim().length > 80 || /[\r\n\x00-\x1f]/.test(title)) {
    throw new HttpException("Isi judul sesi dengan maksimal 80 karakter.", 422);
  }
  const [session] = await adminDb<SessionSummary>("admin_assistant_sessions", `${owned(access, id)}&select=${summaries}`, "PATCH",
    { title: redactAssistantText(title.trim()).slice(0, 80) });
  if (!session) throw new HttpException("Sesi chat tidak ditemukan.", 404);
  return session;
}

export async function deleteAssistantSession(access: AssistantSessionAccess, id: string) {
  const [session] = await adminDb<Pick<SessionSummary, "id">>("admin_assistant_sessions", `${owned(access, id)}&select=id`, "DELETE");
  if (!session) throw new HttpException("Sesi chat tidak ditemukan.", 404);
  return { deleted: true };
}

export async function saveAssistantTurn(access: AssistantSessionAccess, session: Session, turn: AssistantTurn) {
  const title = turn.user.text.replace(/\s+/g, " ").slice(0, 75).trim() || "Chat baru";
  const [saved] = await adminDb<{ revision: number }>("rpc/append_admin_assistant_turn", "", "POST", {
    p_actor: access.id, p_scope: scope(access), p_session: session.id, p_revision: session.revision, p_title: title, p_turn: turn,
  });
  if (!saved) throw new HttpException("Sesi berubah di tab lain. Buka ulang sesi dan coba lagi.", 409);
}

export async function getAssistantMemory(actor: string) {
  const [memory] = await adminDb<{ note: string }>("admin_assistant_memory", `?actor_id=eq.${encodeURIComponent(actor)}&select=note&limit=1`);
  return { note: memory?.note ?? "" };
}

export async function saveAssistantMemory(actor: string, value: unknown) {
  if (typeof value !== "string" || value.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) {
    throw new HttpException("Catatan memori maksimal 1.000 karakter.", 422);
  }
  const note = redactAssistantText(value.trim()).slice(0, 1000);
  if (note) await adminDb("admin_assistant_memory", "", "POST", { actor_id: actor, note });
  else await adminDb("admin_assistant_memory", `?actor_id=eq.${encodeURIComponent(actor)}`, "DELETE");
  return { note };
}
