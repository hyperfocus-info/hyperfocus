const processorImplementationFiles = [
  "../core/pad-pilot-processor-internal.cpp",
  "../core/pad-pilot-processor-internal.h",
  "../core/pad-pilot-processor.cpp",
  "../core/pad-pilot-processor-bridge.cpp",
  "../core/pad-pilot-processor-modules.cpp",
  "../core/pad-pilot-processor-persistence.cpp",
  "../core/pad-pilot-processor-runtime.cpp",
] as const;

export const readProcessorSource = async () => {
  const sources = await Promise.all(
    processorImplementationFiles.map((path) => Bun.file(new URL(path, import.meta.url)).text()),
  );
  return sources.join("\n");
};
