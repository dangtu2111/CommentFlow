// So HÌNH HỌC giữa HTML Stitch và trang thật: hộp bao + vài thuộc tính tính toán của các phần tử mốc.
// Hàm `measureLandmarksInBrowser` chạy TRONG trình duyệt (Playwright `page.evaluate`) nên phải tự đứng được.

/** Mốc mặc định: mỗi mốc có danh sách selector thử lần lượt (phần tử nhìn thấy đầu tiên khớp thì lấy). */
export const DEFAULT_LANDMARKS = [
  { name: 'header', selectors: ['body > header', 'header', '[role=banner]'] },
  { name: 'thanh bên', selectors: ['aside', '[data-landmark=sidebar]', 'nav[aria-label]'] },
  { name: 'tiêu đề', selectors: ['h1'] },
  { name: 'card', selectors: ['[data-landmark=card]', '.card', 'main section', 'main article'] },
  {
    name: 'nút chính',
    selectors: [
      '[data-landmark=primary-button]',
      'main button.btn-primary',
      'main button[class*="bg-primary"]',
      'main a[class*="bg-primary"]',
      'main button[type=submit]',
    ],
  },
];

export const STYLE_PROPS = [
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginBottom',
  'fontSize',
  'color',
  'backgroundColor',
];

/** Chạy trong trình duyệt: trả { [tên mốc]: { box, style } | null }. */
export function measureLandmarksInBrowser({ landmarks, styleProps }) {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const result = {};
  for (const { name, selectors } of landmarks) {
    let found = null;
    for (const selector of selectors) {
      found = [...document.querySelectorAll(selector)].find(visible) ?? null;
      if (found) break;
    }
    if (!found) {
      result[name] = null;
      continue;
    }
    const r = found.getBoundingClientRect();
    const cs = getComputedStyle(found);
    result[name] = {
      box: { width: r.width, height: r.height },
      style: Object.fromEntries(styleProps.map((p) => [p, cs[p]])),
    };
  }
  return result;
}

const px = (value) => (/^-?[\d.]+px$/.test(value) ? Number.parseFloat(value) : null);

/** Chuẩn hóa màu về chuỗi so sánh được (rgb/rgba giữ nguyên; trong suốt coi như một giá trị). */
const normColor = (c) => c.replace(/\s+/g, '');

/**
 * So hai kết quả đo. Số (px) lệch ≤ `tolerance` là đạt; màu phải trùng chính xác.
 * Trả danh sách dòng { landmark, prop, stitch, real, delta, ok }.
 */
export function compareGeometry(stitch, real, tolerance = 2) {
  const rows = [];
  for (const name of new Set([...Object.keys(stitch), ...Object.keys(real)])) {
    const a = stitch[name];
    const b = real[name];
    if (!a || !b) {
      rows.push({
        landmark: name,
        prop: '(phần tử)',
        stitch: a ? 'có' : 'không thấy',
        real: b ? 'có' : 'không thấy',
        delta: null,
        ok: !a && !b,
      });
      continue;
    }
    const entries = [
      ...Object.entries(a.box).map(([k, v]) => [k, `${v}px`, `${b.box[k]}px`]),
      ...Object.entries(a.style).map(([k, v]) => [k, v, b.style[k]]),
    ];
    for (const [prop, av, bv] of entries) {
      const an = px(av);
      const bn = px(bv);
      const numeric = an !== null && bn !== null;
      const delta = numeric ? Math.round((bn - an) * 100) / 100 : null;
      const ok = numeric ? Math.abs(delta) <= tolerance : normColor(av) === normColor(bv);
      rows.push({ landmark: name, prop, stitch: av, real: bv, delta, ok });
    }
  }
  return rows;
}

export function formatGeometryReport(slug, route, rows, tolerance) {
  const bad = rows.filter((r) => !r.ok);
  const lines = [
    `## Hình học: ${slug} ↔ ${route} (ngưỡng ≤ ${tolerance}px)`,
    '',
    `Lệch ${bad.length}/${rows.length} chỉ số.`,
    '',
  ];
  if (bad.length > 0) {
    lines.push('| Mốc | Chỉ số | Stitch | Trang thật | Lệch |', '|---|---|---|---|---|');
    for (const r of bad) {
      lines.push(`| ${r.landmark} | ${r.prop} | ${r.stitch} | ${r.real} | ${r.delta ?? '—'} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
