import { describe, expect, it } from "vitest";
import { nombreEstructuraSchema } from "./schema";

describe("nombreEstructuraSchema", () => {
  it("accepts a valid nombre", () => {
    const result = nombreEstructuraSchema.safeParse({ nombre: "Primaria" });
    expect(result.success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const result = nombreEstructuraSchema.safeParse({ nombre: "  Primaria  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nombre).toBe("Primaria");
    }
  });

  it("rejects a missing nombre", () => {
    const result = nombreEstructuraSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an empty nombre", () => {
    const result = nombreEstructuraSchema.safeParse({ nombre: "   " });
    expect(result.success).toBe(false);
  });
});
