import { z } from "zod";
import { ROLES } from "../roles";

export const invitarUsuarioSchema = z.object({
  correo: z
    .string()
    .trim()
    .min(1, "El correo es requerido")
    .email("El correo no es válido"),
  nombre_completo: z.string().trim().min(1, "El nombre es requerido"),
  rol: z.enum(ROLES),
});

export type InvitarUsuarioInput = z.infer<typeof invitarUsuarioSchema>;
