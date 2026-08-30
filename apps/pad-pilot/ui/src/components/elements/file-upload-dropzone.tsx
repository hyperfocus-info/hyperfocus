import { JSX, createSignal, splitProps } from "solid-js";
import styles from "./styles/file-upload-dropzone.stylex";

type FileWithPath = File & {
  path?: string;
};

export type FileUploadSelection = {
  files: File[];
  paths: string[];
};

const DROP_TEXT_TYPES = ["text/uri-list", "text/plain"] as const;
export const MAX_FILE_UPLOAD_SELECTION_ITEMS = 64;
const MAX_DROP_TEXT_LENGTH = 64 * 1024;
const MAX_DROPPED_PATH_LENGTH = 4096;

function normalizeDroppedPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_DROPPED_PATH_LENGTH || trimmed.startsWith("#")) {
    return null;
  }

  if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\") || trimmed.startsWith("/")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "file:") {
      return null;
    }
    let path = decodeURIComponent(url.pathname);
    if (url.host.length > 0) {
      path = `//${url.host}${path}`;
    }
    if (/^\/[a-zA-Z]:\//.test(path)) {
      path = path.slice(1);
    }
    return path;
  } catch {
    return null;
  }
}

function collectDroppedPaths(dataTransfer: Pick<DataTransfer, "getData"> | null | undefined) {
  if (!dataTransfer) {
    return [];
  }

  const paths = new Set<string>();
  for (const type of DROP_TEXT_TYPES) {
    const payload = dataTransfer.getData(type);
    if (!payload) {
      continue;
    }
    for (const line of payload.slice(0, MAX_DROP_TEXT_LENGTH).split(/\r?\n/)) {
      const path = normalizeDroppedPath(line);
      if (path) {
        paths.add(path);
        if (paths.size >= MAX_FILE_UPLOAD_SELECTION_ITEMS) {
          return [...paths];
        }
      }
    }
  }
  return [...paths];
}

export function extractFileUploadSelection(
  filesInput: FileList | readonly File[] | null | undefined,
  dataTransfer?: Pick<DataTransfer, "getData"> | null,
) {
  const files: File[] = [];
  if (filesInput) {
    const fileCount = Math.min(filesInput.length, MAX_FILE_UPLOAD_SELECTION_ITEMS);
    for (let index = 0; index < fileCount; index += 1) {
      const file = filesInput[index];
      if (file) {
        files.push(file);
      }
    }
  }
  const paths = new Set<string>();

  for (const file of files) {
    const path = (file as FileWithPath).path?.trim();
    if (path && path.length <= MAX_DROPPED_PATH_LENGTH) {
      paths.add(path);
    }
  }

  for (const path of collectDroppedPaths(dataTransfer)) {
    paths.add(path);
    if (paths.size >= MAX_FILE_UPLOAD_SELECTION_ITEMS) {
      break;
    }
  }

  return {
    files,
    paths: [...paths],
  };
}

export type FileUploadInputProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> & {
  onSelection?: (selection: FileUploadSelection) => void;
};

/** FileUploadInput owns hidden/native file-input semantics for custom upload surfaces. */
export function FileUploadInput(props: FileUploadInputProps) {
  const [local, others] = splitProps(props, ["onSelection"]);
  return (
    <input
      {...others}
      type="file"
      onChange={(event) => {
        const selection = extractFileUploadSelection(event.currentTarget.files);
        if (selection.files.length > 0 || selection.paths.length > 0) {
          local.onSelection?.(selection);
        }
      }}
    />
  );
}

/**
 * Props for FileUploadDropzone.
 */
type FileUploadDropzoneProps = {
  /** Input accept filter string */
  accept?: string;
  /** Whether multiple files are accepted */
  multiple?: boolean;
  /** Disables all interactions when true */
  disabled?: boolean;
  /** Optional class applied to root container */
  class?: string;
  /** Helper hint text shown on overlay */
  hint?: string;
  /** Callback fired when files are selected or dropped */
  onFilesSelected?: (files: File[]) => void;
  /** Callback fired with both browser File objects and resolved native file paths */
  onSelection?: (selection: FileUploadSelection) => void;
  /** Optional native browse hook. Return `true` when the request was handled. */
  onBrowseRequest?: () => boolean | void;
  /** Optional dropzone content (for example waveform preview) */
  children?: JSX.Element;
};

/**
 * FileUploadDropzone provides click and drag-drop file selection.
 */
export function FileUploadDropzone(props: FileUploadDropzoneProps) {
  let inputRef: HTMLInputElement | undefined;
  const [isDragging, setDragging] = createSignal(false);

  const requestBrowse = () => {
    if (props.disabled) {
      return;
    }
    const browseHandled = props.onBrowseRequest?.();
    if (browseHandled) {
      return;
    }
    inputRef?.click();
  };

  const publishSelection = (extracted: FileUploadSelection) => {
    if (props.disabled) {
      return;
    }
    const selection = props.multiple
      ? extracted
      : {
          files: extracted.files.slice(0, 1),
          paths: extracted.paths.slice(0, 1),
        };
    if (selection.files.length === 0 && selection.paths.length === 0) {
      return;
    }

    props.onSelection?.(selection);
    if (selection.files.length > 0) {
      props.onFilesSelected?.(selection.files);
    }
  };

  const onDrop: JSX.EventHandlerUnion<HTMLDivElement, DragEvent> = (event) => {
    event.preventDefault();
    setDragging(false);
    publishSelection(extractFileUploadSelection(event.dataTransfer?.files ?? null, event.dataTransfer ?? null));
  };

  return (
    <div
      role="button"
      tabindex={props.disabled ? -1 : 0}
      class={`${styles.dropzone} ${isDragging() ? styles["is-dragging"] : ""} ${props.disabled ? styles.disabled : ""} ${props.class ?? ""}`.trim()}
      onClick={requestBrowse}
      onKeyDown={(event) => {
        if (props.disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          requestBrowse();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!props.disabled) setDragging(true);
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!props.disabled) {
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        if (event.currentTarget === event.target) {
          setDragging(false);
        }
      }}
      onDrop={onDrop}
      aria-disabled={props.disabled}
      aria-label="Upload audio file"
    >
      <FileUploadInput
        ref={inputRef}
        class={styles.input}
        accept={props.accept}
        multiple={props.multiple}
        disabled={props.disabled}
        onSelection={publishSelection}
      />
      {props.children}
      <div class={styles.overlay}>
        <span class={styles.hint}>{props.hint ?? "Drop file or click to browse"}</span>
      </div>
    </div>
  );
}

