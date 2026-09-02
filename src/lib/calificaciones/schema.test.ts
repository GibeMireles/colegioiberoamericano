import { describe, expect, it } from "vitest";
import { calificacionSchema, ponderacionSchema } from "./schema";

describe("calificacionSchema", () => {
  it("acepta los 6 campos vacíos (nada capturado todavía)", () => {
    const result = calificacionSchema.safeParse({
      parcial1_adas: "",
      parcial1_examen: "",
      parcial2_adas: "",
      parcial2_examen: "",
      producto_proyecto: "",
      producto_examen: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parcial1_adas).toBeUndefined();
    }
  });

  it("acepta valores numéricos válidos", () => {
    const result = calificacionSchema.safeParse({
      parcial1_adas: "21",
      parcial1_examen: "5",
      parcial2_adas: "26",
      parcial2_examen: "",
      producto_proyecto: "36",
      producto_examen: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parcial1_adas).toBe(21);
    }
  });

  it("rechaza un valor negativo", () => {
    const result = calificacionSchema.safeParse({
      parcial1_adas: "-5",
      parcial1_examen: "",
      parcial2_adas: "",
      parcial2_examen: "",
      producto_proyecto: "",
      producto_examen: "",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un valor no numérico", () => {
    const result = calificacionSchema.safeParse({
      parcial1_adas: "abc",
      parcial1_examen: "",
      parcial2_adas: "",
      parcial2_examen: "",
      producto_proyecto: "",
      producto_examen: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("ponderacionSchema", () => {
  it("acepta 3 valores positivos", () => {
    const result = ponderacionSchema.safeParse({
      parcial1_max: "30",
      parcial2_max: "30",
      producto_max: "40",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza un valor en cero", () => {
    const result = ponderacionSchema.safeParse({
      parcial1_max: "0",
      parcial2_max: "30",
      producto_max: "40",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un campo faltante", () => {
    const result = ponderacionSchema.safeParse({
      parcial1_max: "30",
      producto_max: "40",
    });
    expect(result.success).toBe(false);
  });
});
