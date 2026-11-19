"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AssistantChanges } from "./assistant-changes";
import { adminRequest, rupiah } from "./workspace-api";
import styles from "./assistant-workspace.module.css";

const labels = { name: "Nama varian", price: "Harga jual", description: "Deskripsi", active: "Visibilitas" };
type VariantValue = string | number | boolean;
export type AssistantVariant = { name: string; product: string; sku: string; category: string; price: number; active: boolean };
export type AssistantProposalData = {
  id: string;
  expiresAt: string;
  variant: AssistantVariant;
  changes: { key: keyof typeof labels; before: VariantValue; after: VariantValue }[];
};
export type AssistantBatchData = { id: string; expiresAt: string; rows: (AssistantVariant & {
  after?: number; changes?: { key: keyof typeof labels; before: VariantValue; after: VariantValue }[];
})[] };
export type AssistantActionData = { id: string; expiresAt: string; title: string; summary: string; changes?: { label: string; before: string; after: string }[] };

function valueText(value: VariantValue) {
  if (typeof value === "number") return rupiah(value);
  if (typeof value === "boolean") return value ? "Tampil di website" : "Disembunyikan";
  return value || "Kosong";
}

function useAssistantApproval(path: string) {
  const query = useQueryClient();
  return useMutation({
    mutationFn: () => adminRequest(path, "POST", { confirm: true }) as Promise<{ published: boolean }>,
    onSuccess: async () => {
      await Promise.all([
        query.invalidateQueries({ queryKey: ["product-management"] }),
        query.invalidateQueries({ queryKey: ["product-promotions"] }),
        query.invalidateQueries({ queryKey: ["vouchers"] }),
        query.invalidateQueries({ queryKey: ["admin-catalog"] }),
      ]);
    },
  });
}

export function AssistantProposal({ proposal, onApplied }: { proposal: AssistantProposalData; onApplied?: (published: boolean) => void }) {
  const apply = useAssistantApproval(`assistant/proposals/${proposal.id}/apply`);
  return (
    <section className={styles.proposal} aria-label="Draf perubahan varian">
      <div><strong>{proposal.variant.name}</strong><small>{proposal.variant.product} / {proposal.variant.sku} / {proposal.variant.category}</small></div>
      <AssistantChanges rows={proposal.changes.map(({ key, before, after }) => ({
        label: labels[key], before: valueText(before), after: valueText(after),
      }))} />
      {apply.isSuccess ? (
        <p role="status">{apply.data.published ? "Perubahan disimpan. Publikasi katalog admin aktif." : "Perubahan disimpan. Publikasi katalog admin belum aktif."}</p>
      ) : (
        <div className={styles.proposalActions}>
          <small>Berlaku sampai <time dateTime={proposal.expiresAt}>{new Date(proposal.expiresAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</time></small>
          <button type="button" className="primary-button" disabled={apply.isPending} onClick={() =>
            apply.mutate(undefined, { onSuccess: result => onApplied?.(result.published) })}>
            {apply.isPending ? "Menyimpan…" : "Terapkan perubahan"}
          </button>
        </div>
      )}
      {apply.error && <p className={styles.chatError} role="alert">{apply.error.message}</p>}
    </section>
  );
}

export function AssistantBatch({ batch }: { batch: AssistantBatchData }) {
  const apply = useAssistantApproval(`assistant/batches/${batch.id}/apply`);
  const rows = batch.rows.flatMap(row => row.changes?.length
    ? row.changes.map(change => ({ label: `${row.name} · ${row.sku} · ${labels[change.key]}`, before: valueText(change.before), after: valueText(change.after) }))
    : [{ label: `${row.name} · ${row.sku} · ${row.category}`, before: rupiah(row.price), after: rupiah(row.after ?? row.price) }]);
  return (
    <section className={styles.proposal} aria-label="Draf perubahan beberapa varian">
      <AssistantChanges rows={rows} />
      {apply.isSuccess ? <p role="status">{apply.data.published ? "Seluruh perubahan varian disimpan." : "Perubahan varian disimpan. Publikasi katalog admin belum aktif."}</p>
        : <div className={styles.proposalActions}>
          <small>Berlaku sampai <time dateTime={batch.expiresAt}>{new Date(batch.expiresAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</time></small>
          <button type="button" className="primary-button" disabled={apply.isPending} onClick={() => apply.mutate()}>
            {apply.isPending ? "Menyimpan…" : `Terapkan ${batch.rows.length} varian`}
          </button>
        </div>}
      {apply.error && <p className={styles.chatError} role="alert">{apply.error.message}</p>}
    </section>
  );
}

export function AssistantActionCard({ action }: { action: AssistantActionData }) {
  const apply = useAssistantApproval(`assistant/actions/${action.id}/apply`);
  return <section className={styles.proposal} aria-label="Draf pengelolaan katalog">
    <div><strong>{action.title}</strong><small>{action.summary}</small></div>
    {!!action.changes?.length && <AssistantChanges rows={action.changes} />}
    {apply.isSuccess ? <p role="status">Perubahan disimpan{apply.data.published ? " dan diterbitkan." : ". Publikasi katalog admin belum aktif."}</p>
      : <div className={styles.proposalActions}>
        <small>Berlaku sampai <time dateTime={action.expiresAt}>{new Date(action.expiresAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</time></small>
        <button type="button" className="primary-button" disabled={apply.isPending} onClick={() => apply.mutate()}>
          {apply.isPending ? "Menyimpan…" : "Terapkan perubahan"}
        </button>
      </div>}
    {apply.error && <p className={styles.chatError} role="alert">{apply.error.message}</p>}
  </section>;
}
