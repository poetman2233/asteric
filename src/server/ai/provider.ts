import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { config } from "@/server/config";
import { logger } from "@/server/logger";
import { CANONICAL_FIELDS } from "@/lib/imports/fields";

/**
 * Centralized AI provider. AI only *suggests*; nothing it returns becomes data
 * without human confirmation. To change provider or model, edit this file
 * (or set AI_PROVIDER / AI_MODEL). To disable entirely, leave AI_PROVIDER unset.
 *
 * Data minimization: only spreadsheet column HEADERS and an inferred value type
 * ("date", "money", "text"...) are transmitted. Cell values, client names and
 * matter contents are never sent.
 */
export type ColumnHint = { header: string; inferredType: "date" | "money" | "percent" | "number" | "text" | "empty" };
export type AiMappingSuggestion = { header: string; field: string | null; confidence: number };

export interface AiProvider {
  readonly name: string;
  suggestColumnMappings(columns: ColumnHint[]): Promise<AiMappingSuggestion[]>;
}

const FIELD_KEYS = CANONICAL_FIELDS.map((f) => f.key);
const resultSchema = z.object({
  mappings: z.array(z.object({ header: z.string(), field: z.string().nullable(), confidence: z.number().min(0).max(1) })),
});
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mappings"],
  properties: {
    mappings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["header", "field", "confidence"],
        properties: {
          header: { type: "string" },
          field: { anyOf: [{ type: "string", enum: FIELD_KEYS }, { type: "null" }] },
          confidence: { type: "number" },
        },
      },
    },
  },
};

class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 20_000, maxRetries: 1 });
  private model = process.env.AI_MODEL ?? "";

  async suggestColumnMappings(columns: ColumnHint[]): Promise<AiMappingSuggestion[]> {
    if (!columns.length) return [];
    const fieldList = CANONICAL_FIELDS.map((f) => `- ${f.key}: ${f.label} (${f.kind})`).join("\n");
    const prompt = [
      "Map spreadsheet column headers from a law firm's case-management export onto canonical fields.",
      "Use null when no field fits. Each field may be used at most once. Confidence is 0 to 1.",
      `Canonical fields:\n${fieldList}`,
      `Columns (header and inferred value type):\n${columns.map((c) => `- ${JSON.stringify(c.header)} [${c.inferredType}]`).join("\n")}`,
    ].join("\n\n");
    try {
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: JSON_SCHEMA } },
        messages: [{ role: "user", content: prompt }],
      });
      if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
        logger.warn("ai.mapping_incomplete", { stopReason: response.stop_reason });
        return [];
      }
      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") return [];
      const parsed = resultSchema.safeParse(JSON.parse(text.text));
      if (!parsed.success) return [];
      const valid = new Set(columns.map((c) => c.header));
      return parsed.data.mappings.filter((m) => valid.has(m.header) && (m.field === null || FIELD_KEYS.includes(m.field)));
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) logger.warn("ai.rate_limited");
      else if (err instanceof Anthropic.APIError) logger.error("ai.api_error", { status: err.status });
      else logger.error("ai.mapping_failed", { err });
      return [];
    }
  }
}

let provider: AiProvider | null | undefined;
export function getAiProvider(): AiProvider | null {
  if (provider === undefined) provider = config.aiProvider === "anthropic" ? new AnthropicProvider() : null;
  return provider;
}
