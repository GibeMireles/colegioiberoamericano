import { describe, expect, it } from "vitest";
import { ROLES } from "./roles";

describe("ROLES", () => {
  it("contiene exactamente los 4 roles reales", () => {
    expect(ROLES).toEqual(["super_admin", "direccion", "caja", "docente"]);
  });
});
