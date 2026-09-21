// Prepara uno screenshot per l'invio: lo riduce e lo converte in JPEG. Solo browser.
//
// Perché: una schermata di telefono in PNG pesa 1-4 MB e il limite delle server action è 1 MB
// (4,5 MB su Vercel), quindi l'invio falliva. A 1600 px sul lato lungo il testo resta
// leggibile e il file scende a poche centinaia di KB. Convertire in JPEG risolve anche
// formati come HEIC/WebP dove il browser sa decodificarli.

const MAX_SIDE = 1600;
const QUALITY = 0.9;

export type PreparedImage = { base64: string; mediaType: "image/jpeg"; dataUrl: string };

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // si prova con <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const { source, width, height, close } = await decode(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas non disponibile");
    ctx.fillStyle = "#ffffff"; // i PNG trasparenti diventerebbero neri in JPEG
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
    return { base64: dataUrl.split(",")[1], mediaType: "image/jpeg", dataUrl };
  } finally {
    close();
  }
}
