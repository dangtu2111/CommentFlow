import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { evaluateAttachmentRules, MAX_SHORT_TEXT_WORDS } from './handoff-rules';

const run = (text: string, types: string[], model = false) =>
  evaluateAttachmentRules({ text, attachmentTypes: types, modelRefersToImage: model });

describe('FR-143 quy tắc ảnh/video kèm chữ', () => {
  it('ảnh + chữ chỉ định → phụ thuộc ảnh (nguồn text)', () => {
    expect(run('Mẫu này còn size M không shop nhỉ', ['photo'])).toMatchObject({
      imageDependent: true,
      source: 'text',
      hasVisual: true,
    });
    expect(run('giống trong ảnh này, có màu khác không ạ?', ['video']).imageDependent).toBe(true);
    expect(run('Do you have this one in blue please', ['photo']).imageDependent).toBe(true);
  });

  it('ảnh + chữ rất ngắn → phụ thuộc ảnh; đúng ngưỡng và +1', () => {
    expect(MAX_SHORT_TEXT_WORDS).toBe(4);
    expect(run('giá bao nhiêu vậy', ['photo']).imageDependent).toBe(true);
    expect(run('cho mình hỏi giá bao nhiêu vậy', ['photo']).imageDependent).toBe(false);
  });

  it('chữ dài, không chỉ vào ảnh → không phụ thuộc', () => {
    expect(
      run('Shop ơi áo thun basic form rộng giá bao nhiêu và có ship Cà Mau không', ['photo']),
    ).toMatchObject({ imageDependent: false, source: 'none' });
  });

  it('sticker/gif không phải bằng chứng sản phẩm', () => {
    expect(run('mẫu này đẹp quá', ['sticker'])).toMatchObject({
      imageDependent: false,
      hasVisual: false,
      hasSticker: true,
    });
    expect(run('giá?', ['gif']).imageDependent).toBe(false);
  });

  it('loại lạ coi như ảnh (thiên về chặn)', () => {
    expect(run('giá?', ['hologram']).hasVisual).toBe(true);
  });

  it('không tệp: chữ chỉ định một mình KHÔNG đủ (chỉ vào bài); cờ model vẫn giữ', () => {
    expect(run('mẫu này giá sao', []).imageDependent).toBe(false);
    expect(run('giá?', [], true)).toMatchObject({ imageDependent: true, source: 'model' });
  });

  it('cờ model là nguồn dù có tệp', () => {
    expect(run('xin chào shop nhé các bạn ơi hôm nay thế nào', ['photo'], true).source).toBe(
      'model',
    );
  });

  it('đầu vào hỏng → coi như phụ thuộc ảnh (không ném)', () => {
    expect(evaluateAttachmentRules(null)).toMatchObject({
      imageDependent: true,
      source: 'unreadable',
    });
    expect(run('Shop ơi cho em hỏi cái em gửi giá bao nhiêu vậy ạ', ['photo']).imageDependent).toBe(
      true,
    );
    expect(evaluateAttachmentRules({ text: 1 }).imageDependent).toBe(true);
  });

  it('property: cờ model true → luôn phụ thuộc', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.constantFrom('photo', 'video', 'sticker', 'gif'), { maxLength: 10 }),
        (text, types) => {
          expect(run(text, types, true).imageDependent).toBe(true);
        },
      ),
    );
  });

  it('property: không ảnh/video → kết quả chỉ theo cờ model', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.constantFrom('sticker', 'gif'), { maxLength: 10 }),
        fc.boolean(),
        (text, types, model) => {
          expect(run(text, types, model).imageDependent).toBe(model);
        },
      ),
    );
  });

  it('property: thứ tự tệp không đổi kết quả; thêm sticker không đổi kết quả', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.constantFrom('photo', 'video', 'sticker'), { maxLength: 6 }),
        (text, types) => {
          const a = run(text, types);
          expect(run(text, [...types].reverse())).toEqual(a);
          expect(run(text, [...types, 'sticker']).imageDependent).toBe(a.imageDependent);
        },
      ),
    );
  });
});
