/** Client document rules, shared by the booking wizard and the portal. Match the bucket's own limits. */
export const DOCUMENTS_BUCKET = "client-documents";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);
/** For the file picker. */
export const DOCUMENT_ACCEPT = ".pdf,.docx,.jpg,.jpeg,.png";

/** Keeps letters, digits, dots, dashes and underscores, so the storage path is predictable. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(-100);
  return cleaned.replace(/^[._]+/, "") || "document";
}
