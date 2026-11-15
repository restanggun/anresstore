from pathlib import Path

path = Path("apps/web/src/components/storefront/catalog.tsx")
source = path.read_text(encoding="utf-8")
replacements = [
    ("!target.trim() || !contact.trim()", '(kind!=="Aplikasi premium" && (!target.trim() || !contact.trim()))'),
    ('{liveKind && <><label>{kind === "Joki tugas"', '{liveKind && <>{kind!=="Aplikasi premium"&&<label>{kind === "Joki tugas"'),
    ('</label>{selectedLive?.fulfillmentMode === "manual"', '</label>}{selectedLive?.fulfillmentMode === "manual"'),
    ('<label>Nomor WhatsApp atau email<Input value={contact} onChange={e => setContact(e.target.value)} placeholder="Untuk informasi pesanan"/></label>', '{kind!=="Aplikasi premium"&&<label>Nomor WhatsApp atau email<Input value={contact} onChange={e => setContact(e.target.value)} placeholder="Untuk informasi pesanan"/></label>}'),
    ('<div><dt>{gameFlow ? "ID pemain" : "Tujuan / detail"}</dt><dd>{target}</dd></div>', '{kind!=="Aplikasi premium"&&<div><dt>{gameFlow ? "ID pemain" : "Tujuan / detail"}</dt><dd>{target}</dd></div>}'),
    ('<div><dt>Kontak</dt><dd>{contact || "Tidak diisi"}</dd></div>', '{kind!=="Aplikasi premium"&&<div><dt>Kontak</dt><dd>{contact || "Tidak diisi"}</dd></div>}'),
]
for old, new in replacements:
    if old not in source:
        raise RuntimeError(f"Missing premium catalog insertion point: {old[:50]}")
    source = source.replace(old, new)
path.write_text(source, encoding="utf-8")
