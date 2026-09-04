import { describe, expect, it } from "vitest";
import { actualizarContrasenaSchema } from "./schema";

describe("actualizarContrasenaSchema", () => {
  it("accepts a valid password with matching confirmation", () => {
    const result = actualizarContrasenaSchema.safeParse({
      contrasena: "unaClaveSegura",
      confirmar: "unaClaveSegura",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = actualizarContrasenaSchema.safeParse({
      contrasena: "corta1",
      confirmar: "corta1",
    });

    expect(result.success).toBe(false);
  });

  it("rejects when confirmar does not match contrasena", () => {
    const result = actualizarContrasenaSchema.safeParse({
      contrasena: "unaClaveSegura",
      confirmar: "otraClaveSegura",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing contrasena", () => {
    const result = actualizarContrasenaSchema.safeParse({
      confirmar: "unaClaveSegura",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing confirmar", () => {
    const result = actualizarContrasenaSchema.safeParse({
      contrasena: "unaClaveSegura",
    });

    expect(result.success).toBe(false);
  });
});
