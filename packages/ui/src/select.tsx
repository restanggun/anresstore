"use client";
import { Children, isValidElement, useRef, useState, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

function text(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child)).join("");
}
function options(node: ReactNode): { value: string; label: string; disabled: boolean }[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>(child)) return [];
    return child.type === "option" ? [{ value: String(child.props.value ?? text(child.props.children)), label: text(child.props.children), disabled: !!child.props.disabled }] : options(child.props.children);
  });
}
export function CustomSelect({ children, value, onChange, className = "", disabled, required, name, id, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | undefined>();
  const items = options(children);
  const placeholder = items.find(item => !item.value)?.label || "Pilih…";
  return <Select.Root value={String(value ?? "")} disabled={disabled} required={required} name={name} onOpenChange={open => { if (open) setContainer(trigger.current?.closest("dialog") || undefined); }} onValueChange={next => {
    const selected = next === "__anres_empty__" ? "" : next;
    onChange?.({ target: { value: selected }, currentTarget: { value: selected } } as ChangeEvent<HTMLSelectElement>);
  }}><Select.Trigger ref={trigger} id={id} aria-label={props["aria-label"]} aria-describedby={props["aria-describedby"]} className={`anres-select-trigger ${className}`}><Select.Value placeholder={placeholder}/><Select.Icon><ChevronDown size={16}/></Select.Icon></Select.Trigger><Select.Portal container={container}><Select.Content className="anres-select-content" position="popper" sideOffset={6} collisionPadding={12}><Select.ScrollUpButton className="anres-select-scroll"><ChevronUp size={15}/></Select.ScrollUpButton><Select.Viewport className="anres-select-viewport">{items.map(item => <Select.Item key={item.value} value={item.value || "__anres_empty__"} disabled={item.disabled} className="anres-select-item"><Select.ItemText>{item.label}</Select.ItemText><Select.ItemIndicator><Check size={15}/></Select.ItemIndicator></Select.Item>)}</Select.Viewport><Select.ScrollDownButton className="anres-select-scroll"><ChevronDown size={15}/></Select.ScrollDownButton></Select.Content></Select.Portal></Select.Root>;
}
