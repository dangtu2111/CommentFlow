// Đối chiếu NỘI DUNG chữ giữa HTML Stitch và trang thật (UI-first, QUY TẮC ĐỦ THÀNH PHẦN).
// Phần thuần (không cần trình duyệt) — phần Playwright ở scripts/ui-completeness.mjs.

/** Chuẩn hóa một đoạn chữ: bỏ [MẪU], số liệu cụ thể, dấu cách thừa; hạ chữ thường. Chỉ còn ký hiệu → ''. */
export function normalizeText(raw) {
  const text = String(raw ?? '')
    .replace(/^\s*\[[^\]]*\]\s*/u, '')
    .toLowerCase()
    .replace(/\d+(?:[.,:]\d+)*\s*(?:%|₫|[đk](?!\p{L}))?/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return /[\p{L}]/u.test(text) ? text : '';
}

/** So hai danh sách chữ: mục của HTML phải xuất hiện (nguyên chuỗi hoặc nằm trong chuỗi dài hơn) ở trang. */
export function compareTexts(htmlTexts, pageTexts) {
  const wanted = [...new Set(htmlTexts.map(normalizeText).filter(Boolean))];
  const pageJoined = [...new Set(pageTexts.map(normalizeText).filter(Boolean))].join('\n');
  const matched = [];
  const missing = [];
  for (const item of wanted) (pageJoined.includes(item) ? matched : missing).push(item);
  const total = wanted.length;
  const percent = total === 0 ? 100 : (matched.length / total) * 100;
  return { total, matched, missing, percent };
}

export function formatReport(slug, route, result) {
  const lines = [
    `# Báo cáo đủ thành phần — ${slug} (${route})`,
    '',
    `Khớp ${result.matched.length}/${result.total} = ${result.percent.toFixed(1)}%`,
    '',
    result.missing.length === 0 ? 'Không thiếu mục nào.' : `Thiếu ${result.missing.length} mục:`,
    ...result.missing.map((m) => `- ${m}`),
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * Chạy trong trình duyệt (page.evaluate): thu mọi chữ nhìn thấy — text node, placeholder, aria-label, title,
 * value của nút, <option>. Bỏ script/style/head/svg. Không phụ thuộc DOM của Node.
 */
export function collectVisibleTextsInBrowser(rootSelector) {
  const out = [];
  const skip = new Set(['SCRIPT', 'STYLE', 'HEAD', 'NOSCRIPT', 'SVG', 'TEMPLATE']);
  const hidden = (el) => {
    const s = getComputedStyle(el);
    return s.display === 'none' || s.visibility === 'hidden';
  };
  const walk = (node) => {
    if (node.nodeType === 3) {
      const t = node.textContent.replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
      return;
    }
    if (node.nodeType !== 1 || skip.has(node.tagName.toUpperCase()) || hidden(node)) return;
    if (/material-(symbols|icons)/.test(node.getAttribute('class') ?? '')) return; // tên biểu tượng không phải chữ
    for (const attr of ['placeholder', 'aria-label', 'title', 'alt']) {
      const v = node.getAttribute(attr);
      if (v) out.push(v);
    }
    if (node.tagName === 'INPUT' && ['button', 'submit'].includes(node.type) && node.value) {
      out.push(node.value);
    }
    for (const child of node.childNodes) walk(child);
  };
  // Vỏ ứng dụng (thanh bên, thanh trên) có kit riêng: mặc định chỉ đối chiếu vùng <main>, không có thì cả trang.
  walk((rootSelector && document.querySelector(rootSelector)) || document.body);
  return out;
}
