export interface ConfiguracionEscuela {
  nombre: string;
  nombreCorto: string;
  colorPrimario: string;
  colorSecundario: string;
  logoUrl: string | null;
}

export async function getConfiguracion(): Promise<ConfiguracionEscuela> {
  return {
    nombre: "Colegio Iberoamericano",
    nombreCorto: "Ibero",
    colorPrimario: "#D85A30",
    colorSecundario: "#EF9F27",
    logoUrl: null,
  };
}
