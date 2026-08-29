import { JSX } from "solid-js";
import { UploadDropzone } from "@uploadthing/solid";

type UploadResponse = { url?: string; ufsUrl?: string };

type UploadDropzoneComponent = (props: Record<string, unknown>) => JSX.Element;

export type UploadWidgetProps = {
  endpoint?: string;
  accept?: Record<string, string[]>;
  class?: string;
  url?: string;
  onUploaded: (url: string) => void;
  onError?: (error: Error) => void;
};

const UploadDropzoneAny = UploadDropzone as unknown as UploadDropzoneComponent;

const readEnv = (key: string) =>
  typeof process !== "undefined" ? process.env[key] : undefined;

const normalizeUploadthingBaseUrl = (value: string) => {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/api/uploadthing")) {
    return trimmed.slice(0, -"/api/uploadthing".length);
  }
  return trimmed;
};

const uploadThingUrl = (props: UploadWidgetProps) => {
  const explicitWindowUrl = (globalThis as { PADPILOT_UPLOADTHING_URL?: string }).PADPILOT_UPLOADTHING_URL;
  const envUrl = readEnv("UPLOADTHING_URL");
  const fallbackUrl = "http://localhost:3000";
  const resolvedUrl = props.url ?? explicitWindowUrl ?? envUrl ?? fallbackUrl;
  if (!resolvedUrl) {
    throw new Error("UploadThing URL could not be resolved. Provide `props.url`, `PADPILOT_UPLOADTHING_URL`, or `UPLOADTHING_URL`.");
  }

  return normalizeUploadthingBaseUrl(resolvedUrl);
};

const resolveEndpoint = (props: UploadWidgetProps) => {
  const envEndpoint = readEnv("UPLOADTHING_ENDPOINT");
  return props.endpoint ?? envEndpoint ?? "moduleUpload";
};

export function upload(props: UploadWidgetProps) {
  const resolvedEndpoint = resolveEndpoint(props);
  const resolvedUrl = uploadThingUrl(props);

  return (
    <UploadDropzoneAny
      endpoint={resolvedEndpoint}
      class={props.class}
      config={{
        appendOnPaste: false,
        mode: "auto",
      }}
      url={resolvedUrl}
      onClientUploadComplete={(files: UploadResponse[] | undefined) => {
        const firstFile = files?.[0];
        const url = firstFile?.ufsUrl ?? firstFile?.url;
        if (!url) {
          props.onError?.(new Error("UploadThing completed but no file URL was returned."));
          return;
        }

        props.onUploaded(url);
      }}
      onUploadError={(error: Error) => {
        const detail = new Error(`UploadThing upload failed at endpoint "${resolvedEndpoint}": ${error.message}`);
        props.onError?.(detail);
      }}
      appearance={{
        button:
          "background: var(--pp-accent-color); color: var(--pp-on-accent, #031018); border: 1px solid var(--pp-accent-color);",
        allowedContent:
          "color: color-mix(in srgb, var(--pp-text-color, #d9e4ff), #ffffff 20%); font-size: 12px;",
        label: "color: var(--pp-text-color, #d9e4ff);",
      }}
    />
  );
}
