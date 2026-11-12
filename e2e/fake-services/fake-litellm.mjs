// DỊCH VỤ LLM GIẢ CHỈ CHO CI/E2E — chạy NGOÀI ứng dụng (tiến trình riêng), nói đúng giao thức OpenAI/LiteLLM `POST /v1/chat/completions`.
// Ứng dụng dùng client THẬT (`createLlmClient`) và chỉ trỏ LITELLM_BASE_URL sang đây; KHÔNG có đường mock nào trong mã ứng dụng.
// Trả JSON CỐ ĐỊNH theo `metadata.step` (extract | draft) và `metadata.prompt_version`; bước lạ → HTTP 400 (lỗi to, không đoán).
// KẾT QUẢ KHÔNG PHẢI SỐ ĐO CHẤT LƯỢNG — chỉ để kiểm đường thành công của E2E (xem docs/testing/dich-vu-gia-ci.md).
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKENS = { prompt_tokens: 120, completion_tokens: 40 };

/** Nhãn cố định theo từ khóa của câu khách (đủ để E2E kiểm nhãn/hành động khác nhau). */
export function labelFor(text) {
  const t = text.toLowerCase();
  if (/(bao nhiêu|giá|price|how much)/.test(t)) return 'price';
  if (/(mua|chốt đơn|đặt hàng|order|buy)/.test(t)) return 'purchase';
  if (/(tệ|hỏng|lừa|complain|refund)/.test(t)) return 'complaint';
  return 'advice';
}

/** Chủ đề khách hỏi (asks) theo từ khóa cố định — để bước tìm kiến thức có từ khóa tìm (giống bộ nhận diện thật trả `asks`). */
export function asksFor(text) {
  const t = text.toLowerCase();
  const asks = [];
  if (/(ship|giao hàng|vận chuyển|delivery|shipping)/.test(t)) asks.push('ship');
  if (/(đổi trả|đổi hàng|trả hàng|return|refund)/.test(t)) asks.push('đổi trả');
  return asks;
}

export function extractReply(userText) {
  return {
    labels: [{ label: labelFor(userText) }],
    product_mentions: [],
    refers_to_image: false,
    size: null,
    color: null,
    height_cm: null,
    weight_kg: null,
    qty: null,
    cited_price_vnd: null,
    order_intent: null,
    asks: asksFor(userText),
  };
}

/** Câu trả lời cố định; nguồn lấy từ khối `<source id="…">` ĐẦU TIÊN trong prompt (nếu không có → xin chuyển nhân viên). */
export function draftReply(promptText) {
  // Hướng dẫn hệ thống cũng nhắc `<source id="…">` (id là dấu …) nên chỉ nhận id hợp lệ.
  const match = /<source id="([A-Za-z0-9][A-Za-z0-9:_.-]*)"/.exec(promptText);
  if (!match) {
    return {
      reply: '',
      lang: 'vi',
      sources: [],
      claims: [],
      unanswered_topics: [],
      needs_human: true,
      reason: 'E2E: không có nguồn',
      variants: [],
    };
  }
  const reply = 'Dạ shop gửi bạn thông tin theo chính sách của shop ạ.';
  return {
    reply,
    lang: 'vi',
    sources: [match[1]],
    claims: [{ text: reply, source_ids: [match[1]], kind: 'fact' }],
    unanswered_topics: [],
    needs_human: false,
    reason: '',
    variants: [],
  };
}

function textOf(message) {
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) return message.content.map((p) => p?.text ?? '').join('\n');
  return '';
}

export function createFakeLitellm() {
  return createServer((request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.method === 'GET' && request.url === '/health') return send(200, { ok: true });
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      return send(404, { error: 'not found' });
    }
    const chunks = [];
    request.on('data', (c) => chunks.push(c));
    request.on('end', () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return send(400, { error: 'invalid json' });
      }
      const step = body?.metadata?.step;
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      const all = messages.map(textOf).join('\n');
      const lastUser = textOf([...messages].reverse().find((m) => m.role === 'user') ?? {});
      let content;
      if (step === 'extract') content = extractReply(lastUser);
      else if (step === 'draft') content = draftReply(all);
      else {
        // Ghi tên bước lạ ra stderr: web chỉ thấy "LLM_UNAVAILABLE" nên nếu không có dòng này thì không biết bước nào làm lượt Thử AI hỏng.
        console.error(`[fake-litellm] bước không hỗ trợ: ${String(step)}`);
        return send(400, { error: `bước không hỗ trợ ở dịch vụ giả: ${String(step)}` });
      }
      send(200, {
        id: 'fake-completion',
        model: body.model ?? 'e2e-fake-model',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(content) } }],
        usage: TOKENS,
      });
    });
  });
}

// Chạy trực tiếp: `node fake-litellm.mjs [cổng]` (cổng 0 = tự chọn; in "listening <cổng>").
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createFakeLitellm();
  server.listen(Number(process.argv[2] ?? 0), '127.0.0.1', () => {
    console.log(`listening ${server.address().port}`);
  });
}
