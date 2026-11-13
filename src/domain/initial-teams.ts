export function validInitialSelection(ids: string[], size: number): boolean {
 return Number.isInteger(size) && size >= 2 && size <= 12 && ids.length === size * 2 && ids.every(Boolean) && new Set(ids).size === ids.length;
}
