import { z } from "zod";

export const invitarMaestroSchema = z.object({
  correo: z
    .string()
    .trim()
    .min(1, "El correo es requerido")
    .email("El correo no es válido"),
  nombre_completo: z.string().trim().min(1, "El nombre es requerido"),
});

export type InvitarMaestroInput = z.infer<typeof invitarMaestroSchema>;
