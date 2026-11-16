import { requireElement } from "../../utils/require-element";
import { expect, it } from "bun:test";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { createUiTest } from "../../../../utils/tests/test-harness";
import { PAD_PILOT_OVERLAY_ROOT_ID } from "./overlay-root";
import { SearchableCombobox, filterSearchableComboboxItems, resolveSearchableComboboxItemId } from "./searchable-combobox";

createUiTest("SearchableCombobox", () => {
  it("filters and sorts options using the shared ordering rules", () => {
    const items = [
      { id: "c", label: "User Bass", kind: "user" },
      { id: "b", label: "Factory Pad", kind: "factory", description: "Wide texture", keywords: ["synth", "dreamy"] },
      { id: "a", label: "Fav User", favorite: true, kind: "user" },
    ];

    expect(filterSearchableComboboxItems(items, "").map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(filterSearchableComboboxItems(items, "pad").map((item) => item.id)).toEqual(["b"]);
    expect(filterSearchableComboboxItems(items, "texture").map((item) => item.id)).toEqual(["b"]);
    expect(filterSearchableComboboxItems(items, "synth").map((item) => item.id)).toEqual(["b"]);
    expect(resolveSearchableComboboxItemId(items, "Factory Pad")).toBe("b");
    expect(resolveSearchableComboboxItemId(items, "b")).toBe("b");
  });

  it("opens, filters, and selects items through public callbacks", () => {
    let selectedId = "";
    const Demo = () => {
      const items = [
        { id: "default", label: "Default", description: "Factory preset" },
        { id: "user-1", label: "User Lead", favorite: true },
      ];
      const [query, setQuery] = createSignal("");
      const [open, setOpen] = createSignal(false);
      return (
        <SearchableCombobox
          items={items}
          query={query()}
          open={open()}
          placeholder="Search presets"
          emptyText="No matches"
          selectedId={selectedId}
          onQueryChange={setQuery}
          onOpenChange={setOpen}
          onSelect={(id) => {
            selectedId = id;
          }}
        />
      );
    };

    render(() => <Demo />);

    const input = screen.getByRole("combobox", { name: "Search options" });
    const toggle = screen.getByRole("button", { name: "Browse options" });
    expect(toggle.getAttribute("title")).toBeNull();
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).not.toBeNull();
    expect(document.getElementById(PAD_PILOT_OVERLAY_ROOT_ID)?.contains(screen.getByRole("listbox"))).toBe(true);

    fireEvent.input(input, { currentTarget: { value: "User" }, target: { value: "User" } });
    expect(screen.getByRole("option", { name: /User Lead/ })).not.toBeNull();

    fireEvent.click(screen.getByRole("option", { name: /User Lead/ }));
    expect(selectedId).toBe("user-1");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("selects the active option from keyboard navigation", () => {
    let selectedId = "";
    const Demo = () => {
      const [query, setQuery] = createSignal("");
      const [open, setOpen] = createSignal(false);
      return (
        <SearchableCombobox
          items={[
            { id: "first", label: "First" },
            { id: "second", label: "Second" },
          ]}
          query={query()}
          open={open()}
          placeholder="Search presets"
          emptyText="No matches"
          onQueryChange={setQuery}
          onOpenChange={setOpen}
          onSelect={(id) => {
            selectedId = id;
          }}
        />
      );
    };

    render(() => <Demo />);

    const input = screen.getByRole("combobox", { name: "Search options" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toContain("first");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(selectedId).toBe("first");
    expect((requireElement(input, HTMLInputElement)).value).toBe("First");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("cycles closed options with the mouse wheel", () => {
    let selectedId = "first";
    const Demo = () => {
      const [query, setQuery] = createSignal("First");
      return (
        <SearchableCombobox
          items={[
            { id: "first", label: "First" },
            { id: "second", label: "Second" },
            { id: "third", label: "Third" },
          ]}
          query={query()}
          open={false}
          placeholder="Search presets"
          emptyText="No matches"
          selectedId={selectedId}
          onQueryChange={setQuery}
          onOpenChange={() => {}}
          onSelect={(id) => {
            selectedId = id;
          }}
        />
      );
    };

    render(() => <Demo />);

    const input = screen.getByRole("combobox", { name: "Search options" });
    fireEvent.wheel(input, { deltaY: 100 });
    expect(selectedId).toBe("second");
    expect((requireElement(input, HTMLInputElement)).value).toBe("Second");

    fireEvent.wheel(input, { deltaY: -100 });
    expect(selectedId).toBe("first");
    expect((requireElement(input, HTMLInputElement)).value).toBe("First");
  });

  it("closes on outside pointerdown and Escape", () => {
    const Demo = () => {
      const [query, setQuery] = createSignal("");
      const [open, setOpen] = createSignal(false);
      return (
        <SearchableCombobox
          items={[{ id: "default", label: "Default" }]}
          query={query()}
          open={open()}
          placeholder="Search presets"
          emptyText="No matches"
          onQueryChange={setQuery}
          onOpenChange={setOpen}
          onSelect={() => {}}
        />
      );
    };

    render(() => <Demo />);

    const input = screen.getByRole("combobox", { name: "Search options" });
    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).not.toBeNull();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.focus(input);
    expect(screen.getByRole("listbox")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes controlled popover when disabled", () => {
    const Demo = () => {
      const [query, setQuery] = createSignal("");
      const [open, setOpen] = createSignal(false);
      const [disabled, setDisabled] = createSignal(false);
      return (
        <>
          <button type="button" onClick={() => setDisabled((value) => !value)}>Toggle disabled</button>
          <SearchableCombobox
            disabled={disabled()}
            items={[{ id: "default", label: "Default" }]}
            query={query()}
            open={open()}
            placeholder="Search presets"
            emptyText="No matches"
            onQueryChange={setQuery}
            onOpenChange={setOpen}
            onSelect={() => {}}
          />
        </>
      );
    };

    render(() => <Demo />);

    fireEvent.focus(screen.getByRole("combobox", { name: "Search options" }));
    expect(screen.getByRole("listbox")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Toggle disabled" }));
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Toggle disabled" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
