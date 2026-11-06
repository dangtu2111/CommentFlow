import { describe, expect, it } from 'vitest';
import { deriveSuggestionUi, type SuggestionView } from './suggestion';

const suggestion: SuggestionView = {
  text: 'Dạ còn size M ạ.',
  sourceIds: ['a'],
  sourceTitles: { a: 'Bảng size' },
  needsHuman: false,
};

describe('FR-043 deriveSuggestionUi — ô gợi ý AI', () => {
  it('FR-043 không có gợi ý hoặc gợi ý rỗng → không hiện', () => {
    expect(deriveSuggestionUi(null, 'abc')).toEqual({ show: false });
    expect(deriveSuggestionUi({ ...suggestion, text: '   ' }, 'abc')).toEqual({ show: false });
  });

  it('FR-043 hộp soạn trống → có thể dùng gợi ý, chưa sửa', () => {
    expect(deriveSuggestionUi(suggestion, '')).toMatchObject({
      show: true,
      canUse: true,
      edited: false,
      needsHuman: false,
    });
  });

  it('FR-043 hộp soạn đúng bằng gợi ý → không cần dùng lại, chưa sửa', () => {
    expect(deriveSuggestionUi(suggestion, ' Dạ còn size M ạ.\r\n')).toMatchObject({
      show: true,
      canUse: false,
      edited: false,
    });
  });

  it('FR-043 hộp soạn khác gợi ý (không rỗng) → đã sửa, vẫn cho khôi phục gợi ý', () => {
    expect(deriveSuggestionUi(suggestion, 'Dạ hết size M rồi ạ.')).toMatchObject({
      show: true,
      canUse: true,
      edited: true,
    });
  });

  it('FR-043 chip nguồn đi theo gợi ý; needsHuman được giữ', () => {
    const ui = deriveSuggestionUi({ ...suggestion, needsHuman: true }, '');
    expect(ui).toMatchObject({ show: true, needsHuman: true });
    if (ui.show) expect(ui.sources.chips).toEqual([{ id: 'a', label: 'Bảng size' }]);
  });
});
