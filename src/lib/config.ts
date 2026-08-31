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
    colorPrimario: "#E3312D",
    colorSecundario: "#FEDC01",
    logoUrl: "/logo-ibero.jpg",
  };
}
