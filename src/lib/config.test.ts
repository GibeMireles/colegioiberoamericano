import { describe, expect, it } from "vitest";
import { getConfiguracion } from "./config";

describe("getConfiguracion", () => {
  it("returns the brand configuration with hex colors", async () => {
    const config = await getConfiguracion();

    expect(config.nombre).toBe("Colegio Iberoamericano");
    expect(config.nombreCorto).toBe("Ibero");
    expect(config.colorPrimario).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(config.colorSecundario).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
