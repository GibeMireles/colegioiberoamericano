import { describe, expect, it } from "vitest";
import { asignacionSchema } from "./schema";

describe("asignacionSchema", () => {
  it("accepts a valid grupo_id and docente_perfil_id", () => {
    const result = asignacionSchema.safeParse({
      grupo_id: "11111111-1111-1111-1111-111111111111",
      docente_perfil_id: "22222222-2222-2222-2222-222222222222",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing grupo_id", () => {
    const result = asignacionSchema.safeParse({
      docente_perfil_id: "22222222-2222-2222-2222-222222222222",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty grupo_id", () => {
    const result = asignacionSchema.safeParse({
      grupo_id: "",
      docente_perfil_id: "22222222-2222-2222-2222-222222222222",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing docente_perfil_id", () => {
    const result = asignacionSchema.safeParse({
      grupo_id: "11111111-1111-1111-1111-111111111111",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty docente_perfil_id", () => {
    const result = asignacionSchema.safeParse({
      grupo_id: "11111111-1111-1111-1111-111111111111",
      docente_perfil_id: "",
    });

    expect(result.success).toBe(false);
  });
});
