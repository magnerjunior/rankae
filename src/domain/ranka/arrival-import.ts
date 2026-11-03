import { normalizePlayerSearch } from "./rules";

export interface ArrivalImportEntry {
  fullName: string;
  role: "line" | "keeper";
}

export interface ArrivalImportResult {
  entries: ArrivalImportEntry[];
  ignoredLines: number[];
}

export function parseArrivalList(value: string): ArrivalImportResult {
  const entries: ArrivalImportEntry[] = [];
  const ignoredLines: number[] = [];
  const seen = new Set<string>();

  value.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const keeper = line.match(/^(?:gk|gol|goleiro)\s*[-:.)]?\s*(.+)$/i);
    const numbered = line.match(/^\d+\s*[-:.)]?\s*(.+)$/);
    const fullName = (keeper?.[1] ?? numbered?.[1] ?? line).trim().replace(/\s+/g, " ");
    const normalized = normalizePlayerSearch(fullName);
    if (fullName.length < 2 || fullName.length > 120 || !normalized || seen.has(normalized)) {
      ignoredLines.push(index + 1);
      return;
    }
    seen.add(normalized);
    entries.push({ fullName, role: keeper ? "keeper" : "line" });
  });

  return { entries, ignoredLines };
}
