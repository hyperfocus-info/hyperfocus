type WritableFile = {
  write(value: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
};

type FileHandle = {
  getFile(): Promise<File>;
  createWritable(): Promise<WritableFile>;
};

export type DirectoryHandle = {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandle>;
};

export async function writeDirectoryFile(directory: DirectoryHandle, name: string, bytes: Uint8Array) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(new Uint8Array(bytes));
    await writable.close();
  } catch (error) {
    await writable.abort?.();
    throw error;
  }
}
