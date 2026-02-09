import { describe, it, expect } from "vitest";
import { Neutron, NeutronAuthError, NeutronValidationError } from "../src/index.js";

describe("Neutron SDK", () => {
  describe("constructor", () => {
    it("throws if apiKey is missing", () => {
      expect(() => new Neutron({ apiKey: "", apiSecret: "secret" })).toThrow(NeutronAuthError);
    });

    it("throws if apiSecret is missing", () => {
      expect(() => new Neutron({ apiKey: "key", apiSecret: "" })).toThrow(NeutronAuthError);
    });

    it("creates instance with valid config", () => {
      const neutron = new Neutron({ apiKey: "key", apiSecret: "secret" });
      expect(neutron).toBeDefined();
      expect(neutron.account).toBeDefined();
      expect(neutron.transactions).toBeDefined();
      expect(neutron.lightning).toBeDefined();
      expect(neutron.webhooks).toBeDefined();
      expect(neutron.rates).toBeDefined();
      expect(neutron.fiat).toBeDefined();
    });

    it("uses default baseUrl", () => {
      const neutron = new Neutron({ apiKey: "key", apiSecret: "secret" });
      expect(neutron).toBeDefined();
    });

    it("accepts custom baseUrl", () => {
      const neutron = new Neutron({
        apiKey: "key",
        apiSecret: "secret",
        baseUrl: "https://enapi.npay.dev",
      });
      expect(neutron).toBeDefined();
    });
  });

  describe("lightning.createInvoice validation", () => {
    const neutron = new Neutron({ apiKey: "key", apiSecret: "secret" });

    it("throws if no amount provided", async () => {
      await expect(neutron.lightning.createInvoice({})).rejects.toThrow(NeutronValidationError);
      await expect(neutron.lightning.createInvoice({})).rejects.toThrow("amountSats or amountBtc");
    });

    it("throws if both amounts provided", async () => {
      await expect(
        neutron.lightning.createInvoice({ amountSats: 100, amountBtc: 0.001 })
      ).rejects.toThrow("not both");
    });

    it("throws if amountSats is negative", async () => {
      await expect(neutron.lightning.createInvoice({ amountSats: -1 })).rejects.toThrow("positive");
    });

    it("throws if amountBtc is negative", async () => {
      await expect(neutron.lightning.createInvoice({ amountBtc: -0.001 })).rejects.toThrow(
        "positive"
      );
    });
  });

  describe("lightning.payAddress validation", () => {
    const neutron = new Neutron({ apiKey: "key", apiSecret: "secret" });

    it("throws if no amount provided", async () => {
      await expect(neutron.lightning.payAddress("user@example.com", {})).rejects.toThrow(
        NeutronValidationError
      );
    });
  });
});
