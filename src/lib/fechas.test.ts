import { describe, expect, it } from "vitest";
import {
  esFechaISO,
  fechaHoyMexico,
  formatearFecha,
  inicioDelDiaEscuela,
  sumarDias,
} from "./fechas";

describe("fechaHoyMexico", () => {
  it("a las 21:00 de CDMX sigue siendo el mismo día (en UTC ya es mañana)", () => {
    expect(fechaHoyMexico(new Date("2026-09-30T03:00:00Z"))).toBe("2026-09-29");
  });

  it("a mediodía coincide con la fecha UTC", () => {
    expect(fechaHoyMexico(new Date("2026-09-29T18:00:00Z"))).toBe("2026-09-29");
  });
});

describe("esFechaISO", () => {
  it("acepta YYYY-MM-DD válida", () => {
    expect(esFechaISO("2026-09-01")).toBe(true);
  });

  it("rechaza fechas imposibles, formatos cortos y no-strings", () => {
    expect(esFechaISO("2026-02-30")).toBe(false);
    expect(esFechaISO("2026-9-1")).toBe(false);
    expect(esFechaISO("hoy")).toBe(false);
    expect(esFechaISO(undefined)).toBe(false);
    expect(esFechaISO(20260901)).toBe(false);
  });
});

describe("sumarDias", () => {
  it("cruza fin de año", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("inicioDelDiaEscuela", () => {
  it("usa el offset fijo de México", () => {
    expect(inicioDelDiaEscuela("2026-09-29")).toBe("2026-09-29T00:00:00-06:00");
  });

  it("un pago a las 23:30 de CDMX cae antes del inicio del día siguiente", () => {
    const pago = new Date("2026-09-30T05:30:00Z"); // 23:30 del 29 en CDMX
    expect(pago < new Date(inicioDelDiaEscuela(sumarDias("2026-09-29", 1)))).toBe(true);
    expect(pago >= new Date(inicioDelDiaEscuela("2026-09-29"))).toBe(true);
  });
});

describe("formatearFecha", () => {
  it("muestra dd/mm/aaaa sin desfase por zona horaria", () => {
    expect(formatearFecha("2026-09-10")).toBe("10/09/2026");
  });
});
