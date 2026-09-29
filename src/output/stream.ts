/** The slice of a Writable the output layer needs. `process.stdout` and a PassThrough both fit. */
export type OutStream = {
  write(chunk: string): unknown;
  isTTY?: boolean;
  columns?: number;
};

export type InStream = {
  isTTY?: boolean;
};
