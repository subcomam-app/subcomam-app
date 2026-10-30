import type { NextConfig } from "next";

const config: NextConfig = {
  outputFileTracingIncludes: {
    "/api/controls/*/document": [
      "./assets/templates/art12bis-v1.docx",
      "./assets/templates/pdi-consulta-v1.xml",
      "./assets/templates/art12bis-form-v1.pdf",
      "./assets/fonts/LiberationSans-Regular.ttf",
      "./assets/fonts/LiberationSans-Bold.ttf",
      "./assets/fonts/DejaVuSans.ttf",
    ],
  },
};

export default config;
