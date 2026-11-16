

export function normalizeGitStatusPath(path: string) {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

export function countDocumentMatches(lines: string[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return "0/0";
  }
  const count = lines.reduce((sum, line) => {
    const value = line.toLowerCase();
    let index = value.indexOf(needle);
    let matches = 0;
    while (index >= 0) {
      matches += 1;
      index = value.indexOf(needle, index + Math.max(needle.length, 1));
    }
    return sum + matches;
  }, 0);
  return count ? `1/${count}` : "0/0";
}

export function getWordAtPosition(line: string, column: number) {
  const position = Math.max(0, column - 1);
  const left = line.slice(0, position).match(/[A-Za-z_$][\w$]*$/)?.[0] ?? "";
  const right = line.slice(position).match(/^[A-Za-z_$][\w$]*/)?.[0] ?? "";
  return `${left}${right}`;
}

export function getCompletionPrefix(text: string, position: number) {
  return text.slice(0, position).match(/[A-Za-z_$][\w$]*$/)?.[0] ?? "";
}

export function getTextPosition(text: string, position: number) {
  const before = text.slice(0, position).split("\n");
  return { line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
}

export function applyCompletionAt(
  text: string,
  position: number,
  prefix: string,
  completion: string,
) {
  return `${text.slice(0, Math.max(0, position - prefix.length))}${completion}${text.slice(position)}`;
}

export function inferLanguage(name: string) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (extension === "tsx" || extension === "ts") {
    return "TypeScript";
  }
  if (extension === "jsx" || extension === "js") {
    return "JavaScript";
  }
  if (extension === "md") {
    return "Markdown";
  }
  if (extension === "json") {
    return "JSON";
  }
  return "Plain Text";
}

export function isIdeProjectSwitcherModKHotkey(hotkey: string) {
  return hotkey.toLowerCase().replace(/\s+/g, "") === "mod+k";
}

export function normalizeHotkeyKey(key: string) {
  return key.length === 1
    ? key.toLowerCase()
    : key.toLowerCase().replace(/^arrow/, "");
}
