import { splitProps } from "solid-js";
import { Button, type ButtonProps } from "./button";

export type ToggleButtonProps = Omit<ButtonProps, "aria-pressed" | "value"> & {
  value: boolean;
};

export function ToggleButton(props: ToggleButtonProps) {
  const [local, others] = splitProps(props, ["value"]);
  return <Button {...others} aria-pressed={local.value} />;
}
