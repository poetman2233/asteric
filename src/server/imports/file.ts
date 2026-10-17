import "server-only";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/node";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_ROWS = 20_000;
export const MAX_COLUMNS = 120;

export class ImportFileError extends Error {
  constructor(public code: "empty" | "too_large" | "unsupported" | "corrupt" | "no_header" | "too_many_rows" | "too_many_columns" | "no_rows", message: string) {
    super(message);
  }
}

export type ParsedSheet = { headers: string[]; rows: Record<string, string | number | boolean | null>[]; kind: "csv" | "xlsx"; mime: string };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function cellJson(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = String(v).trim();
  return s.length ? s.slice(0, 2000) : null;
}

function toRecords(matrix: unknown[][]): { headers: string[]; rows: Record<string, string | number | boolean | null>[] } {
  const firstIdx = matrix.findIndex((r) => r.some((c) => cellJson(c) != null));
  if (firstIdx < 0) throw new ImportFileError("no_header", "The file has no header row.");
  const rawHeaders = matrix[firstIdx]!.map((h) => String(cellJson(h) ?? "").trim());
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, i) => {
    const base = h || `Column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
  if (headers.length > MAX_COLUMNS) throw new ImportFileError("too_many_columns", `The file has ${headers.length} columns; the limit is ${MAX_COLUMNS}.`);
  const body = matrix.slice(firstIdx + 1).filter((r) => r.some((c) => cellJson(c) != null));
  if (body.length > MAX_ROWS) throw new ImportFileError("too_many_rows", `The file has ${body.length.toLocaleString()} rows; the limit per import is ${MAX_ROWS.toLocaleString()}. Split it into smaller files.`);
  if (!body.length) throw new ImportFileError("no_rows", "The file has a header row but no data rows.");
  // Drop columns that are entirely empty.
  const used = headers.filter((_, i) => body.some((r) => cellJson(r[i]) != null) || rawHeaders[i]);
  const rows = body.map((r) => Object.fromEntries(headers.map((h, i) => [h, cellJson(r[i])]).filter(([h]) => used.includes(h as string))));
  return { headers: used, rows };
}

/**
 * Validates and parses an uploaded CSV or XLSX file. Validation does not trust the
 * browser-supplied MIME type: the extension and the file's leading bytes must agree.
 */
export async function parseUpload(name: string, bytes: Buffer): Promise<ParsedSheet> {
  if (!bytes.length) throw new ImportFileError("empty", "The file is empty.");
  if (bytes.length > MAX_FILE_BYTES) throw new ImportFileError("too_large", "Files must be 4 MB or smaller. Split larger exports into several files.");
  const ext = name.toLowerCase().split(".").pop();
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

  if (ext === "xlsx") {
    if (!isZip) throw new ImportFileError("corrupt", "This does not look like a valid .xlsx workbook. Re-export it from Excel or save it as CSV.");
    let data: unknown[][];
    try {
      data = (await readSheet(bytes)) as unknown[][];
    } catch {
      throw new ImportFileError("corrupt", "The workbook could not be read. It may be password-protected or damaged. Save it as CSV and try again.");
    }
    return { ...toRecords(data), kind: "xlsx", mime: XLSX_MIME };
  }
  if (ext === "csv" || ext === "txt") {
    if (isZip || bytes.includes(0x00)) throw new ImportFileError("unsupported", "This file contains binary data. Upload a CSV or XLSX export.");
    let text = bytes.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimiter: "" });
    if (parsed.errors.some((e) => e.type === "Quotes")) {
      throw new ImportFileError("corrupt", "The CSV has unbalanced quotation marks. Re-export it from your case-management system.");
    }
    return { ...toRecords(parsed.data), kind: "csv", mime: "text/csv" };
  }
  if (ext === "xls") throw new ImportFileError("unsupported", "Legacy .xls workbooks are not supported. Save the file as .xlsx or CSV.");
  throw new ImportFileError("unsupported", "Upload a .csv or .xlsx file.");
}
