import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Локальное файловое хранилище для шаблонов и других бинарных артефактов.
 * В проде заменим на S3-совместимое (Yandex Object Storage) — тот же интерфейс.
 *
 * Папка `storage/` лежит рядом с web/ корнем (НЕ в public/ — нет прямого
 * статик-доступа без авторизации).
 */
const STORAGE_ROOT = path.join(process.cwd(), "storage");

export type StorageKind = "templates";

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function fileFor(kind: StorageKind, id: string, ext: string): string {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(STORAGE_ROOT, kind, `${safe}.${ext}`);
}

export async function saveBuffer(
  kind: StorageKind,
  id: string,
  ext: string,
  data: Buffer | Uint8Array,
): Promise<{ key: string; bytes: number }> {
  const file = fileFor(kind, id, ext);
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, data);
  return { key: `${kind}/${id}.${ext}`, bytes: data.byteLength };
}

export async function readBuffer(key: string): Promise<Buffer> {
  const safe = key.replace(/\.\.+/g, "");
  const file = path.join(STORAGE_ROOT, safe);
  return fs.readFile(file);
}

export async function deleteKey(key: string): Promise<void> {
  const safe = key.replace(/\.\.+/g, "");
  const file = path.join(STORAGE_ROOT, safe);
  await fs.unlink(file).catch(() => {});
}
