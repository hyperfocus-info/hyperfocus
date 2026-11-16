import type { Rule } from "eslint";

/** Structural guardrails for demonstrated embedded Module failures. Geometry and
 * delayed host acknowledgement are additionally exercised by the UI replays. */
export const padPilotModuleRule: Rule.RuleModule = {
  meta: { type: "problem", schema: [], messages: {
    selection: "Only syncFromHost may write activeModuleId. Request selection, then wait for host capabilities before mounting a Module.",
    show: "Solid Show render callbacks need an argument. Use _value => ...; a zero-argument child can run outside the intended boundary.",
    workspace: "Module entry views must use PadPilot.ModuleWorkspace so only bounded content regions can scroll.",
    rootScroll: "Module roots cannot scroll. Use ModuleWorkspace's content region or a bounded inner pane.",
    worker: "The bundled audio worker uses ESM codecs. Construct it with { type: 'module' } so it can load on first open.",
  } },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    let workspace = false;
    let moduleEntry = false;
    const keyName = (node: any) => node?.name ?? node?.value;
    return {
      NewExpression(node: any) {
        if (!filename.endsWith("/padpilot/mastering/service.ts") || node.callee.name !== "Worker") return;
        const options = node.arguments[1];
        if (!options?.properties?.some((property: any) => keyName(property.key) === "type" && property.value.value === "module")) context.report({ node, messageId: "worker" });
      },
      FunctionDeclaration(node: any) {
        if (/\/ui\/src\/modules\/[^/]+\/(?:index|[^/]+-module)\.tsx$/.test(filename) && /Module$/.test(node.id?.name ?? "")) moduleEntry = true;
      },
      CallExpression(node: any) {
        if (node.callee.name !== "setState") return;
        const first = node.arguments[0];
        const writesSelection = first?.value === "activeModuleId" || first?.type === "ObjectExpression" && first.properties.some((property: any) => keyName(property.key) === "activeModuleId");
        if (!writesSelection) return;
        const fromHost = context.sourceCode.getAncestors(node).some((parent: any) => parent.type === "VariableDeclarator" && parent.id.name === "syncFromHost");
        if (!fromHost) context.report({ node, messageId: "selection" });
      },
      JSXElement(node: any) {
        const name = node.openingElement.name;
        if (name.type === "JSXMemberExpression" && name.object.name === "PadPilot" && name.property.name === "ModuleWorkspace") workspace = true;
        if (name.name !== "Show") return;
        for (const child of node.children) {
          if (child.type === "JSXExpressionContainer" && child.expression.type === "ArrowFunctionExpression" && child.expression.params.length === 0) context.report({ node: child, messageId: "show" });
        }
      },
      Property(node: any) {
        if (!/\/modules\/.*\.stylex\.ts$/.test(filename) || !["root", "rootStyle", "moduleRootStyle"].includes(keyName(node.key))) return;
        const visit = (value: any) => {
          if (!value) return;
          if (value.type === "Literal" && ["auto", "scroll"].includes(value.value)) context.report({ node: value, messageId: "rootScroll" });
          if (value.type === "ObjectExpression") value.properties.forEach((property: any) => visit(property.value));
        };
        for (const property of node.value.properties ?? []) if (["overflow", "overflowX", "overflowY"].includes(keyName(property.key))) visit(property.value);
      },
      "Program:exit"(node) { if (moduleEntry && !workspace) context.report({ node, messageId: "workspace" }); },
    };
  },
};
