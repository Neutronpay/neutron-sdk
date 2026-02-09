import crypto from "crypto";
import type { HttpClient } from "../client.js";
import type { Webhook, CreateWebhookParams, UpdateWebhookParams } from "../types.js";
import { NeutronValidationError } from "../errors.js";

export class WebhooksResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Register a webhook to receive transaction state change notifications.
   *
   * @example
   * const webhook = await neutron.webhooks.create({
   *   callback: "https://myapp.com/webhooks/neutron",
   *   secret: "my-webhook-secret",
   * });
   */
  async create(params: CreateWebhookParams): Promise<Webhook> {
    return this.client.post<Webhook>(`/api/v2/webhook`, params);
  }

  /**
   * List all registered webhooks.
   */
  async list(): Promise<Webhook[]> {
    const res = await this.client.get(`/api/v2/webhook`);
    return res.data ?? res;
  }

  /**
   * Update a webhook's callback URL or secret.
   */
  async update(webhookId: string, params: UpdateWebhookParams): Promise<Webhook> {
    return this.client.put<Webhook>(`/api/v2/webhook/${webhookId}`, params);
  }

  /**
   * Delete a webhook.
   */
  async delete(webhookId: string): Promise<void> {
    await this.client.del(`/api/v2/webhook/${webhookId}`);
  }

  /**
   * Verify a webhook signature from an incoming request.
   * Throws if the signature is invalid.
   *
   * @param body The raw request body (string or Buffer)
   * @param signature The `X-Neutronpay-Signature` header value
   * @param secret Your webhook secret
   * @returns The parsed event payload
   *
   * @example
   * // Express
   * app.post("/webhooks/neutron", express.raw({ type: "application/json" }), (req, res) => {
   *   try {
   *     const event = Neutron.webhooks.verifySignature(
   *       req.body,
   *       req.headers["x-neutronpay-signature"],
   *       "my-webhook-secret"
   *     );
   *     // event is verified and safe to use
   *     if (event.txnState === "completed") fulfillOrder(event.extRefId);
   *   } catch (err) {
   *     return res.status(401).send("Invalid signature");
   *   }
   *   res.status(200).send("OK");
   * });
   */
  static verifySignature(
    body: string | Buffer,
    signature: string | undefined | null,
    secret: string
  ): any {
    if (!signature) {
      throw new NeutronValidationError("Missing webhook signature header (X-Neutronpay-Signature)");
    }
    if (!secret) {
      throw new NeutronValidationError("Webhook secret is required for verification");
    }

    const bodyStr = typeof body === "string" ? body : body.toString("utf8");

    const expected = crypto
      .createHmac("sha256", secret)
      .update(bodyStr)
      .digest("hex");

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    const isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

    if (!isValid) {
      throw new NeutronValidationError("Invalid webhook signature");
    }

    return JSON.parse(bodyStr);
  }
}
