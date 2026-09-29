import { describe, expect, it } from "vitest";
import { isNavItemActive, NAV_ITEMS, navItemsVisibles } from "./nav";

describe("NAV_ITEMS", () => {
  it("has the 6 modules in order, con Materias, Calificaciones y Usuarios restringidos", () => {
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/alumnos",
      "/pagos",
      "/asistencia",
      "/materias",
      "/calificaciones",
      "/usuarios",
    ]);
    expect(NAV_ITEMS.find((item) => item.href === "/pagos")?.rolesPermitidos).toEqual([
      "super_admin",
      "direccion",
      "caja",
    ]);
    expect(NAV_ITEMS.find((item) => item.href === "/materias")?.rolesPermitidos).toEqual([
      "super_admin",
      "direccion",
    ]);
    expect(NAV_ITEMS.find((item) => item.href === "/calificaciones")?.rolesPermitidos).toEqual([
      "super_admin",
      "direccion",
      "docente",
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
    expect(hrefs).toEqual(["/alumnos", "/asistencia"]);
  });

  it("excludes materias y usuarios for docente, but includes calificaciones", () => {
    const hrefs = navItemsVisibles("docente").map((item) => item.href);
    expect(hrefs).not.toContain("/materias");
    expect(hrefs).not.toContain("/usuarios");
    expect(hrefs).not.toContain("/pagos");
    expect(hrefs).toContain("/calificaciones");
  });

  it("includes materias y calificaciones but not usuarios for direccion", () => {
    const hrefs = navItemsVisibles("direccion").map((item) => item.href);
    expect(hrefs).toContain("/materias");
    expect(hrefs).toContain("/calificaciones");
    expect(hrefs).not.toContain("/usuarios");
  });

  it("includes materias, calificaciones y usuarios for super_admin", () => {
    const hrefs = navItemsVisibles("super_admin").map((item) => item.href);
    expect(hrefs).toContain("/materias");
    expect(hrefs).toContain("/calificaciones");
    expect(hrefs).toContain("/usuarios");
  });

  it("includes pagos for caja", () => {
    const hrefs = navItemsVisibles("caja").map((item) => item.href);
    expect(hrefs).toContain("/pagos");
  });
});
