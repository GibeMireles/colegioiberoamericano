import { describe, expect, it } from "vitest";
import { codigoDeError, mensajeDeError, MENSAJES_ERROR_PAGOS } from "./errores";

describe("codigoDeError", () => {
  it("usa el hint cuando es un código conocido", () => {
    expect(codigoDeError({ hint: "monto_excede_saldo", code: "P0001" })).toBe("monto_excede_saldo");
  });

  it("mapea violación de unicidad a duplicado", () => {
    expect(codigoDeError({ hint: null, code: "23505" })).toBe("duplicado");
  });

  it("cae en desconocido para cualquier otra cosa", () => {
    expect(codigoDeError({ hint: "algo_raro" })).toBe("desconocido");
    expect(codigoDeError(null)).toBe("desconocido");
  });
});

describe("mensajeDeError", () => {
  it("devuelve null sin código y el genérico para códigos desconocidos", () => {
    expect(mensajeDeError(undefined)).toBeNull();
    expect(mensajeDeError("<script>")).toBe(MENSAJES_ERROR_PAGOS.desconocido);
  });
});
