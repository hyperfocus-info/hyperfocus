import { normalizeUploadthingBaseUrl } from "./uploadthing-url";
import { asRecord } from "@hyperfocus/utilities/records";
import type { FileRouter } from "uploadthing/types";
import { generateUploadDropzone } from "@uploadthing/solid";



type UploadResponse = { url?: string; ufsUrl?: string };


export type UploadWidgetProps = {
  endpoint?: string;
  accept?: Record<string, string[]>;
  class?: string;
  url?: string;
  onUploaded: (url: string) => void;
  onError?: (error: Error) => void;
};



const readEnv = (key: string) =>
  typeof process !== "undefined" ? process.env[key] : undefined;



const uploadThingUrl = (props: UploadWidgetProps) => {
  const explicitWindowUrl = asRecord(globalThis).PADPILOT_UPLOADTHING_URL;
  const windowUrl = typeof explicitWindowUrl === "string" ? explicitWindowUrl : undefined;
  const envUrl = readEnv("UPLOADTHING_URL");
  const fallbackUrl = "http://localhost:3000";
  const resolvedUrl = props.url ?? windowUrl ?? envUrl ?? fallbackUrl;
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
  const TypedUploadDropzone = generateUploadDropzone<FileRouter>({ url: resolvedUrl });

  return (
    <TypedUploadDropzone
      endpoint={resolvedEndpoint}
      class={props.class}
      config={{
        appendOnPaste: false,
        mode: "auto",
      }}

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
