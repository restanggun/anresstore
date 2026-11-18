"use client";
import { useState } from "react";
import { Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { currentPrice, money, type CatalogItem } from "@/lib/catalog";

function ServiceSelect({ id, value, placeholder, options, onChange }: {
  id: string; value: string; placeholder: string; onChange: (value: string) => void;
  options: { value: string; label: string; rate?: string }[];
}) {
  return <Select.Root value={value} onValueChange={onChange} disabled={!options.length}>
    <Select.Trigger id={id} className="social-select-trigger">
      <Select.Value placeholder={placeholder}/><Select.Icon asChild><ChevronDown size={18}/></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content className="social-select-menu" position="popper" sideOffset={6}>
        <Select.Viewport>
          {options.map(option => <Select.Item className="social-select-option" key={option.value} value={option.value}>
            <Select.ItemText>{option.label}</Select.ItemText>
            {option.rate && <small>{option.rate}</small>}
            <Select.ItemIndicator><Check size={16} aria-hidden="true"/></Select.ItemIndicator>
          </Select.Item>)}
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}

export function socialTargetValid(target: string, kind: CatalogItem["targetKind"], hosts?: readonly string[]) {
  const value = target.trim();
  const username = /^[a-z0-9._-]+$/i.test(value);
  let link = false;
  try {
    const url = new URL(value);
    const allowedHost = !hosts?.length || hosts.some(host => url.hostname === host || url.hostname.endsWith("." + host));
    link = allowedHost && url.protocol === "https:" && url.hostname.includes(".") &&
      !url.port && !url.username && !url.password && !/\s/.test(value);
  } catch { /* A username does not parse as a URL. */ }
  return kind === "username" ? username : kind === "link" ? link : username || link;
}

export function SocialOrderFields({ items, selected, target, quantity, onSelect, onTarget, onQuantity, state, onRetry, now }: {
  items: CatalogItem[]; selected?: CatalogItem; target: string; quantity: number;
  onSelect: (code: string) => void; onTarget: (target: string) => void; onQuantity: (quantity: number) => void;
  state: "loading" | "ready" | "error"; onRetry: () => void; now: number;
}) {
  const [section, setSection] = useState("");
  const sections = [...new Set(items.map(item => item.section))].sort((a, b) => a.localeCompare(b, "id"));
  const activeSection = selected?.section ?? (sections.includes(section) ? section : sections.length === 1 ? sections[0] : "");
  const options = items.filter(item => item.section === activeSection);
  const kind = selected?.targetKind ?? "either";
  const label = kind === "username" ? "Username akun" : kind === "link" ? "Link tujuan" : "Username atau link";
  const rate = selected ? currentPrice(selected, now) : 0;

  if (state === "loading") return <p role="status">Memuat layanan...</p>;
  if (state === "error") return <p role="alert">Layanan belum dapat dimuat. <button type="button" className="shop-text-button" onClick={onRetry}>Coba lagi</button></p>;
  if (!items.length) return <p role="status">Belum ada layanan untuk platform ini.</p>;

  return <div id="variant-heading" tabIndex={-1} className="social-order-fields">
    <label htmlFor="social-service-type">Jenis layanan</label>
    <ServiceSelect id="social-service-type" value={activeSection ?? ""} placeholder="Pilih jenis layanan"
      options={sections.map(value => ({ value, label: value }))}
      onChange={value => { if (value !== activeSection) { setSection(value); onSelect(""); } }}/>
    <label htmlFor="social-service">Layanan</label>
    <ServiceSelect id="social-service" value={selected?.code ?? ""} placeholder="Pilih layanan"
      options={options.map(item => ({ value: item.code, label: item.displayName, rate: money(currentPrice(item, now)) + " / 1.000" }))}
      onChange={onSelect}/>
    {selected && <>
      <label htmlFor="social-target">{label}
        <Input id="social-target" type="text" inputMode={kind === "link" ? "url" : "text"} autoCapitalize="none"
          spellCheck={false} autoComplete="off" maxLength={200} value={target} required
          placeholder={kind === "username" ? "namaakun" : kind === "link" ? "https://..." : "namaakun atau https://..."}
          aria-describedby="social-target-help" aria-invalid={!!target && !socialTargetValid(target, kind, selected.targetHosts)}
          onChange={event => onTarget(event.target.value)}/>
      </label>
      <p id="social-target-help">{kind === "username" ? "Masukkan username akun publik tanpa @." : kind === "link" ? "Tempel link HTTPS publik dari platform dan layanan yang dipilih." : "Masukkan username tanpa @ atau link HTTPS publik sesuai ketentuan layanan."}</p>
      {selected.description && selected.description !== selected.name && <p className="social-service-note">{selected.description}</p>}
      <label htmlFor="social-quantity">Jumlah {(/followers?/i.test(selected.section) ? "followers" : /likes?/i.test(selected.section) ? "likes" : /views?/i.test(selected.section) ? "views" : /subscribers?/i.test(selected.section) ? "subscriber" : "item")}
        <Input id="social-quantity" type="number" inputMode="numeric" min={selected.minimum ?? selected.serviceQuantity ?? 1}
          max={Math.min(selected.maximum ?? selected.serviceQuantity ?? 1, 10000000)}
          step={1} value={quantity || ""} aria-describedby="social-quantity-help" required onChange={event => onQuantity(Number(event.target.value))}/>
      </label>
      <p id="social-quantity-help">Min. {(selected.minimum ?? selected.serviceQuantity ?? 1).toLocaleString("id-ID")}, Maks. {Math.min(selected.maximum ?? selected.serviceQuantity ?? 1, 10000000).toLocaleString("id-ID")}. Tarif {money(rate)} per 1.000</p>
    </>}
  </div>;
}
