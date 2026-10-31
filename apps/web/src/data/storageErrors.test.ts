import { describe, expect, it } from "vitest";

import { describeStorageError, isQuotaError } from "./storageErrors";

function quotaError(): Error {
  const error = new Error("full");
  error.name = "QuotaExceededError";
  return error;
}

describe("isQuotaError", () => {
  it("recognises a quota error and one wrapped by Dexie", () => {
    const wrapped = Object.assign(new Error("abort"), { name: "AbortError", inner: quotaError() });
    expect(isQuotaError(quotaError())).toBe(true);
    expect(isQuotaError(wrapped)).toBe(true);
    expect(isQuotaError(new Error("x"))).toBe(false);
    expect(isQuotaError("QuotaExceededError")).toBe(false);
  });
});

describe("describeStorageError", () => {
  it("names what could not be saved", () => {
    expect(describeStorageError(quotaError(), "a gravação")).toBe(
      "O aparelho está sem espaço para guardar a gravação. Apague gravações ou PDFs que não usa mais.",
    );
    expect(describeStorageError(new Error("x"), "a música")).toBe("Não deu para guardar a música. Tente de novo.");
  });
});
