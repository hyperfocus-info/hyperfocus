/** @jsxImportSource solid-js */
import type { JSX } from "solid-js";
import { Button, type buttonVariants } from "./primitives/button";

type ActionButtonProps = {
  tooltip: string;
  tooltipDisabled?: boolean;
  disabledReason?: string;
  icon?: JSX.Element;
  children?: JSX.Element;
  class?: string;
  classList?: Record<string, boolean | undefined>;
  wrapperClass?: string;
  ariaLabel?: string;
  ariaBusy?: boolean;
  type?: "button" | "submit";
  variant?: NonNullable<Parameters<typeof buttonVariants>[0]>["variant"];
  size?: NonNullable<Parameters<typeof buttonVariants>[0]>["size"];
  disabled?: boolean;
  dataTourId?: string;
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
};

export function ActionButton(props: ActionButtonProps) {
  const tooltipText = () => (props.disabled && props.disabledReason ? props.disabledReason : props.tooltip);

  return (
    <Button
      class={props.class}
      classList={props.classList}
      tooltip={tooltipText()}
      tooltipDisabled={props.tooltipDisabled}
      tooltipTriggerClass={props.wrapperClass}
      type={props.type}
      variant={props.variant}
      size={props.size}
      disabled={props.disabled}
      data-tour-id={props.dataTourId}
      aria-label={props.ariaLabel ?? props.tooltip}
      aria-busy={props.ariaBusy || undefined}
      aria-description={props.disabled && props.disabledReason ? props.disabledReason : undefined}
      onClick={props.onClick}
    >
      {props.icon}
      {props.children}
    </Button>
  );
}

export function ActionStatus(props: { message: string; actionLabel: string; tooltip: string; disabled?: boolean;
  disabledReason?: string; onAction: () => void }) {
  return <div role="status"><span>{props.message}</span><ActionButton tooltip={props.tooltip} type="button" size="sm"
    variant="secondary" disabled={props.disabled} disabledReason={props.disabledReason}
    onClick={props.onAction}>{props.actionLabel}</ActionButton></div>;
}
