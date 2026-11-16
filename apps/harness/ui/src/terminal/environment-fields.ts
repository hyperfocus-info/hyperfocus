import { type TerminalEnvVar } from "@hyperfocus/ai-core/protocol";

export function parseEnvText(input: string): TerminalEnvVar[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 64)
    .map((line) => {
      const [name, ...valueParts] = line.split("=");
      return {
        name,
        value: valueParts.join("="),
        secret: /\b(secret|token|key|password)\b/i.test(name)
      };
    })
    .filter((entry) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(entry.name));
}
