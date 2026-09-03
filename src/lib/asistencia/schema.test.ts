import { describe, expect, it } from "vitest";
import { asistenciaSchema } from "./schema";

describe("asistenciaSchema", () => {
  it("acepta los 4 estatus válidos", () => {
    for (const estatus of ["presente", "ausente", "retardo", "justificado"]) {
      expect(asistenciaSchema.safeParse({ estatus }).success).toBe(true);
    }
  });

  it("rechaza un estatus no reconocido", () => {
    expect(asistenciaSchema.safeParse({ estatus: "tarde" }).success).toBe(false);
  });

  it("rechaza un estatus vacío", () => {
    expect(asistenciaSchema.safeParse({ estatus: "" }).success).toBe(false);
  });

  it("rechaza un estatus faltante", () => {
    expect(asistenciaSchema.safeParse({}).success).toBe(false);
  });
});
