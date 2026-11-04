import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "lider-files";

export type FileEntity = "stage" | "stage_condition" | "request" | "request_field";
export type FileKind = "draft" | "signed" | "photo" | "other";

export type FileRow = {
  id: string;
  file_name: string;
  kind: FileKind;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  uploaded_by: string | null;
  uploader: { full_name: string } | null;
};

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  draft: "Черновик на согласование",
  signed: "Подписанный скан",
  photo: "Фото",
  other: "Файл",
};

/** Ключ в хранилище допускает не все символы (кириллица, пробелы) — оставляем латиницу и цифры; исходное имя хранится в files.file_name. */
export function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot).replace(/[^A-Za-z0-9.]/g, "") : "";
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || "file";
  return base + ext.toLowerCase();
}

/**
 * Загрузка файла: storage → строка в files. Путь начинается с object_id —
 * на этом построена политика доступа к хранилищу.
 */
export async function uploadFile(opts: {
  objectId: string;
  entityType: FileEntity;
  entityId: string;
  kind: FileKind;
  file: File;
  profileId: string;
}) {
  const { objectId, entityType, entityId, kind, file, profileId } = opts;
  const path = `${objectId}/${entityType}/${entityId}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (up.error) throw up.error;
  const { error } = await supabase.from("files").insert({
    object_id: objectId,
    entity_type: entityType,
    entity_id: entityId,
    kind,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: profileId,
  });
  if (error) throw error;
}

export async function listFiles(entityType: FileEntity, entityIds: string[]) {
  if (entityIds.length === 0) return [] as (FileRow & { entity_id: string })[];
  const { data, error } = await supabase
    .from("files")
    .select("id, entity_id, file_name, kind, storage_path, mime_type, size_bytes, created_at, uploaded_by, uploader:profiles!files_uploaded_by_fkey(full_name)")
    .eq("entity_type", entityType)
    .in("entity_id", entityIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as (FileRow & { entity_id: string })[];
}

/** Открыть файл по временной ссылке (хранилище закрытое). */
export async function openFile(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

export function formatSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

// ---------------------------------------------------------------------
// Файлы-образцы у этапов справочника: «От нас» / «Ждём» (правка 2.3, db/06)
// ---------------------------------------------------------------------
export const TEMPLATES_BUCKET = "lider-templates";

export type TemplateDocKind = "outgoing" | "expected";

export type TemplateFile = {
  id: string;
  template_id: string;
  kind: TemplateDocKind;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export async function listTemplateFiles(templateId: string) {
  const { data, error } = await supabase
    .from("stage_template_files")
    .select("id, template_id, kind, storage_path, file_name, mime_type, size_bytes, created_at")
    .eq("template_id", templateId)
    .is("deleted_at", null)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as TemplateFile[];
}

export async function uploadTemplateFile(templateId: string, kind: TemplateDocKind, file: File, profileId: string | null) {
  const path = `${templateId}/${kind}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const up = await supabase.storage.from(TEMPLATES_BUCKET).upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (up.error) throw up.error;
  const { error } = await supabase.from("stage_template_files").insert({
    template_id: templateId,
    kind,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: profileId,
  });
  if (error) {
    await supabase.storage.from(TEMPLATES_BUCKET).remove([path]); // не оставляем файл без записи
    throw error;
  }
}

/** Удаление: запись помечается удалённой, сам файл стирается из хранилища. */
export async function removeTemplateFile(f: TemplateFile) {
  const { error } = await supabase
    .from("stage_template_files")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", f.id);
  if (error) throw error;
  await supabase.storage.from(TEMPLATES_BUCKET).remove([f.storage_path]);
}

export async function openTemplateFile(path: string) {
  const { data, error } = await supabase.storage.from(TEMPLATES_BUCKET).createSignedUrl(path, 600);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}
