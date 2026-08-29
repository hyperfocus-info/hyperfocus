const editorImplementationFiles = [
  "../core/pad-pilot-editor-internal.h",
  "../core/pad-pilot-editor-internal.cpp",
  "../core/pad-pilot-editor.cpp",
  "../core/pad-pilot-editor-analyzer.cpp",
  "../core/pad-pilot-editor-bridge.cpp",
  "../core/pad-pilot-editor-file-import.cpp",
] as const;

export const readEditorSource = async () => {
  const sources = await Promise.all(
    editorImplementationFiles.map((path) => Bun.file(new URL(path, import.meta.url)).text()),
  );
  return sources.join("\n");
};
