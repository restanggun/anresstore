import { useRef, type ComponentPropsWithRef, type MouseEvent } from "react";

type AdminDrawerProps = Omit<ComponentPropsWithRef<"dialog">,
  "closedby" | "onCancel" | "onClick" | "onPointerDown" | "onPointerCancel"> & {
  dismissDisabled?: boolean;
};

function isBackdrop(event: MouseEvent<HTMLDialogElement>) {
  const dialog = event.currentTarget;
  if ("closedBy" in dialog || event.target !== dialog) return false;

  const { left, right, top, bottom } = dialog.getBoundingClientRect();
  return event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom;
}

export function AdminDrawer({ dismissDisabled = false, onClose, ...props }: AdminDrawerProps) {
  const pressedBackdrop = useRef(false);

  return <dialog
    {...props}
    closedby={dismissDisabled ? "none" : "any"}
    onCancel={event => {
      if (dismissDisabled) event.preventDefault();
    }}
    onClose={event => {
      pressedBackdrop.current = false;
      onClose?.(event);
    }}
    onPointerDown={event => {
      pressedBackdrop.current = !dismissDisabled && event.button === 0 && isBackdrop(event);
    }}
    onPointerCancel={() => { pressedBackdrop.current = false; }}
    onClick={event => {
      const startedOnBackdrop = pressedBackdrop.current;
      pressedBackdrop.current = false;
      if (!dismissDisabled && startedOnBackdrop && isBackdrop(event)) event.currentTarget.close();
    }}
  />;
}
