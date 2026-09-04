import { z } from "zod";

export const actualizarContrasenaSchema = z
  .object({
    contrasena: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmar: z.string(),
  })
  .refine((datos) => datos.contrasena === datos.confirmar, {
    message: "Las contraseñas no coinciden",
    path: ["confirmar"],
  });

export type ActualizarContrasenaInput = z.infer<typeof actualizarContrasenaSchema>;
