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
        src: "/android/launchericon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable any",
      },
      {
        src: "/android/launchericon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable any",
      },
      {
        src: "/ios/180.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
