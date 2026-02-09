import { describe, it, expect } from "vitest";
import { sanitizePathParam, NeutronValidationError } from "../src/index.js";

describe("sanitizePathParam", () => {
  it("allows valid UUIDs", () => {
    expect(sanitizePathParam("5e25d2f4-9bca-4b7a-a1ad-2cf056100cb6", "txnId")).toBe(
      "5e25d2f4-9bca-4b7a-a1ad-2cf056100cb6"
    );
  });

  it("allows valid account IDs", () => {
    expect(sanitizePathParam("ne01-aae1e6622dea478e", "accountId")).toBe(
      "ne01-aae1e6622dea478e"
    );
  });

  it("allows valid country codes", () => {
    expect(sanitizePathParam("VN", "countryCode")).toBe("VN");
  });

  it("rejects path traversal", () => {
    expect(() => sanitizePathParam("../../admin", "txnId")).toThrow(NeutronValidationError);
  });

  it("rejects slashes", () => {
    expect(() => sanitizePathParam("abc/def", "txnId")).toThrow(NeutronValidationError);
  });

  it("rejects URL-encoded traversal", () => {
    expect(() => sanitizePathParam("..%2f..%2fadmin", "txnId")).toThrow(NeutronValidationError);
  });

  it("rejects empty string", () => {
    expect(() => sanitizePathParam("", "txnId")).toThrow(NeutronValidationError);
  });

  it("rejects null/undefined", () => {
    expect(() => sanitizePathParam(null as any, "txnId")).toThrow(NeutronValidationError);
    expect(() => sanitizePathParam(undefined as any, "txnId")).toThrow(NeutronValidationError);
  });

  it("rejects query string injection", () => {
    expect(() => sanitizePathParam("abc?admin=true", "txnId")).toThrow(NeutronValidationError);
  });

  it("rejects newline injection", () => {
    expect(() => sanitizePathParam("abc\r\nX-Injected: true", "txnId")).toThrow(
      NeutronValidationError
    );
  });
});
