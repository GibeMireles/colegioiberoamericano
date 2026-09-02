export interface CalificacionValores {
  parcial1_adas: number | null;
  parcial1_examen: number | null;
  parcial2_adas: number | null;
  parcial2_examen: number | null;
  producto_proyecto: number | null;
  producto_examen: number | null;
}

export function calcularSubtotal(a: number | null, b: number | null): number {
  return (a ?? 0) + (b ?? 0);
}

export function calcularTotal(valores: CalificacionValores): number {
  const calif1 = calcularSubtotal(valores.parcial1_adas, valores.parcial1_examen);
  const calif2 = calcularSubtotal(valores.parcial2_adas, valores.parcial2_examen);
  const subtotalProducto = calcularSubtotal(valores.producto_proyecto, valores.producto_examen);
  return calif1 + calif2 + subtotalProducto;
}
