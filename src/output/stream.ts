export type OutStream = {
  write(chunk: string | Uint8Array): unknown;
  isTTY?: boolean;
  columns?: number;
};

export type InStream = {
  isTTY?: boolean;
};
