import { describe, expect, it } from 'vitest';
import { buildRemoteCommand, CfDevCommandError } from './cf-dev-command.mjs';

describe('buildRemoteCommand', () => {
  it('luôn gắn project cf-dev và hai file compose của dev', () => {
    const command = buildRemoteCommand(['up', '-d', 'postgres']);
    expect(command).toContain('docker compose -p cf-dev ');
    expect(command).toContain('-f infra/docker-compose.yml -f infra/docker-compose.dev.yml');
    expect(command.endsWith('up -d postgres')).toBe(true);
  });

  it('cho phép ps, logs, down, restart, build', () => {
    for (const sub of ['ps', 'logs', 'down', 'restart', 'build']) {
      expect(() => buildRemoteCommand([sub])).not.toThrow();
    }
  });

  it('từ chối lệnh con ngoài danh sách (exec, rm, run, cp…)', () => {
    for (const sub of ['exec', 'rm', 'run', 'cp', 'kill']) {
      expect(() => buildRemoteCommand([sub])).toThrow(CfDevCommandError);
    }
  });

  it('từ chối xóa volume, đổi project hoặc file compose', () => {
    expect(() => buildRemoteCommand(['down', '-v'])).toThrow(/Cờ bị cấm/);
    expect(() => buildRemoteCommand(['down', '--volumes'])).toThrow(/Cờ bị cấm/);
    expect(() => buildRemoteCommand(['ps', '-p', 'cf-x'])).toThrow(/Cờ bị cấm/);
    expect(() => buildRemoteCommand(['ps', '-f', 'x.yml'])).toThrow(/Cờ bị cấm/);
  });

  it('từ chối --project-directory (đổi nơi tính đường dẫn bind mount / build context)', () => {
    expect(() => buildRemoteCommand(['up', '--project-directory', '/tmp'])).toThrow(/Cờ bị cấm/);
    expect(() => buildRemoteCommand(['up', '--project-directory=/tmp'])).toThrow(/Cờ bị cấm/);
  });

  it('từ chối cờ nguy hiểm dạng --flag=giá-trị', () => {
    expect(() => buildRemoteCommand(['down', '--volumes=true'])).toThrow(/Cờ bị cấm/);
    expect(() => buildRemoteCommand(['ps', '--project-name=cf-x'])).toThrow(/Cờ bị cấm/);
    expect(() => buildRemoteCommand(['up', '--file=x.yml'])).toThrow(/Cờ bị cấm/);
  });

  it('từ chối cờ ngắn viết dính chứa v/p/f (-pfoo, -fx.yml, -vt1, -dv); vẫn cho -d, --build, --tail=50', () => {
    for (const bad of ['-pfoo', '-fx.yml', '-vt1', '-dv', '-vf', '-pcf-x']) {
      expect(() => buildRemoteCommand(['up', bad]), bad).toThrow(/Cờ bị cấm/);
    }
    expect(() => buildRemoteCommand(['up', '-d', '--build'])).not.toThrow();
    expect(() => buildRemoteCommand(['logs', '--tail=50', 'litellm'])).not.toThrow();
    expect(() => buildRemoteCommand(['logs', '-t', 'litellm'])).not.toThrow();
  });

  it('tên nhánh không được bắt đầu bằng dấu - và lệnh checkout có "--" chặn hiểu nhầm thành đường dẫn', () => {
    expect(() => buildRemoteCommand(['sync', '-f'])).toThrow(CfDevCommandError);
    expect(() => buildRemoteCommand(['sync', '--force'])).toThrow(CfDevCommandError);
    expect(buildRemoteCommand(['sync', 'chore/scaffold'])).toContain(
      'git checkout chore/scaffold --',
    );
  });

  it('từ chối mọi nhắc tới staging và ký tự điều khiển shell', () => {
    expect(() => buildRemoteCommand(['ps', 'cf-staging'])).toThrow(CfDevCommandError);
    expect(() => buildRemoteCommand(['logs', 'web; rm -rf /'])).toThrow(/không hợp lệ/);
    expect(() => buildRemoteCommand(['logs', '$(id)'])).toThrow(/không hợp lệ/);
  });

  it('config chỉ chạy với -q để không in bí mật', () => {
    expect(() => buildRemoteCommand(['config'])).toThrow(/-q/);
    expect(() => buildRemoteCommand(['config', '-q'])).not.toThrow();
  });

  it('stats dùng danh sách container của đúng project cf-dev', () => {
    expect(buildRemoteCommand(['stats'])).toContain('docker compose -p cf-dev');
  });

  it('sync chỉ nhận một tên nhánh hợp lệ', () => {
    expect(buildRemoteCommand(['sync', 'chore/scaffold'])).toContain('git checkout chore/scaffold');
    expect(() => buildRemoteCommand(['sync'])).toThrow(CfDevCommandError);
    expect(() => buildRemoteCommand(['sync', 'a b'])).toThrow(CfDevCommandError);
    expect(() => buildRemoteCommand(['sync', 'x;y'])).toThrow(CfDevCommandError);
  });

  it('thiếu lệnh con thì báo lỗi', () => {
    expect(() => buildRemoteCommand([])).toThrow(CfDevCommandError);
  });
});
