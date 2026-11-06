// Khai báo bốn bộ tài liệu GHÉP TỰ ĐỘNG (file nhỏ trong thư mục `*.d` → một file ghép).
// File ghép KHÔNG commit (đã .gitignore): `pnpm docs:build` sinh ra, nhánh song song chỉ thêm FILE RIÊNG.
// `rules` = định dạng bắt buộc của từng loại file nhỏ (kiểm ở `docs-check.mjs`).

const root = (path) => new URL(`../../${path}`, import.meta.url);

export const DOCS_TARGETS = [
  {
    label: 'codemap',
    command: 'pnpm codemap:build',
    dir: root('docs/codemap.d/'),
    out: root('docs/codemap.md'),
    outName: 'docs/codemap.md',
    sections: [
      { head: '_00-dau.md' },
      { head: '_lenh.md', prefix: 'lenh-' },
      { head: '_cay.md', prefix: 'cay-' },
      { head: '_mien.md', prefix: 'mien-' },
      { head: '_diem-vao.md', prefix: 'diem-vao-' },
      { head: '_bay.md', prefix: 'bay-' },
    ],
    rules: [
      { prefix: 'lenh-', start: /^\| /, what: 'một hàng bảng (`| …`)' },
      { prefix: 'cay-', start: /^\| /, what: 'một hàng bảng (`| …`)' },
      { prefix: 'mien-', start: /^(\| |- )/, what: 'một hàng bảng (`| …`) hoặc gạch đầu dòng (`- …`)' },
      { prefix: 'diem-vao-', start: /^\| /, what: 'một hàng bảng (`| …`)' },
      { prefix: 'bay-', start: /^- /, what: 'một gạch đầu dòng (`- …`)' },
    ],
  },
  {
    label: 'quyet-dinh',
    command: 'pnpm quyet:build',
    dir: root('docs/plans/quyet-dinh/'),
    out: root('docs/plans/QUYET_DINH_CHO_DUYET.md'),
    outName: 'docs/plans/QUYET_DINH_CHO_DUYET.md',
    sections: [
      { head: '_bang.md', prefix: 'q' },
      { head: '_docs.md', prefix: 'docs-' },
    ],
    rules: [
      { prefix: 'q', start: /^\| Q[^|]*\|/, what: 'một hàng bảng bắt đầu `| Q<mã> |`', code: /^\|\s*(Q[^|\s]*)\s*\|/ },
      { prefix: 'docs-', start: /^- /, what: 'một gạch đầu dòng (`- …`)' },
    ],
  },
  {
    label: 'can-ban-cung-cap',
    command: 'pnpm cbcc:build',
    dir: root('docs/can-ban-cung-cap.d/'),
    out: root('docs/CAN_BAN_CUNG_CAP.md'),
    outName: 'docs/CAN_BAN_CUNG_CAP.md',
    sections: [{ head: '_00-dau.md', prefix: '', separator: '\n\n' }],
    rules: [{ prefix: '', start: /^## /, what: 'cả một mục (`## <số>. <tên> — …`)' }],
  },
  {
    label: 'kiem-tra-tay',
    command: 'pnpm kt:build',
    dir: root('docs/testing/kiem-tra-tay.d/'),
    out: root('docs/testing/KIEM_TRA_TAY.md'),
    outName: 'docs/testing/KIEM_TRA_TAY.md',
    sections: [
      { head: '_trang-thai.md', prefix: 'tt-' },
      { head: '_muc.md', prefix: 'kt-', separator: '\n\n' },
      { head: '_mau.md' },
    ],
    // mã KT lấy từ tên file, dòng đầu phải khớp mã đó
    byFileName: [
      { re: /^kt-(.+)\.md$/, first: (code) => `## KT-${code} — ` },
      { re: /^tt-(.+)\.md$/, first: (code) => `| KT-${code} |` },
    ],
  },
];
