import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  APPROVED,
  findUnapproved,
  listAllowlistDescriptions,
} from './check-gitleaks-allowlist.mjs';

const block = (description) =>
  `[[allowlists]]\ndescription = "${description}"\npaths = ['''x''']\n`;

test('liệt kê description của từng khối allowlists', () => {
  const toml = `title = "x"\n${block('A một')}\n${block('B hai')}`;
  assert.deepEqual(listAllowlistDescriptions(toml), ['A một', 'B hai']);
});

test('allowlist đã duyệt (theo tiền tố) được chấp nhận', () => {
  const toml = APPROVED.map((prefix) => block(`${prefix} — ghi chú thêm`)).join('\n');
  assert.deepEqual(findUnapproved(toml), []);
});

test('allowlist lạ bị báo (không cho nới cấu hình)', () => {
  const toml = `${block(APPROVED[0])}\n${block("Khóa GIẢ 'abc' trong test")}`;
  assert.deepEqual(findUnapproved(toml), ["Khóa GIẢ 'abc' trong test"]);
});

test('khối không có description bị coi là chưa duyệt', () => {
  const toml = "[[allowlists]]\npaths = ['''x''']\n";
  assert.equal(findUnapproved(toml).length, 1);
});
