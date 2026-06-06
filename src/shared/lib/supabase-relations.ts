export function relationName(relation: { name?: string } | { name?: string }[] | null | undefined, fallback: string) {
  if (Array.isArray(relation)) return relation[0]?.name ?? fallback;
  return relation?.name ?? fallback;
}
