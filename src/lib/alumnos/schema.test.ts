import { describe, expect, it } from "vitest";
import { alumnoSchema } from "./schema";

describe("alumnoSchema", () => {
  it("accepts a fully filled valid alumno", () => {
    const result = alumnoSchema.safeParse({
      nombre_completo: "Ana Torres",
      fecha_nacimiento: "2010-05-14",
      matricula: "IB-0001",
      tutor_nombre: "Laura Torres",
      tutor_telefono: "5512345678",
      tutor_email: "laura.torres@example.com",
    });

    expect(result.success).toBe(true);
  });

  it("accepts an alumno with only the required field", () => {
    const result = alumnoSchema.safeParse({
      nombre_completo: "Ana Torres",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fecha_nacimiento).toBeNull();
      expect(result.data.matricula).toBeNull();
      expect(result.data.tutor_nombre).toBeNull();
      expect(result.data.tutor_telefono).toBeNull();
      expect(result.data.tutor_email).toBeNull();
    }
  });

  it("rejects a missing nombre_completo", () => {
    const result = alumnoSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects an empty nombre_completo", () => {
    const result = alumnoSchema.safeParse({ nombre_completo: "   " });

    expect(result.success).toBe(false);
  });

  it("treats an empty optional field as null so Supabase clears it", () => {
    const result = alumnoSchema.safeParse({
      nombre_completo: "Ana Torres",
      matricula: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.matricula).toBeNull();
    }
  });

  it("rejects an invalid tutor_email", () => {
    const result = alumnoSchema.safeParse({
      nombre_completo: "Ana Torres",
      tutor_email: "no-es-un-correo",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid tutor_email", () => {
    const result = alumnoSchema.safeParse({
      nombre_completo: "Ana Torres",
      tutor_email: "tutor@example.com",
    });

    expect(result.success).toBe(true);
  });
});
