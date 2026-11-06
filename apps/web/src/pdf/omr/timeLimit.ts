export class TimeLimitError extends Error {
  constructor() {
    super("Passou do tempo limite.");
    this.name = "TimeLimitError";
  }
}

export function withinTime<T>(work: Promise<T>, limitMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeLimitError()), limitMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
