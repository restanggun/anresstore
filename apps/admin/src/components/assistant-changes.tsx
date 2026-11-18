import styles from "./assistant-workspace.module.css";

export function AssistantChanges({ rows }: { rows: { label: string; before: string; after: string }[] }) {
  return (
    <table className={styles.changes}>
      <caption>Tinjau perubahan</caption>
      <thead><tr><th scope="col">Bagian</th><th scope="col">Sebelum</th><th scope="col">Sesudah</th></tr></thead>
      <tbody>
        {rows.map(({ label, before, after }) => (
          <tr key={label}><th scope="row">{label}</th><td>{before}</td><td>{after}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
