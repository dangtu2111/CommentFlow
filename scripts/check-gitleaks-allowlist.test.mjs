import { describe, expect, it } from 'vitest';
import {
  APPROVED,
  findUnapproved,
  listAllowlistDescriptions,
} from './check-gitleaks-allowlist.mjs';

const block = (description) =>
  `[[allowlists]]\ndescription = "${description}"\npaths = ['''x''']\n`;

describe('check-gitleaks-allowlist', () => {
  it('liệt kê description của từng khối allowlists', () => {
    const toml = `title = "x"\n${block('A một')}\n${block('B hai')}`;
    expect(listAllowlistDescriptions(toml)).toEqual(['A một', 'B hai']);
  });

  it('allowlist đã duyệt (theo tiền tố) được chấp nhận', () => {
    const toml = APPROVED.map((prefix) => block(`${prefix} — ghi chú thêm`)).join('\n');
    expect(findUnapproved(toml)).toEqual([]);
  });

  it('allowlist lạ bị báo (không cho nới cấu hình)', () => {
    const toml = `${block(APPROVED[0])}\n${block("Khóa GIẢ 'abc' trong test")}`;
    expect(findUnapproved(toml)).toEqual(["Khóa GIẢ 'abc' trong test"]);
  });

  it('khối không có description bị coi là chưa duyệt', () => {
    const toml = "[[allowlists]]\npaths = ['''x''']\n";
    expect(findUnapproved(toml)).toHaveLength(1);
  });
});
