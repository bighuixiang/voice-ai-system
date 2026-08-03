import { describe, expect, it } from "vitest";
import { evaluateWriteAuthority } from "./writeAuthorityGate.js";
describe("write authority", () => { it("rejects legacy replace", () => { expect(evaluateWriteAuthority({ writer: "ui", authoritativeWriter: "runtime", operation: "replace" }).status).toBe("blocked"); }); });
