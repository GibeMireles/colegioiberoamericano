import { describe, expect, it } from "vitest";
import { invitarUsuarioSchema } from "./schema";

describe("invitarUsuarioSchema", () => {
  it("accepts a valid correo, nombre_completo and rol", () => {
    const result = invitarUsuarioSchema.safeParse({
      correo: "maestro@example.com",
      nombre_completo: "Juan Pérez",
      rol: "docente",
    });

    expect(result.success).toBe(true);
  });

  it("accepts every valid rol", () => {
    for (const rol of ["super_admin", "direccion", "caja", "docente"]) {
      const result = invitarUsuarioSchema.safeParse({
        correo: "usuario@example.com",
        nombre_completo: "Juan Pérez",
        rol,
      });

      expect(result.success).toBe(true);
    }
  });

  it("rejects a missing correo", () => {
    const result = invitarUsuarioSchema.safeParse({
      nombre_completo: "Juan Pérez",
      rol: "docente",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid correo", () => {
    const result = invitarUsuarioSchema.safeParse({
      correo: "no-es-un-correo",
      nombre_completo: "Juan Pérez",
      rol: "docente",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty nombre_completo", () => {
    const result = invitarUsuarioSchema.safeParse({
      correo: "maestro@example.com",
      nombre_completo: "   ",
      rol: "docente",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing nombre_completo", () => {
    const result = invitarUsuarioSchema.safeParse({
      correo: "maestro@example.com",
      rol: "docente",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing rol", () => {
    const result = invitarUsuarioSchema.safeParse({
      correo: "maestro@example.com",
      nombre_completo: "Juan Pérez",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid rol", () => {
    const result = invitarUsuarioSchema.safeParse({
      correo: "maestro@example.com",
      nombre_completo: "Juan Pérez",
      rol: "administrador",
    });

    expect(result.success).toBe(false);
  });
});
