import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { Neutron, NeutronValidationError } from "../src/index.js";

describe("Webhook signature verification", () => {
  const secret = "test-webhook-secret";
  const payload = JSON.stringify({ txnId: "abc-123", txnState: "completed" });
  const validSignature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  it("verifies a valid signature and returns parsed event", () => {
    const event = Neutron.verifyWebhook(payload, validSignature, secret);
    expect(event.txnId).toBe("abc-123");
    expect(event.txnState).toBe("completed");
  });

  it("verifies with Buffer body", () => {
    const event = Neutron.verifyWebhook(Buffer.from(payload), validSignature, secret);
    expect(event.txnId).toBe("abc-123");
  });

  it("throws on invalid signature", () => {
    expect(() => Neutron.verifyWebhook(payload, "bad-signature-hex", secret)).toThrow(
      NeutronValidationError
    );
  });

  it("throws on missing signature", () => {
    expect(() => Neutron.verifyWebhook(payload, null, secret)).toThrow("Missing webhook signature");
  });

  it("throws on missing secret", () => {
    expect(() => Neutron.verifyWebhook(payload, validSignature, "")).toThrow("secret is required");
  });
});
