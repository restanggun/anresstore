"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { AdminInput, AdminTextarea } from "./form-controls";
import { adminRequest } from "./workspace-api";
import styles from "./assistant-registry.module.css";

type Option = { id: string; label: string; description: string };
type Policy = { enabled: boolean; roleIds: string[] };
type SkillPolicy = Policy & { guidance?: string; example?: string };
type Agent = Policy & { id: string; name: string; instructions: string; tools: string[] };
type Sop = { id: string; title: string; body: string };
type Role = { id: string; name: string };
type RegistryData = {
  revision: number; skills: Record<string, SkillPolicy>; agents: Agent[]; sops: Sop[]; roles: Role[];
  definitions: Option[]; tavily: boolean;
  runs: { id: string; created_at: string; steps: { tool: string; label: string; status: string }[] }[];
};
const defaultPolicy: Policy = { enabled: true, roleIds: [] };
const tabs = ["Skill", "Agent", "SOP", "Riwayat & tes"] as const;
const statusLabel = (status: string) => status === "review" ? "Menunggu konfirmasi" : status === "done" ? "Selesai" : "Gagal";
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function AssistantRegistryWorkspace() {
  const [editorKey, setEditorKey] = useState(0);
  const query = useQuery({
    queryKey: ["assistant-registry"],
    queryFn: ({ signal }) => adminRequest("assistant/registry", "GET", undefined, signal) as Promise<RegistryData>,
    retry: false, refetchOnWindowFocus: false,
  });
  return (
    <section>
      <div className="workspace-heading"><div><h1>Skill & Agent</h1><p>Kelola kemampuan, cara kerja agent, dan referensi SOP Asisten Anres.</p></div></div>
      {query.data ? <RegistryEditor key={editorKey} data={query.data} onReload={async () => {
        const result = await query.refetch();
        if (result.isSuccess) setEditorKey(value => value + 1);
      }} />
        : query.error ? <p className="workspace-error" role="alert">{query.error.message}</p> : <p role="status">Memuat pengaturan…</p>}
    </section>
  );
}

function PolicyEditor({ value, roles, onChange }: { value: Policy; roles: Role[]; onChange: (policy: Policy) => void }) {
  const allRoles = [...roles, ...value.roleIds.filter(id => !roles.some(role => role.id === id)).map(id => ({ id, name: `Role yang sudah dihapus (${id})` }))];
  return (
    <fieldset className={styles.fieldset}>
      <legend>Akses</legend>
      <label className={styles.check}><AdminInput type="checkbox" checked={value.enabled} onChange={event => onChange({ ...value, enabled: event.target.checked })} /> Aktif</label>
      <p>Tanpa pilihan role, akses mengikuti izin bawaan. Pilihan role membatasi akses lebih lanjut.</p>
      {allRoles.map(role => <label key={role.id} className={styles.check}>
        <AdminInput type="checkbox" checked={value.roleIds.includes(role.id)} onChange={event => onChange({
          ...value, roleIds: event.target.checked ? [...value.roleIds, role.id] : value.roleIds.filter(id => id !== role.id),
        })} /> {role.name}
      </label>)}
    </fieldset>
  );
}

