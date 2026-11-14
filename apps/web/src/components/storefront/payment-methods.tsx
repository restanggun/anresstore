"use client";
import { useId, useState } from "react";
import { Check, CreditCard } from "lucide-react";
import { channelFee, paymentGroup, paymentGroups, type PaymentChannel } from "@/lib/payment-channels";
import "./payment-methods.css";

function ChannelLogo({ channel }: { channel: PaymentChannel }) {
  const [failed, setFailed] = useState(false);
  return <span className="payment-method-logo" aria-hidden="true">{channel.iconUrl && !failed
    ? <img src={channel.iconUrl} alt="" width={88} height={32} referrerPolicy="no-referrer" onError={() => setFailed(true)}/>
    : <CreditCard size={26}/>}</span>;
}

export function PaymentMethods({ channels, value, onChange, disabled }: { channels: PaymentChannel[]; value: string; onChange: (code: string) => void; disabled: boolean }) {
  const id = useId();
  return <fieldset className="payment-methods" disabled={disabled}>
    <legend>Metode pembayaran</legend>
    {paymentGroups.map(group => {
      const items = channels.filter(channel => paymentGroup(channel) === group);
      if (!items.length) return null;
      return <section className="payment-method-group" key={group} aria-label={group}>
        <h3>{group}</h3><div className="payment-method-grid">{items.map(channel => <label className="payment-method" key={channel.code} data-selected={value === channel.code}>
          <input type="radio" name={`${id}-method`} value={channel.code} checked={value === channel.code} onChange={() => onChange(channel.code)} required/>
          <ChannelLogo channel={channel}/><span className="payment-method-copy"><strong>{channel.name}</strong><small>{channelFee(channel)}</small></span>
          <span className="payment-method-check" aria-hidden="true">{value === channel.code && <Check size={14}/>}</span>
        </label>)}</div>
      </section>;
    })}
  </fieldset>;
}
