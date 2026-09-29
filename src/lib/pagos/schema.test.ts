import { describe, expect, it } from "vitest";
import {
  agregarCargoSchema,
  conceptoSchema,
  esUuid,
  motivoSchema,
  planBecaSchema,
  planPagoSchema,
  precioSchema,
  registrarPagoSchema,
} from "./schema";

const ID = "3f1c2a4e-8b7d-4c1a-9e2f-0a1b2c3d4e5f";
const ID2 = "4f1c2a4e-8b7d-4c1a-9e2f-0a1b2c3d4e5f";

describe("esUuid", () => {
  it("distingue uuids de otros valores", () => {
    expect(esUuid(ID)).toBe(true);
    expect(esUuid("123")).toBe(false);
    expect(esUuid(undefined)).toBe(false);
  });
});

describe("registrarPagoSchema", () => {
  const base = {
    alumnoId: ID,
    metodo: "efectivo",
    referencia: "",
    aplicaciones: [{ cargoId: ID2, monto: "1500.50" }],
  };

  it("acepta un pago válido y convierte montos y referencia vacía", () => {
    const r = registrarPagoSchema.parse(base);
    expect(r.aplicaciones[0].monto).toBe(1500.5);
    expect(r.referencia).toBeNull();
  });

  it("rechaza montos en cero, negativos o con más de 2 decimales", () => {
    for (const monto of ["0", "-5", "10.555", "abc", ""]) {
      expect(
        registrarPagoSchema.safeParse({ ...base, aplicaciones: [{ cargoId: ID2, monto }] }).success
      ).toBe(false);
    }
  });

  it("rechaza sin aplicaciones, con cargo repetido o método desconocido", () => {
    expect(registrarPagoSchema.safeParse({ ...base, aplicaciones: [] }).success).toBe(false);
    expect(
      registrarPagoSchema.safeParse({
        ...base,
        aplicaciones: [
          { cargoId: ID2, monto: "1" },
          { cargoId: ID2, monto: "2" },
        ],
      }).success
    ).toBe(false);
    expect(registrarPagoSchema.safeParse({ ...base, metodo: "cheque" }).success).toBe(false);
  });
});

describe("agregarCargoSchema", () => {
  it("acepta sin fecha de vencimiento", () => {
    const r = agregarCargoSchema.parse({
      conceptoId: ID,
      descripcion: " Recargo octubre ",
      monto: "150",
      fechaVencimiento: "",
    });
    expect(r).toEqual({
      conceptoId: ID,
      descripcion: "Recargo octubre",
      monto: 150,
      fechaVencimiento: null,
    });
  });

  it("rechaza descripción vacía o fecha inválida", () => {
    expect(
      agregarCargoSchema.safeParse({ conceptoId: ID, descripcion: " ", monto: "1", fechaVencimiento: "" })
        .success
    ).toBe(false);
    expect(
      agregarCargoSchema.safeParse({
        conceptoId: ID,
        descripcion: "x",
        monto: "1",
        fechaVencimiento: "2026-02-30",
      }).success
    ).toBe(false);
  });
});

describe("planBecaSchema", () => {
  it("plan vacío significa sin plan", () => {
    expect(planBecaSchema.parse({ planPagoId: "", becaPorcentaje: "0" })).toEqual({
      planPagoId: null,
      becaPorcentaje: 0,
    });
  });

  it("rechaza beca fuera de 0-100", () => {
    expect(planBecaSchema.safeParse({ planPagoId: ID, becaPorcentaje: "101" }).success).toBe(false);
    expect(planBecaSchema.safeParse({ planPagoId: ID, becaPorcentaje: "-1" }).success).toBe(false);
  });
});

describe("motivoSchema", () => {
  it("exige al menos 3 caracteres", () => {
    expect(motivoSchema.safeParse({ motivo: "  a " }).success).toBe(false);
    expect(motivoSchema.parse({ motivo: " Error de captura " }).motivo).toBe("Error de captura");
  });
});

describe("precioSchema", () => {
  it("acepta 0 pero no negativos", () => {
    expect(precioSchema.safeParse({ planPagoId: ID, nivelId: ID2, montoMensual: "0" }).success).toBe(true);
    expect(precioSchema.safeParse({ planPagoId: ID, nivelId: ID2, montoMensual: "-1" }).success).toBe(false);
  });
});

describe("planPagoSchema", () => {
  it("valida mes YYYY-MM y día 1-28", () => {
    expect(planPagoSchema.safeParse({ primerMes: "2026-09", diaVencimiento: "10" }).success).toBe(true);
    expect(planPagoSchema.safeParse({ primerMes: "2026-13", diaVencimiento: "10" }).success).toBe(false);
    expect(planPagoSchema.safeParse({ primerMes: "2026-09", diaVencimiento: "31" }).success).toBe(false);
  });
});

describe("conceptoSchema", () => {
  it("monto sugerido vacío es null", () => {
    expect(conceptoSchema.parse({ nombre: "Uniforme", montoDefault: "", aplicaBeca: false })).toEqual({
      nombre: "Uniforme",
      montoDefault: null,
      aplicaBeca: false,
    });
  });
});
