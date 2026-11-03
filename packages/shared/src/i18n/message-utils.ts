export type MessageTree = { [key: string]: string | MessageTree };

/** Làm phẳng cây chuỗi thành `{ 'a.b.c': 'văn bản' }`. */
export function flattenMessages(tree: MessageTree, prefix = ''): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') flat[path] = value;
    else Object.assign(flat, flattenMessages(value, path));
  }
  return flat;
}

/** Tên các biến ICU đơn giản `{tên}` trong một chuỗi, không trùng, đã sắp xếp. */
export function placeholdersOf(message: string): string[] {
  const names = [...message.matchAll(/\{\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1] as string);
  return [...new Set(names)].sort();
}
