import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createUiTest } from "../../../utils/tests/test-harness";
import { CreateModuleModal } from "./create-module-modal";

createUiTest("CreateModuleModal", () => {
  it("renders inside the shared modal shell when open", () => {
    render(() => <CreateModuleModal open onClose={() => undefined} onCreate={() => undefined} />);

    expect(screen.getByRole("dialog", { name: "Create New Module" })).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "Module name" })).not.toBeNull();
    expect((screen.getByRole("button", { name: "Create module" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("submits a trimmed module name through the public callback", () => {
    let savedName = "";
    render(() => <CreateModuleModal open onClose={() => undefined} onCreate={(name) => { savedName = name; }} />);

    fireEvent.input(screen.getByRole("textbox", { name: "Module name" }), { target: { value: "  Neon Reverb  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create module" }));
    expect(savedName).toBe("Neon Reverb");
  });
});
