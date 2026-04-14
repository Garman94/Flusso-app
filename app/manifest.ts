import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Flusso",
    short_name: "Flusso",
    description: "Controlla le tue finanze, raggiungi i tuoi obiettivi",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#6366f1",
    background_color: "#ffffff",
    categories: ["finance", "productivity"],
    icons: [
      {
        src: "/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
