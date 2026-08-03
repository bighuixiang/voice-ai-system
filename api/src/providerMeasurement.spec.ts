import { describe, expect, it } from "vitest";
import { normalizeProviderMeasurement } from "./providerMeasurement.js";

describe("provider measurement normalization", () => {
  it("preserves native usage only when a versioned price is present", () => {
    const actual = normalizeProviderMeasurement({ output: { usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 2, measurement: "actual", source: "provider" }, cost: { amount: 0.12, currency: "USD", measurement: "actual", pricingRef: "price://provider/model/v3" }, modelVersion: "model-v3" }, promptChars: 8000, outputChars: 4000 });
    expect(actual).toMatchObject({ usage: { measurement: "actual", inputTokens: 10 }, cost: { measurement: "actual", pricingRef: "price://provider/model/v3" }, modelVersion: "model-v3" });
  });

  it("downgrades incomplete native data to an explicit estimate instead of claiming actual", () => {
    const estimated = normalizeProviderMeasurement({ output: { usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0, measurement: "actual", source: "provider" }, cost: { amount: 0.12, currency: "USD", measurement: "actual" } }, promptChars: 8000, outputChars: 4000 });
    expect(estimated.usage.measurement).toBe("actual");
    expect(estimated.cost.measurement).toBe("estimated");
    expect(estimated.cost.estimateMethod).toBe("provider-native-data-incomplete");
  });
});
