import { describe, expect, it } from "vitest";
import {
  formatearMoneda,
  nombreCompletoAlumno,
  normalizarTexto,
  resumirCorte,
  sumarMontos,
} from "./calculos";

describe("sumarMontos", () => {
  it("suma sin error de punto flotante", () => {
    expect(sumarMontos([0.1, 0.2])).toBe(0.3);
    expect(sumarMontos([1000.1, 2000.1])).toBe(3000.2);
  });

  it("regresa 0 para una lista vacía", () => {
    expect(sumarMontos([])).toBe(0);
  });
});

describe("formatearMoneda", () => {
  it("formatea en pesos mexicanos", () => {
    expect(formatearMoneda(3500)).toBe("$3,500.00");
  });
});

describe("nombreCompletoAlumno", () => {
  it("usa formato Apellidos, Nombres", () => {
    expect(
      nombreCompletoAlumno({ nombres: "Ana", apellido_paterno: "López", apellido_materno: "Ruiz" })
    ).toBe("López Ruiz, Ana");
  });

  it("omite el apellido materno faltante", () => {
    expect(
      nombreCompletoAlumno({ nombres: "Ana", apellido_paterno: "López", apellido_materno: null })
    ).toBe("López, Ana");
  });

  it("sin apellidos devuelve solo los nombres", () => {
    expect(
      nombreCompletoAlumno({ nombres: "Ana", apellido_paterno: null, apellido_materno: null })
    ).toBe("Ana");
  });
});

describe("normalizarTexto", () => {
  it("quita acentos, mayúsculas y espacios de los extremos", () => {
    expect(normalizarTexto("  José Pérez ")).toBe("jose perez");
  });
});

describe("resumirCorte", () => {
  it("excluye anulados de los totales y agrupa por método y usuario", () => {
    const resumen = resumirCorte([
      { montoTotal: 1000.1, metodo: "efectivo", registradoPor: "Caja 1", anulado: false },
      { montoTotal: 500, metodo: "transferencia", registradoPor: "Caja 2", anulado: false },
      { montoTotal: 0.2, metodo: "efectivo", registradoPor: "Caja 1", anulado: false },
      { montoTotal: 9999, metodo: "tarjeta", registradoPor: "Caja 1", anulado: true },
    ]);

    expect(resumen.total).toBe(1500.3);
    expect(resumen.cantidad).toBe(3);
    expect(resumen.anulados).toBe(1);
    expect(resumen.porMetodo).toEqual({ efectivo: 1000.3, transferencia: 500, tarjeta: 0 });
    expect(resumen.porUsuario).toEqual([
      { nombre: "Caja 1", total: 1000.3 },
      { nombre: "Caja 2", total: 500 },
    ]);
  });
});
