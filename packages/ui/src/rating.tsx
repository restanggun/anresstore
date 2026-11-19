"use client";

import { Star } from "lucide-react";

const stars = [1, 2, 3, 4, 5];
const ratingFormat = new Intl.NumberFormat("id-ID");

function RatingStar({ value, position, size }: { value: number; position: number; size: number }) {
  const fill = Math.min(1, Math.max(0, value - position + 1));
  return <span className="ui-rating-star" aria-hidden="true">
    <Star size={size} fill={fill === 1 ? "currentColor" : "none"}/>
    {fill > 0 && fill < 1 && <Star size={size} className="ui-rating-fill" fill="currentColor"
      style={{ clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` }}/>}
  </span>;
}

export function RatingStars({ value, size = 15 }: { value: number; size?: number }) {
  return <span className="ui-rating-stars" role="img" aria-label={`${ratingFormat.format(value)} dari 5 bintang`}>
    {stars.map(position => <RatingStar key={position} value={value} position={position} size={size}/>)}
  </span>;
}

export function RatingInput({ name, value, onChange, disabled, label = "Rating produk" }: {
  name: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
}) {
  return <fieldset className="ui-rating-input" disabled={disabled}>
    <legend>{label}</legend>
    <div className="ui-rating-choices">
      {stars.map(position => <div className="ui-rating-choice" key={position}>
        <RatingStar value={value} position={position} size={26}/>
        {[position - 0.5, position].map(option => <label key={option}>
          <input className="sr-only" type="radio" name={name} value={option} required
            checked={value === option} onChange={() => onChange(option)}/>
          <span className="sr-only">{ratingFormat.format(option)} bintang</span>
        </label>)}
      </div>)}
    </div>
    <small>{ratingFormat.format(value)} dari 5 bintang</small>
  </fieldset>;
}
