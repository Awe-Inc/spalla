import { externalValue } from "./externalValue";

const databaseFailed = externalValue(false);

export function watchDatabaseOpen(open: () => Promise<unknown>): Promise<void> {
  return open().then(
    () => databaseFailed.set(false),
    () => databaseFailed.set(true),
  );
}

export function useDatabaseFailed(): boolean {
  return databaseFailed.use();
}
