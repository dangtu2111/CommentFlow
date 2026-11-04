// Truy vết FR → test (docs/testing/STANDARD.md §2). Hàm thuần, không đọc đĩa; script gọi: scripts/check-test-trace.mjs.

const FR_PATTERN = /FR-(\d{3})(?!\d)(?:\s*[–-]\s*(\d{3})(?!\d)|((?:\s*,\s*\d{3}(?![\d-]))+))?/g;

const pad = (n) => String(n).padStart(3, '0');

/** Lấy mã FR từ một chuỗi: `FR-034`, khoảng `FR-001–005`/`FR-002-004`, danh sách rút gọn `FR-001, 119`. */
export function extractFrCodes(text) {
  const codes = new Set();
  for (const match of text.matchAll(FR_PATTERN)) {
    const first = Number(match[1]);
    codes.add(`FR-${pad(first)}`);
    if (match[2]) {
      // Khoảng viết tắt kiểu `FR-001–005` (đuôi 3 chữ số) — chỉ nhận khi đuôi lớn hơn đầu.
      const last = Number(match[2]);
      for (let n = first + 1; n <= last; n += 1) codes.add(`FR-${pad(n)}`);
    }
    if (match[3]) {
      for (const tail of match[3].matchAll(/\d{3}/g)) codes.add(`FR-${tail[0]}`);
    }
  }
  return [...codes];
}

/** Dòng bảng gap matrix có trạng thái bắt đầu bằng ✅ → { id, codes } (mã FR lấy từ cột "Yêu cầu"). */
export function parseDoneFrCodes(gapMatrixMarkdown) {
  const rows = [];
  for (const line of gapMatrixMarkdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 8) continue;
    const [id, requirement, status] = cells;
    if (!status.startsWith('✅')) continue;
    const codes = extractFrCodes(requirement ?? '');
    if (codes.length > 0) rows.push({ id, codes });
  }
  return rows;
}

const TEST_CALL =
  /\b(?:describe|it|test)(?:\.\w+)*(?:\((?:[^()]|\([^()]*\))*\))?\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

/** Mã FR nằm trong TIÊU ĐỀ describe/it/test (không tính chú thích hay chuỗi ngoài lời gọi test). */
export function frCodesInTestTitles(source) {
  const codes = new Set();
  for (const match of source.matchAll(TEST_CALL)) {
    for (const code of extractFrCodes(match[2])) codes.add(code);
  }
  return codes;
}

/**
 * So mã FR của các dòng Xong với mã FR có trong tên test.
 * Đỏ (ok=false) chỉ khi có mã thiếu test VÀ không nằm trong baseline ("nợ truy vết" đã ghi nhận).
 */
export function compareTrace({ rows, tested, baseline }) {
  const rowsByCode = new Map();
  for (const row of rows) {
    for (const code of row.codes) {
      rowsByCode.set(code, [...(rowsByCode.get(code) ?? []), row.id]);
    }
  }
  const baselineSet = new Set(baseline);
  const untested = [...rowsByCode.keys()].filter((code) => !tested.has(code)).sort();
  const newMissing = untested
    .filter((code) => !baselineSet.has(code))
    .map((code) => ({ code, rows: rowsByCode.get(code) }));
  return {
    ok: newMissing.length === 0,
    newMissing,
    remainingDebt: untested.filter((code) => baselineSet.has(code)),
    removableFromBaseline: baseline.filter((code) => tested.has(code)).sort(),
    staleBaseline: baseline.filter((code) => !rowsByCode.has(code)).sort(),
  };
}
