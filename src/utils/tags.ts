/** Normalize a comma-separated tag string for storage:
 *  "Healthy Cooking, Bake Mat" → "healthy-cooking, bake-mat"
 */
export function normalizeTags(raw: string): string {
  return (raw || '')
    .split(',')
    .map(t => t.trim().toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, ''))
    .filter(Boolean)
    .join(', ');
}

/** Pretty-display a single normalized tag:
 *  "healthy-cooking" → "Healthy Cooking"
 */
export function displayTag(tag: string): string {
  return tag.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
