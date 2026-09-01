import { describe, expect, it } from "vitest";
import { invitarMaestroSchema } from "./schema";

describe("invitarMaestroSchema", () => {
  it("accepts a valid correo and nombre_completo", () => {
    const result = invitarMaestroSchema.safeParse({
      correo: "maestro@example.com",
      nombre_completo: "Juan Pérez",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing correo", () => {
    const result = invitarMaestroSchema.safeParse({
      nombre_completo: "Juan Pérez",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid correo", () => {
    const result = invitarMaestroSchema.safeParse({
      correo: "no-es-un-correo",
      nombre_completo: "Juan Pérez",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty nombre_completo", () => {
    const result = invitarMaestroSchema.safeParse({
      correo: "maestro@example.com",
      nombre_completo: "   ",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing nombre_completo", () => {
    const result = invitarMaestroSchema.safeParse({
      correo: "maestro@example.com",
    });

    expect(result.success).toBe(false);
  });
});
