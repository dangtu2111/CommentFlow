// Kiểm các dịch vụ cf-dev từ máy code qua LAN. Chỉ dùng giao thức, KHÔNG cần mật khẩu:
// Postgres → bắt tay SSLRequest; Valkey → PING (chấp nhận NOAUTH = đang đòi mật khẩu đúng cách).
// Nếu process.env.REDIS_URL có mật khẩu thì kiểm thêm AUTH + PING.
import net from 'node:net';

const TIMEOUT_MS = 5000;

/** Postgres trả 1 byte 'S' (hỗ trợ TLS) hoặc 'N' (không) cho gói SSLRequest. */
export function interpretPostgresReply(byte) {
  return byte === 0x53 || byte === 0x4e;
}

/** @returns {{ ok: boolean, detail: string }} */
export function interpretValkeyReply(text) {
  if (text.startsWith('+PONG')) return { ok: true, detail: 'PONG (đã xác thực)' };
  if (text.startsWith('-NOAUTH')) return { ok: true, detail: 'đòi mật khẩu (đúng)' };
  return { ok: false, detail: `phản hồi lạ: ${text.slice(0, 40).trim()}` };
}

/** Lấy mật khẩu từ redis://:mật-khẩu@host:port/0 (không bao giờ in ra). */
export function passwordFromRedisUrl(url) {
  try {
    return decodeURIComponent(new URL(url).password) || undefined;
  } catch {
    return undefined;
  }
}

function tcpExchange(host, port, payloads, readCount) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const chunks = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('hết thời gian chờ'));
    }, TIMEOUT_MS);
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on('data', (data) => {
      chunks.push(data);
      if (chunks.length < readCount && payloads.length > chunks.length) {
        socket.write(payloads[chunks.length]);
        return;
      }
      if (chunks.length >= readCount) {
        clearTimeout(timer);
        socket.end();
        resolve(chunks);
      }
    });
    socket.once('connect', () => socket.write(payloads[0]));
  });
}

export async function checkPostgres(host, port) {
  const sslRequest = Buffer.from([0, 0, 0, 8, 0x04, 0xd2, 0x16, 0x2f]);
  const [reply] = await tcpExchange(host, port, [sslRequest], 1);
  const ok = interpretPostgresReply(reply?.[0]);
  return { ok, detail: ok ? 'Postgres trả lời bắt tay' : 'không phải Postgres' };
}

export async function checkValkey(host, port, password) {
  if (password) {
    const chunks = await tcpExchange(host, port, [`AUTH ${password}\r\n`, 'PING\r\n'], 2);
    return interpretValkeyReply(String(chunks[1]));
  }
  const [reply] = await tcpExchange(host, port, ['PING\r\n'], 1);
  return interpretValkeyReply(String(reply));
}

export async function checkHttp(url, { expectStatus = 200, expectBody } = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'manual',
  });
  const body = await response.text();
  if (response.status !== expectStatus) {
    return { ok: false, detail: `HTTP ${response.status} (cần ${expectStatus})` };
  }
  if (expectBody && !body.includes(expectBody)) {
    return { ok: false, detail: `thiếu "${expectBody}" trong nội dung` };
  }
  return { ok: true, detail: `HTTP ${response.status}` };
}
