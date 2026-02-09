import { NeutronValidationError } from "./errors.js";

/**
 * Sanitize a path parameter to prevent path traversal and injection.
 * Only allows alphanumeric characters, hyphens, underscores, and dots.
 */
export function sanitizePathParam(value: string, name: string): string {
  if (!value || typeof value !== "string") {
    throw new NeutronValidationError(`${name} is required and must be a non-empty string.`);
  }

  // Strip any path traversal or special characters
  const sanitized = value.replace(/[^a-zA-Z0-9\-_.]/g, "");

  if (sanitized !== value) {
    throw new NeutronValidationError(
      `${name} contains invalid characters. Only alphanumeric, hyphens, underscores, and dots are allowed.`
    );
  }

  if (sanitized.includes("..")) {
    throw new NeutronValidationError(`${name} cannot contain path traversal sequences.`);
  }

  return sanitized;
}
