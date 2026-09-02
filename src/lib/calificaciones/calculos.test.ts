import { describe, expect, it } from "vitest";
import { calcularSubtotal, calcularTotal } from "./calculos";

describe("calcularSubtotal", () => {
  it("suma dos valores capturados", () => {
    expect(calcularSubtotal(21, 5)).toBe(26);
  });

  it("trata un valor nulo como 0", () => {
    expect(calcularSubtotal(21, null)).toBe(21);
  });

  it("regresa 0 cuando ambos son nulos", () => {
    expect(calcularSubtotal(null, null)).toBe(0);
  });
});

describe("calcularTotal", () => {
  it("suma los 3 subtotales (ejemplo real del Excel: 21+26+36=83)", () => {
    const total = calcularTotal({
      parcial1_adas: 21,
      parcial1_examen: null,
      parcial2_adas: 26,
      parcial2_examen: null,
      producto_proyecto: 36,
      producto_examen: null,
    });
    expect(total).toBe(83);
  });

  it("regresa 0 cuando no hay ninguna captura", () => {
    const total = calcularTotal({
      parcial1_adas: null,
      parcial1_examen: null,
      parcial2_adas: null,
      parcial2_examen: null,
      producto_proyecto: null,
      producto_examen: null,
    });
    expect(total).toBe(0);
  });
});
