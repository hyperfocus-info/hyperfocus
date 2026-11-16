import { createDomSelectControl, type DomSelectControl } from "@hyperfocus/ui";
const definitions = {
  "#tilemap-tileset-select": {
    "label": "tilemap tileset select",
    "options": [],
    "value": ""
  },
  "#atlas-source-select": {
    "label": "atlas source select",
    "options": [],
    "value": ""
  },
  "#atlas-clip-select": {
    "label": "atlas clip select",
    "options": [],
    "value": ""
  },
  "#sequence-fps": {
    "label": "sequence fps",
    "options": [
      {
        "value": "24",
        "label": "24"
      },
      {
        "value": "30",
        "label": "30"
      },
      {
        "value": "60",
        "label": "60"
      }
    ],
    "value": "30"
  },
  "#sequence-speed": {
    "label": "sequence speed",
    "options": [
      {
        "value": ".5",
        "label": "0.5x"
      },
      {
        "value": "1",
        "label": "1x"
      },
      {
        "value": "1.5",
        "label": "1.5x"
      },
      {
        "value": "2",
        "label": "2x"
      }
    ],
    "value": "1"
  },
  "#sequence-channel": {
    "label": "sequence channel",
    "options": [
      {
        "value": "All",
        "label": "All"
      },
      {
        "value": "X",
        "label": "X"
      },
      {
        "value": "Y",
        "label": "Y"
      },
      {
        "value": "Scale",
        "label": "Scale"
      }
    ],
    "value": "All"
  },
  "#clip-cue-select": {
    "label": "clip cue select",
    "options": [],
    "value": ""
  },
  "#key-easing": {
    "label": "key easing",
    "options": [
      {
        "value": "linear",
        "label": "Linear"
      },
      {
        "value": "ease-in",
        "label": "Ease in"
      },
      {
        "value": "ease-out",
        "label": "Ease out"
      },
      {
        "value": "ease-in-out",
        "label": "Ease in + out"
      },
      {
        "value": "bounce",
        "label": "Bounce"
      }
    ],
    "value": "linear"
  },
  "#export-fps": {
    "label": "export fps",
    "options": [
      {
        "value": "30",
        "label": "30"
      },
      {
        "value": "60",
        "label": "60"
      }
    ],
    "value": "30"
  },
  "#export-codec": {
    "label": "export codec",
    "options": [
      {
        "value": "avc",
        "label": "H.264 · MP4"
      },
      {
        "value": "vp8",
        "label": "VP8 · WebM"
      },
      {
        "value": "vp9",
        "label": "VP9 · WebM"
      }
    ],
    "value": "avc"
  }
};
const controls = new Map<string, DomSelectControl>();
export function editorSelect(selector: string) {
 const cached = controls.get(selector); if (cached) return cached;
 const definition = Object.entries(definitions).find(([key]) => key === selector)?.[1];
 const element = document.querySelector<HTMLButtonElement>(selector);
 if (!definition || !element) throw new Error(`Missing Editor selection ${selector}`);
 const control = createDomSelectControl({ element, ariaLabel: element.getAttribute("aria-label") ?? definition.label, options: definition.options, value: definition.value });
 controls.set(selector, control);return control;
}
export function initializeEditorSelects() { for (const selector of Object.keys(definitions)) editorSelect(selector); }
export function selectEventValue(event: Event) {
 const target = event.currentTarget;
 if (!(target instanceof HTMLButtonElement) || target.dataset.selectValue === undefined) throw new Error("Expected Editor selection event");
 return target.dataset.selectValue;
}