function RegistryEditor({ data, onReload }: { data: RegistryData; onReload: () => Promise<void> }) {
  const query = useQueryClient();
  const [revision, setRevision] = useState(data.revision);
  const [skills, setSkills] = useState(data.skills);
  const [agents, setAgents] = useState(data.agents);
  const [sops, setSops] = useState(data.sops);
  const [tab, setTab] = useState<(typeof tabs)[number]>("Skill");
  const [skillId, setSkillId] = useState(data.definitions[0]?.id ?? "");
  const [agentId, setAgentId] = useState(data.agents[0]?.id ?? "");
  const [sopId, setSopId] = useState(data.sops[0]?.id ?? "");
  const [sampleAgent, setSampleAgent] = useState("");
  const [sample, setSample] = useState("");
  const skill = data.definitions.find(item => item.id === skillId);
  const agent = agents.find(item => item.id === agentId);
  const sop = sops.find(item => item.id === sopId);
  const changeAgent = (patch: Partial<Agent>) => setAgents(current => current.map(item => item.id === agentId ? { ...item, ...patch } : item));
  const changeSop = (patch: Partial<Sop>) => setSops(current => current.map(item => item.id === sopId ? { ...item, ...patch } : item));
  const save = useMutation({
    mutationFn: (snapshot: Pick<RegistryData, "revision" | "skills" | "agents" | "sops">) => adminRequest("assistant/registry", "POST", snapshot) as Promise<{ revision: number }>,
    onSuccess: async (response, snapshot) => {
      setRevision(response.revision);
      query.setQueryData<RegistryData>(["assistant-registry"], current => current ? { ...current, ...snapshot, revision: response.revision } : current);
      await query.invalidateQueries({ queryKey: ["admin-assistant"] });
    },
  });
  const test = useMutation({
    mutationFn: () => adminRequest("assistant/registry/test", "POST", { agent: sampleAgent, text: sample.trim() }) as Promise<{ steps: { tool: string; label: string }[] }>,
  });

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="group" aria-label="Bagian pengaturan">
          {tabs.map(item => <button type="button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}
        </div>
        {tab !== "Riwayat & tes" && <button type="submit" form="assistant-registry-form" className="primary-button" disabled={save.isPending}>{save.isPending ? "Menyimpan…" : "Simpan pengaturan"}</button>}
      </div>
      {save.isSuccess && <p className="workspace-feedback" role="status">Pengaturan tersimpan · Versi {revision}</p>}
      {save.error && <div className="workspace-error" role="alert">{save.error.message} <button type="button" onClick={() => void onReload()}>Muat pengaturan terbaru</button></div>}
      {tab === "Riwayat & tes" ? (
        <div className={styles.body}>
          <form className={styles.fields} onSubmit={event => { event.preventDefault(); if (sample.trim()) test.mutate(); }}>
            <h2>Tes rencana agent</h2>
            <p>Model memilih langkah dari pengaturan tersimpan. Tes tidak memanggil tool atau menyimpan perubahan toko.</p>
            <label>Agent<select value={sampleAgent} onChange={event => setSampleAgent(event.target.value)}><option value="">Pilih otomatis</option>{data.agents.filter(item => item.enabled).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Perintah contoh<AdminTextarea required rows={3} maxLength={3000} value={sample} onChange={event => setSample(event.target.value)} placeholder="Ringkas transaksi tujuh hari terakhir" /></label>
            <button className="primary-button" disabled={test.isPending || !sample.trim()}>{test.isPending ? "Menguji…" : "Tes rencana"}</button>
            {test.error && <p className="workspace-error" role="alert">{test.error.message}</p>}
            {test.data && <ol aria-label="Rencana hasil tes">{test.data.steps.map(step => <li key={step.tool}>{step.label}</li>)}</ol>}
          </form>
          <div className={styles.fields}>
            <h2>Riwayat eksekusi terbaru</h2>
            <button type="button" className="outline-button" onClick={() => void query.invalidateQueries({ queryKey: ["assistant-registry"] })}>Muat ulang riwayat</button>
            {!data.runs.length && <p>Belum ada eksekusi tercatat.</p>}
            {data.runs.map(run => <details key={run.id}>
              <summary><time dateTime={run.created_at}>{new Date(run.created_at).toLocaleString("id-ID")}</time> · {run.steps.length} langkah</summary>
              <ol>{run.steps.map(step => <li key={step.tool}>{step.label} · {statusLabel(step.status)}</li>)}</ol>
            </details>)}
          </div>
        </div>
      ) : <form id="assistant-registry-form" className={styles.body} onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate({ revision, skills, agents, sops }); }}>
        {tab === "Skill" && <div className={styles.fields}>
          <label>Skill<select value={skillId} onChange={event => setSkillId(event.target.value)}>{data.definitions.map(item => <option key={item.id} value={item.id}>{item.label}{skills[item.id]?.enabled === false ? " (nonaktif)" : ""}</option>)}</select></label>
          {skill && <>
            <p>{skill.description}</p>
            {skill.id === "web_search" && <p>{data.tavily ? "Tavily terkonfigurasi di API." : "Tavily belum terkonfigurasi di API."}</p>}
            <label>Petunjuk penggunaan<AdminTextarea rows={3} maxLength={360} value={skills[skill.id]?.guidance ?? ""} onChange={event =>
              setSkills(current => ({ ...current, [skill.id]: { ...(current[skill.id] ?? defaultPolicy), guidance: event.target.value } }))} /></label>
            <label>Contoh perintah<AdminInput maxLength={160} value={skills[skill.id]?.example ?? ""} onChange={event =>
              setSkills(current => ({ ...current, [skill.id]: { ...(current[skill.id] ?? defaultPolicy), example: event.target.value } }))} /></label>
            <PolicyEditor value={skills[skill.id] ?? defaultPolicy} roles={data.roles} onChange={policy => setSkills(current => ({ ...current, [skill.id]: { ...current[skill.id], ...policy } }))} />
          </>}
        </div>}
        {tab === "Agent" && <div className={styles.fields}>
          <button type="button" className="outline-button" disabled={agents.length >= 24} onClick={() => {
            const id = newId("custom");
            setAgents(current => [...current, { id, name: "Agent baru", instructions: "", tools: [data.definitions[0]!.id], ...defaultPolicy, enabled: false }]);
            setAgentId(id);
          }}><Plus size={15} aria-hidden="true" /> Tambah agent</button>
          <label>Agent<select value={agentId} onChange={event => setAgentId(event.target.value)}>{agents.map(item => <option key={item.id} value={item.id}>{item.name}{!item.enabled ? " (nonaktif)" : ""}</option>)}</select></label>
          {agent && <>
            <label>Nama agent<AdminInput required maxLength={60} value={agent.name} onChange={event => changeAgent({ name: event.target.value })} /></label>
            <label>Instruksi kerja<AdminTextarea rows={4} maxLength={1200} value={agent.instructions} onChange={event => changeAgent({ instructions: event.target.value })} /></label>
            <PolicyEditor value={agent} roles={data.roles} onChange={changeAgent} />
            <fieldset className={styles.fieldset}><legend>Skill yang boleh dijalankan</legend>
              {data.definitions.map(item => <label key={item.id} className={styles.check}><AdminInput type="checkbox" checked={agent.tools.includes(item.id)}
                onChange={event => changeAgent({ tools: event.target.checked ? [...agent.tools, item.id] : agent.tools.filter(id => id !== item.id) })} /> {item.label}</label>)}
            </fieldset>
            {agent.id.startsWith("custom-") && <button type="button" className="outline-button" onClick={() => {
              setAgents(current => current.filter(item => item.id !== agentId)); setAgentId(agents.find(item => item.id !== agentId)?.id ?? "");
            }}>Hapus agent dari draf pengaturan</button>}
          </>}
        </div>}
        {tab === "SOP" && <div className={styles.fields}>
          <button type="button" className="outline-button" disabled={sops.length >= 30} onClick={() => {
            const id = newId("sop");
            setSops(current => [...current, { id, title: "SOP baru", body: "" }]); setSopId(id);
          }}><Plus size={15} aria-hidden="true" /> Tambah SOP</button>
          <label>SOP<select value={sopId} onChange={event => setSopId(event.target.value)}><option value="">Pilih SOP</option>{sops.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
          {sop && <>
            <label>Judul SOP<AdminInput required maxLength={100} value={sop.title} onChange={event => changeSop({ title: event.target.value })} /></label>
            <label>Isi SOP<AdminTextarea required rows={7} maxLength={2400} value={sop.body} onChange={event => changeSop({ body: event.target.value })} /></label>
            <button type="button" className="outline-button" onClick={() => {
              setSops(current => current.filter(item => item.id !== sopId)); setSopId("");
            }}>Hapus SOP dari draf pengaturan</button>
          </>}
        </div>}
      </form>}
    </div>
  );
}
