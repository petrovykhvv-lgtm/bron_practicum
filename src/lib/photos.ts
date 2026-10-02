import { readdir } from "node:fs/promises";
import path from "node:path";

const EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

// Фото ресторана: любые изображения из public/photos (по имени файла). Нет папки или файлов, раздел просто не показывается.
export async function listPhotos(): Promise<string[]> {
  try {
    const files = await readdir(path.join(process.cwd(), "public", "photos"));
    return files
      .filter((f) => EXTENSIONS.has(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, "ru", { numeric: true }))
      .map((f) => `/photos/${encodeURIComponent(f)}`);
  } catch {
    return [];
  }
}
