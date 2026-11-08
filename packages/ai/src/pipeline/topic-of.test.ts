import { describe, expect, it } from 'vitest';
import { topicOf } from './run-pipeline';

/**
 * Q-EV2-3: câu hỏi THỜI GIAN giao/xử lý ("bao lâu nhận được hàng", "how long until I get my order") là câu hỏi CHÍNH SÁCH GIAO HÀNG,
 * KHÔNG phải tra cứu trạng thái đơn ("đơn của tôi đến đâu rồi", "where is my order" → order_status).
 */
describe('topicOf — thời gian giao/xử lý là chủ đề giao hàng', () => {
  it.each([
    'how long until I get my order?',
    'how long does it take to receive my order',
    'how many days until my order arrives',
    'when will I receive my order',
    'when will my order be delivered',
    'bao lâu thì nhận được hàng',
    'đặt xong mấy ngày thì nhận được đơn',
    'khi nào mình nhận được hàng vậy shop',
    'bao giờ giao hàng',
    'how long is the processing time before shipping',
    'delivery time to Hanoi',
    'thời gian nhận hàng',
    'thời gian xử lý đơn',
  ])('%s → shipping', (text) => {
    expect(topicOf(text)).toBe('shipping');
  });

  it.each([
    'where is my order?',
    'đơn của mình đến đâu rồi',
    'can you track my order',
    'order status please',
    'cho mình hỏi đơn hàng của mình',
  ])('%s → order_status (tra cứu trạng thái, không phải thời gian giao)', (text) => {
    expect(topicOf(text)).toBe('order_status');
  });

  it.each([
    ['bảo hành bao lâu vậy shop', 'policy'],
    ['how long is the return window', 'policy'],
    ['hoàn tiền mất bao lâu', 'policy'],
    ['thời gian bảo hành', 'policy'],
    ['how long does the refund take', 'policy'],
  ] as const)('%s → %s (không bị cướp bởi chủ đề giao hàng)', (text, topic) => {
    expect(topicOf(text)).toBe(topic);
  });

  it('các chủ đề cũ không đổi', () => {
    expect(topicOf('phí ship về Hà Nội')).toBe('shipping');
    expect(topicOf('có voucher không')).toBe('discount');
    expect(topicOf('chính sách đổi trả thế nào')).toBe('policy');
  });
});
