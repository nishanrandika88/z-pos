export interface CompressedImage {
  blob: Blob;
  contentType: string;
  fileName: string;
}

const maxDimension = 900;
const outputType = "image/webp";
const outputQuality = 0.82;

export async function compressImage(file: File): Promise<CompressedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image file.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare image for upload.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, outputType, outputQuality);
  });

  if (!blob) {
    throw new Error("Could not compress image.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();

  return {
    blob,
    contentType: outputType,
    fileName: `${baseName || "item-image"}.webp`,
  };
}
