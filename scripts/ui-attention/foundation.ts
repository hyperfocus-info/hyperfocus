import type { Rule } from "eslint";

type Node = { type: string; [key: string]: unknown };
const isNode = (value: unknown): value is Node => !!value && typeof value === "object" && "type" in value && typeof value.type === "string";
const node = (value: unknown): Node | undefined => isNode(value) ? value : undefined;
const key = (value: unknown) => { const item = node(value); return typeof item?.name === "string" ? item.name : typeof item?.value === "string" ? item.value : ""; };
const value = (item: unknown) => node(item)?.value;

function textSize(item: unknown, shorthand: boolean): number | undefined {
  const literal = value(item);
  if (typeof literal === "number" && !shorthand) return literal;
  if (typeof literal !== "string") return;
  const match = literal.trim().match(shorthand ? /^(?:normal\s+|bold\s+|italic\s+|[1-9]00\s+)*(\d*\.?\d+)(px|rem)(?:[\s/]|$)/ : /^(\d*\.?\d+)(px|rem)$/);
  if (match) return Number(match[1]) * (match[2] === "rem" ? 16 : 1);
}

function undersizedText(item: unknown, shorthand: boolean): boolean {
  const candidate = node(item);
  if (candidate?.type === "ObjectExpression" && Array.isArray(candidate.properties)) return candidate.properties.some(property => undersizedText(node(property)?.value, shorthand));
  const size = textSize(item, shorthand);
  return size !== undefined && size > 0 && size < 12;
}

function literalForeground(item: unknown): boolean {
  const candidate = node(item);
  if (candidate?.type === "ObjectExpression" && Array.isArray(candidate.properties)) return candidate.properties.some(property => literalForeground(node(property)?.value));
  const color = value(item);
  return typeof color === "string" && /^(?:#[\da-f]{3,8}|(?:rgb|hsl)a?\(.+\)|[a-z]+)$/i.test(color) && !["inherit", "currentcolor", "transparent"].includes(color.toLowerCase());
}

function adaptiveSurface(item: unknown): boolean {
  const candidate = node(item);
  if (!candidate) return false;
  if (candidate.type === "Literal" && typeof candidate.value === "string") return /var\(--(?:hf-color-)?(?:accent|danger|warning|info|success|selection)(?:[,)]|-)/.test(candidate.value);
  if (candidate.type === "MemberExpression") return ["accent", "accentStrong", "danger", "dangerStrong", "warning", "warningStrong", "info", "infoStrong", "success", "successStrong", "selection"].includes(key(candidate.property));
  if (candidate.type === "ObjectExpression" && Array.isArray(candidate.properties)) return candidate.properties.some(property => adaptiveSurface(node(property)?.value));
  return false;
}

function conditionalValues(item: unknown) {
  const candidate = node(item);
  if (candidate?.type !== "ObjectExpression" || !Array.isArray(candidate.properties)) return undefined;
  return new Map(candidate.properties.map(node).filter((property): property is Node => !!property)
    .map(property => [key(property.key), property.value]));
}

/** Match ordinary StyleX state maps; arbitrary selector intersections still need rendered checks. */
function unpairedForeground(background: unknown, foreground: unknown): boolean {
  const backgrounds = conditionalValues(background);
  const foregrounds = conditionalValues(foreground);
  if (!backgrounds && !foregrounds) return adaptiveSurface(background) && literalForeground(foreground);
  const states = new Set(["default", ...(backgrounds?.keys() ?? []), ...(foregrounds?.keys() ?? [])]);
  return [...states].some(state => unpairedForeground(
    backgrounds ? backgrounds.get(state) ?? backgrounds.get("default") : background,
    foregrounds ? foregrounds.get(state) ?? foregrounds.get("default") : foreground,
  ));
}

/** Bounded to presentation owners in eslint.config.mjs; computed styles remain a host check. */
export const foundationRule: Rule.RuleModule = {
  meta: { type: "problem", schema: [], docs: { description: "Keep control text readable and foregrounds paired with adaptive surfaces" }, messages: {
    typeFloor: "Operational UI text must use a semantic type role at or above caption (12px / 0.75rem). Keep a specific, documented exception for spatial artwork.",
    foreground: "An adaptive accent/status surface needs its semantic foreground token. A literal text color bypasses theme contrast validation.",
  } },
  create(context) {
    return {
      Property(raw) {
        const property = node(raw);
        const name = key(property?.key);
        if (name !== "fontSize" && name !== "font-size" && name !== "font") return;
        if (undersizedText(property?.value, name === "font")) context.report({ node: raw, messageId: "typeFloor" });
      },
      ObjectExpression(raw) {
        const object = node(raw);
        if (!Array.isArray(object?.properties)) return;
        const properties = object.properties.map(node).filter((property): property is Node => !!property);
        const background = properties.find(property => ["background", "backgroundColor", "background-color"].includes(key(property.key)));
        const foreground = properties.find(property => key(property.key) === "color");
        if (!background || !foreground || !adaptiveSurface(background.value)) return;
        if (unpairedForeground(background.value, foreground.value)) {
          context.report({ node: raw, messageId: "foreground" });
        }
      },
    };
  },
};
