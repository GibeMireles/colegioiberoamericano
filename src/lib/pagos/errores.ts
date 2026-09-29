export const MENSAJES_ERROR_PAGOS: Record<string, string> = {
  validacion: "Revisa los datos capturados.",
  sin_permiso: "No tienes permiso para esta acción.",
  sin_ciclo: "No hay un ciclo escolar activo.",
  sin_inscripcion: "El alumno no está inscrito en el ciclo activo.",
  sin_concepto_colegiatura: "No hay un concepto de Colegiatura configurado.",
  sin_aplicaciones: "Selecciona al menos un cargo a pagar.",
  cargo_repetido: "Un cargo aparece dos veces en el pago.",
  metodo_invalido: "Elige un método de pago válido.",
  cargo_invalido: "Uno de los cargos no pertenece a este alumno.",
  cargo_cancelado: "Uno de los cargos está cancelado.",
  monto_invalido: "Los montos deben ser mayores a 0.",
  monto_excede_saldo:
    "El monto de un cargo supera su saldo pendiente (quizá alguien acaba de registrar otro pago). Revisa los saldos e intenta de nuevo.",
  motivo_requerido: "Escribe el motivo.",
  ya_anulado: "Este pago ya estaba anulado.",
  pago_no_encontrado: "No se encontró el pago.",
  ya_cancelado: "Este cargo ya estaba cancelado.",
  cargo_no_encontrado: "No se encontró el cargo.",
  cargo_con_pagos: "Este cargo tiene pagos vigentes. Anula primero el pago desde su recibo.",
  concepto_colegiatura: "Las colegiaturas se crean con \"Generar colegiaturas\", no a mano.",
  solo_plan_beca: "Caja solo puede cambiar el plan de pagos y la beca.",
  plan_otro_ciclo: "El plan elegido no pertenece al ciclo de esta inscripción.",
  duplicado: "Ya existe un registro con esos datos.",
  desconocido: "No se pudo guardar. Intenta de nuevo.",
};

export function codigoDeError(
  error: { hint?: string | null; code?: string | null } | null | undefined
): string {
  if (!error) {
    return "desconocido";
  }
  if (error.hint && Object.hasOwn(MENSAJES_ERROR_PAGOS, error.hint)) {
    return error.hint;
  }
  if (error.code === "23505") {
    return "duplicado";
  }
  return "desconocido";
}

export function mensajeDeError(codigo: string | undefined): string | null {
  if (!codigo) {
    return null;
  }
  return Object.hasOwn(MENSAJES_ERROR_PAGOS, codigo)
    ? MENSAJES_ERROR_PAGOS[codigo]
    : MENSAJES_ERROR_PAGOS.desconocido;
}
