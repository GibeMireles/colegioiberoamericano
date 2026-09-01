import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_ITEMS, navItemsVisibles } from "./nav";

describe("NAV_ITEMS", () => {
  it("has the 4 modules in order, Usuarios solo para super_admin", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/alumnos",
      "/pagos",
      "/asistencia",
      "/usuarios",
    ]);
    expect(NAV_ITEMS.find((item) => item.href === "/usuarios")?.rolesPermitidos).toEqual([
      "super_admin",
    ]);
  });
});

describe("isNavItemActive", () => {
  it("matches an exact path", () => {
    expect(isNavItemActive("/alumnos", "/alumnos")).toBe(true);
  });

  it("matches a nested path under the item", () => {
    expect(isNavItemActive("/alumnos/123", "/alumnos")).toBe(true);
  });

  it("does not match a different top-level path", () => {
    expect(isNavItemActive("/pagos", "/alumnos")).toBe(false);
  });

  it("does not match a path that merely shares a text prefix", () => {
    expect(isNavItemActive("/alumnosx", "/alumnos")).toBe(false);
  });
});

describe("navItemsVisibles", () => {
  it("includes items with no rolesPermitidos regardless of rol", () => {
    const hrefs = navItemsVisibles(null).map((item) => item.href);
    expect(hrefs).toEqual(["/alumnos", "/pagos", "/asistencia"]);
  });

  it("excludes a restricted item when rol does not match", () => {
    const hrefs = navItemsVisibles("docente").map((item) => item.href);
    expect(hrefs).not.toContain("/usuarios");
  });

  it("includes a restricted item when rol matches", () => {
    const hrefs = navItemsVisibles("super_admin").map((item) => item.href);
    expect(hrefs).toContain("/usuarios");
  });
});
