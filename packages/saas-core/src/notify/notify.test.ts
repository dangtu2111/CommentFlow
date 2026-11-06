import nodemailer, { type Transporter } from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryTransport,
  createNodemailerTransport,
  createNotifier,
  type EmailInput,
  renderEmail,
} from './index';

const recipient = { name: 'Linh', email: 'linh@example.test' };
const VERIFY: EmailInput = {
  kind: 'verify-email',
  url: 'https://app.example.test/verify?token=t1',
};

describe('renderEmail', () => {
  it('có đủ chủ đề, nội dung, nút và link ở cả hai ngôn ngữ cho từng loại thư', () => {
    const inputs: EmailInput[] = [
      VERIFY,
      { kind: 'reset-password', url: 'https://app.example.test/reset?token=t2' },
      {
        kind: 'account-exists',
        loginUrl: 'https://app.example.test/login',
        resetUrl: 'https://app.example.test/forgot-password',
      },
    ];
    for (const input of inputs) {
      const vi = renderEmail(input, 'vi', recipient);
      const en = renderEmail(input, 'en', recipient);
      expect(vi.subject).not.toBe(en.subject);
      expect(vi.to).toBe('linh@example.test');
      for (const mail of [vi, en]) {
        expect(mail.subject.length).toBeGreaterThan(5);
        expect(mail.text).toContain('https://app.example.test/');
        expect(mail.html).toContain('<a href="https://app.example.test/');
      }
      expect(vi.text).toContain('Chào Linh');
      expect(en.text).toContain('Hi Linh');
    }
  });

  it('thư đã có tài khoản chứa cả link đăng nhập và đặt lại; thư đặt lại nói rõ thời hạn 1 giờ', () => {
    const exists = renderEmail(
      {
        kind: 'account-exists',
        loginUrl: 'https://a.test/login',
        resetUrl: 'https://a.test/forgot-password',
      },
      'vi',
      recipient,
    );
    expect(exists.text).toContain('https://a.test/login');
    expect(exists.text).toContain('https://a.test/forgot-password');
    expect(
      renderEmail({ kind: 'reset-password', url: 'https://a.test/r' }, 'vi', recipient).text,
    ).toContain('1 giờ');
  });

  it('thoát HTML tên người nhận và không cho scheme lạ lọt vào link', () => {
    const mail = renderEmail(VERIFY, 'en', {
      name: '<script>alert(1)</script>&"',
      email: 'x@example.test',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(() =>
      renderEmail({ kind: 'verify-email', url: 'javascript:alert(1)' }, 'vi', recipient),
    ).toThrow();
  });

  it('tên chứa ký tự xuống dòng không chèn được dòng mới vào thư', () => {
    const mail = renderEmail(VERIFY, 'vi', {
      name: 'A\r\nBcc: x@evil.test',
      email: 'x@example.test',
    });
    expect(mail.text.split('\n')[0]).toBe('Chào A Bcc: x@evil.test,');
  });
});

describe('tên hiển thị', () => {
  it('bỏ ký tự đảo chiều chữ (không giả được nội dung trong lời chào)', () => {
    const mail = renderEmail(VERIFY, 'vi', {
      name: 'Linh\u202eesirpruS\u2066x',
      email: 'x@example.test',
    });
    expect(mail.text).not.toMatch(/[\u202a-\u202e\u2066-\u2069]/);
    expect(mail.html).not.toMatch(/[\u202a-\u202e\u2066-\u2069]/);
  });
});

describe('createNotifier', () => {
  it('sendNow dựng thư theo ngôn ngữ người nhận và giao cho transport', async () => {
    const transport = createMemoryTransport();
    const notifier = createNotifier({ transport });
    await notifier.sendNow({ ...recipient, locale: 'en' }, VERIFY);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]?.subject).toContain('Verify your email');
  });

  it('sendInBackground không ném lỗi, trả về ngay, và báo lỗi ĐÃ LỌC (không có địa chỉ, URL, token)', async () => {
    const onFailure = vi.fn();
    const notifier = createNotifier({
      transport: {
        send: async () => {
          throw Object.assign(new Error('Recipient linh@example.test rejected token=t1'), {
            cause: { code: 'ECONNREFUSED' },
          });
        },
      },
      onFailure,
    });
    expect(() => notifier.sendInBackground({ ...recipient, locale: 'vi' }, VERIFY)).not.toThrow();
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledTimes(1));
    expect(onFailure).toHaveBeenCalledWith({ kind: 'verify-email', reason: 'ECONNREFUSED' });
    expect(JSON.stringify(onFailure.mock.calls)).not.toMatch(/linh@|token=|https?:/);
  });
});

describe('createNodemailerTransport', () => {
  it('truyền đúng from/to/subject và cả bản text lẫn html cho nodemailer', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const transport = createNodemailerTransport(
      { sendMail } as unknown as Transporter,
      'CommentFlow AI <no-reply@example.test>',
    );
    const mail = renderEmail(VERIFY, 'vi', recipient);
    await transport.send(mail);
    expect(sendMail).toHaveBeenCalledWith({
      from: 'CommentFlow AI <no-reply@example.test>',
      to: 'linh@example.test',
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  });

  it('lỗi gửi được bọc thành AppError INTERNAL, thông báo không chứa địa chỉ nhận', async () => {
    const broken = nodemailer.createTransport({
      host: '127.0.0.1',
      port: 1,
      connectionTimeout: 500,
    });
    const transport = createNodemailerTransport(broken, 'no-reply@example.test');
    await expect(transport.send(renderEmail(VERIFY, 'vi', recipient))).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'Không gửi được email.',
    });
  });
});

