import { notFound } from "next/navigation";
import { requerirAccesoAsignacion, type AsignacionAcceso } from "./requerirAccesoAsignacion";

export async function requerirAccesoAsignacionPagina(asignacionId: string): Promise<AsignacionAcceso> {
  try {
    return await requerirAccesoAsignacion(asignacionId);
  } catch {
    notFound();
  }
}
