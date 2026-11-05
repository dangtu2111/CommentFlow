import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findNonLoopbackPostgresPorts, postgresPorts } from './compose-ports.mjs';

// Cú pháp biến của compose (`$` + `{…}`), ghép tách để không bị lint nhầm là template string.
const PORT_EXPR = `$${'{CF_STAGING_DB_PORT:-5434}'}`;
const compose = (portsBlock) => `services:
  postgres:
    image: x
${portsBlock}
  valkey:
    ports: ["6379:6379"]
`;

describe('findNonLoopbackPostgresPorts', () => {
  it('xanh khi dạng inline chỉ nghe 127.0.0.1', () => {
    expect(
      findNonLoopbackPostgresPorts(compose(`    ports: ["127.0.0.1:${PORT_EXPR}:5432"]`)),
    ).toEqual([]);
  });

  it('xanh khi dạng danh sách chỉ nghe 127.0.0.1', () => {
    expect(
      findNonLoopbackPostgresPorts(compose('    ports:\n      - "127.0.0.1:5434:5432"')),
    ).toEqual([]);
  });

  it('xanh khi không có ports', () => {
    expect(findNonLoopbackPostgresPorts(compose(''))).toEqual([]);
  });

  it('đỏ khi 0.0.0.0', () => {
    expect(findNonLoopbackPostgresPorts(compose('    ports: ["0.0.0.0:5434:5432"]'))).toHaveLength(
      1,
    );
  });

  it('đỏ khi bỏ trống host (Docker hiểu là mọi giao diện)', () => {
    expect(findNonLoopbackPostgresPorts(compose('    ports: ["5434:5432"]'))).toHaveLength(1);
    expect(findNonLoopbackPostgresPorts(compose('    ports:\n      - 5432'))).toHaveLength(1);
  });

  it('đỏ khi IPv6 mọi giao diện', () => {
    expect(findNonLoopbackPostgresPorts(compose('    ports: ["[::]:5434:5432"]'))).toHaveLength(1);
  });

  it('đỏ khi một trong nhiều mục không phải loopback', () => {
    const block = '    ports:\n      - "127.0.0.1:5434:5432"\n      - "5435:5432"';
    expect(findNonLoopbackPostgresPorts(compose(block))).toHaveLength(1);
  });

  it('đỏ khi dạng object (host_ip không kiểm được bằng cách đọc chuỗi)', () => {
    const block = '    ports:\n      - target: 5432\n        published: 5434';
    expect(findNonLoopbackPostgresPorts(compose(block)).length).toBeGreaterThan(0);
  });

  it('không tính ports của dịch vụ khác', () => {
    expect(postgresPorts(compose(''))).toEqual([]);
  });
});

describe('compose thật của repo', () => {
  const read = (f) => readFileSync(new URL(`../../infra/${f}`, import.meta.url), 'utf8');

  it('staging publish Postgres đúng 127.0.0.1:<CF_STAGING_DB_PORT, mặc định 5434>:5432', () => {
    expect(postgresPorts(read('docker-compose.staging.yml'))).toEqual([
      `127.0.0.1:${PORT_EXPR}:5432`,
    ]);
  });

  it('compose nền và staging không mở Postgres ra ngoài loopback', () => {
    expect(findNonLoopbackPostgresPorts(read('docker-compose.yml'))).toEqual([]);
    expect(findNonLoopbackPostgresPorts(read('docker-compose.staging.yml'))).toEqual([]);
  });

  it('env.cf-staging.example khai báo CF_STAGING_DB_PORT (chỉ tên)', () => {
    expect(read('env.cf-staging.example')).toMatch(/^CF_STAGING_DB_PORT=[ \t]*(#.*)?$/m);
  });
});