describe('thư mời workspace và báo đổi Owner', () => {
  const invite: EmailInput = {
    kind: 'workspace-invite',
    url: 'https://app.example.test/invite/tok123',
    workspaceName: 'Shop An',
    role: 'staff',
    inviterName: 'Linh',
    days: 7,
  };
  const change = (name: string, actor = 'Minh'): EmailInput => ({
    kind: 'owner-change',
    url: 'https://app.example.test/app/members',
    workspaceName: 'Shop An',
    change: 'added',
    targetName: name,
    actorName: actor,
  });

  it('thư mời có tên workspace, vai trò, số ngày, link — cả vi và en', () => {
    const vi = renderEmail(invite, 'vi', recipient);
    const en = renderEmail(invite, 'en', recipient);
    expect(vi.subject).toContain('Shop An');
    expect(vi.text).toContain('7 ngày');
    expect(vi.text).toContain('Staff (nhân viên)');
    expect(en.text).toContain('7 days');
    expect(en.text).toContain('Staff');
    for (const mail of [vi, en]) {
      expect(mail.text).toContain('https://app.example.test/invite/tok123');
      expect(mail.html).toContain('<a href="https://app.example.test/invite/tok123"');
    }
  });

  it('thư báo đổi Owner nêu người thực hiện, người bị đổi và đúng loại thay đổi', () => {
    for (const kind of ['added', 'role_changed', 'removed'] as const) {
      const mail = renderEmail({ ...change('Hà'), change: kind } as EmailInput, 'vi', recipient);
      expect(mail.text).toContain('Minh');
      expect(mail.text).toContain('Hà');
      expect(mail.text).toContain('Shop An');
    }
    expect(renderEmail(change('Hà'), 'en', recipient).text).toContain('added Hà as an Owner');
  });

  it('thư báo thành viên tự rời nêu tên người rời, tên workspace và chủ đề riêng (vi/en)', () => {
    const vi = renderEmail({ ...change('Hà'), change: 'left' } as EmailInput, 'vi', recipient);
    expect(vi.text).toContain('Hà đã tự rời khỏi workspace "Shop An"');
    expect(vi.text).not.toMatch(/workspace.*trong workspace/);
    expect(vi.subject).toContain('Có thành viên rời');
    expect(vi.text).toContain('Shop An');
    const en = renderEmail({ ...change('Hà'), change: 'left' } as EmailInput, 'en', recipient);
    expect(en.text).toContain('Hà left the workspace "Shop An"');
    expect(en.text).not.toMatch(/in the workspace.*the workspace/);
    expect(en.subject).toContain('A member left');
  });

  it('tên động bị làm sạch: không chèn HTML hay xuống dòng vào chủ đề/nội dung', () => {
    const hostile = renderEmail(
      change('<img src=x onerror=alert(1)>\r\nBcc: a@b.c'),
      'en',
      recipient,
    );
    expect(hostile.html).not.toContain('<img');
    expect(hostile.subject).not.toMatch(/[\r\n]/);
    const badWorkspace = renderEmail(
      { ...invite, workspaceName: 'A\r\nBcc: evil@x.y' } as EmailInput,
      'vi',
      recipient,
    );
    expect(badWorkspace.subject).not.toMatch(/[\r\n]/);
  });

  it('URL không phải http(s) bị từ chối', () => {
    expect(() =>
      renderEmail({ ...invite, url: 'javascript:alert(1)' } as EmailInput, 'vi', recipient),
    ).toThrow();
  });
});

describe('FR-125 thương hiệu trong thư', () => {
  const inputs: EmailInput[] = [
    VERIFY,
    { kind: 'reset-password', url: 'https://a.test/r' },
    { kind: 'account-exists', loginUrl: 'https://a.test/l', resetUrl: 'https://a.test/f' },
    {
      kind: 'workspace-invite',
      url: 'https://a.test/i',
      workspaceName: 'Shop A',
      role: 'staff',
      inviterName: 'Minh',
      days: 7,
    },
    {
      kind: 'owner-change',
      url: 'https://a.test/m',
      workspaceName: 'Shop A',
      change: 'added',
      targetName: 'B',
      actorName: 'A',
    },
  ];

  it('mọi loại thư dùng tên truyền vào, không còn tên mặc định', () => {
    for (const input of inputs) {
      for (const locale of ['vi', 'en'] as const) {
        const mail = renderEmail(input, locale, recipient, { brandName: 'Tên Tạm X' });
        const all = `${mail.subject}${mail.text}${mail.html}`;
        expect(all, `${input.kind}/${locale}`).toContain('Tên Tạm X');
        expect(all).not.toContain('CommentFlow');
      }
    }
  });

  it('tên thương hiệu được escape trong HTML', () => {
    const mail = renderEmail(VERIFY, 'en', recipient, { brandName: 'A<b>&Co' });
    expect(mail.html).not.toContain('A<b>');
    expect(mail.html).toContain('A&lt;b&gt;&amp;Co');
  });

  it('createNotifier truyền brandName xuống mẫu thư', async () => {
    const transport = createMemoryTransport();
    const notifier = createNotifier({ transport, brandName: 'Tên Tạm Y' });
    await notifier.sendNow({ ...recipient, locale: 'vi' }, VERIFY);
    expect(transport.sent[0]?.subject).toContain('Tên Tạm Y');
  });
});
