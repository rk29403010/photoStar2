import { Eye, Undo2 } from "lucide-react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Button } from "../Primitives";

type PhotoBeforeChangeButtonProps = {
  readonly disabled: boolean;
  readonly pressed: boolean;
  readonly onPressedChange: (pressed: boolean) => void;
};

function isHoldKey(key: string): boolean {
  return key === " " || key === "Enter";
}

function releasePointer(event: PointerEvent<HTMLButtonElement>): void {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

function BeforeChangeIcon() {
  return (
    <span aria-hidden="true" className="relative size-5 shrink-0">
      <Eye className="absolute inset-0" size={20} strokeWidth={1.8} />
      <Undo2
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        size={9}
        strokeWidth={2.6}
      />
    </span>
  );
}

export function PhotoBeforeChangeButton(props: PhotoBeforeChangeButtonProps) {
  const release = () => props.onPressedChange(false);
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    props.onPressedChange(true);
  };
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    releasePointer(event);
    release();
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!isHoldKey(event.key)) {
      return;
    }
    event.preventDefault();
    props.onPressedChange(true);
  };
  const keyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!isHoldKey(event.key)) {
      return;
    }
    event.preventDefault();
    release();
  };
  const pressedClass = props.pressed
    ? "border-brand-accent/40 bg-brand-accent/20 text-brand-accent"
    : "";
  return (
    <Button
      type="button"
      variant="secondary"
      aria-pressed={props.pressed}
      className={`touch-manipulation select-none ${pressedClass}`}
      disabled={props.disabled}
      title="Hold to show the image before this change"
      onBlur={release}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      onLostPointerCapture={release}
      onPointerCancel={pointerUp}
      onPointerDown={pointerDown}
      onPointerUp={pointerUp}
    >
      <BeforeChangeIcon />
      Show without change
    </Button>
  );
}
