import { expect, test } from 'vitest';
import { compareGeometry } from './ui-geometry.mjs';

const mark = (width, padding, color) => ({
  box: { width, height: 40 },
  style: { paddingTop: padding, color },
});

test('lệch ≤ ngưỡng thì đạt, quá ngưỡng thì báo', () => {
  const rows = compareGeometry(
    { header: mark(100, '16px', 'rgb(0, 0, 0)') },
    { header: mark(101.5, '20px', 'rgb(0, 0, 0)') },
    2,
  );
  expect(rows.find((r) => r.prop === 'width').ok).toBe(true);
  const padding = rows.find((r) => r.prop === 'paddingTop');
  expect(padding.ok).toBe(false);
  expect(padding.delta).toBe(4);
});

test('màu phải trùng chính xác; thiếu phần tử ở một bên là lệch', () => {
  const rows = compareGeometry(
    { a: mark(10, '0px', 'rgb(0, 0, 0)'), b: mark(1, '0px', 'rgb(1, 1, 1)') },
    { a: mark(10, '0px', 'rgb(0, 0, 1)'), b: null },
  );
  expect(rows.find((r) => r.landmark === 'a' && r.prop === 'color').ok).toBe(false);
  expect(rows.find((r) => r.landmark === 'b').ok).toBe(false);
});
