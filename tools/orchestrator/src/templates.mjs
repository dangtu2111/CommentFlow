// Điền {{biến}} vào prompt khung. Thiếu biến → báo lỗi (không để lọt chữ {{...}} vào prompt).
export function renderTemplate(text, vars) {
  return text.replace(/\{\{\s*([A-Za-z][\w]*)\s*\}\}/g, (_, key) => {
    if (!(key in vars)) throw new Error(`Prompt thiếu biến {{${key}}}`);
    return String(vars[key]);
  });
}

export function bullets(items, empty = '(không có)') {
  return items.length === 0 ? empty : items.map((i) => `- ${i}`).join('\n');
}
