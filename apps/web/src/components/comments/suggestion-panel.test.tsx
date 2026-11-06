import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { deriveSuggestionUi, type SuggestionView } from '../../lib/suggestion';
import { type SuggestionLabels, SuggestionPanel, SuggestionSources } from './suggestion-panel';

const LABELS: SuggestionLabels = {
  title: 'Gợi ý',
  use: 'Dùng',
  edited: 'Đã sửa',
  needsHuman: 'Xem lại',
  sources: 'Nguồn',
  sourceFallback: 'Nguồn chung',
  more: '+{count}',
};

const SUGGESTION: SuggestionView = {
  text: 'Dạ còn ạ',
  sourceIds: ['a', 'b'],
  sourceTitles: { a: 'Sản phẩm: Váy' },
  needsHuman: false,
};

function shown(composerText: string, suggestion: SuggestionView = SUGGESTION) {
  const ui = deriveSuggestionUi(suggestion, composerText);
  if (!ui.show) throw new Error('phải hiện gợi ý');
  return ui;
}

describe('SuggestionPanel (dải ghi chú dưới ô soạn)', () => {
  it('không hiện gì khi ô soạn đã đúng bằng gợi ý và không có cảnh báo', () => {
    const html = renderToStaticMarkup(
      <SuggestionPanel ui={shown('Dạ còn ạ')} labels={LABELS} onUse={() => {}} />,
    );
    expect(html).toBe('');
  });

  it('báo "đã sửa" và cho dùng lại gợi ý khi người đã sửa câu', () => {
    const html = renderToStaticMarkup(
      <SuggestionPanel ui={shown('Dạ hết rồi ạ')} labels={LABELS} onUse={() => {}} />,
    );
    expect(html).toContain('Đã sửa');
    expect(html).toContain('Dùng');
    expect(html).not.toContain('disabled');
  });

  it('cảnh báo xem lại khi AI đề nghị người duyệt', () => {
    const html = renderToStaticMarkup(
      <SuggestionPanel
        ui={shown('Dạ còn ạ', { ...SUGGESTION, needsHuman: true })}
        labels={LABELS}
        onUse={() => {}}
      />,
    );
    expect(html).toContain('Xem lại');
    expect(html).toContain('disabled');
  });
});

describe('SuggestionSources (chip nguồn kiến thức)', () => {
  it('hiện tên nguồn đã biết và nhãn chung cho nguồn chưa biết tên', () => {
    const html = renderToStaticMarkup(
      <SuggestionSources ui={shown('')} labels={LABELS} caption="Nguồn nạp vào:" />,
    );
    expect(html).toContain('Nguồn nạp vào:');
    expect(html).toContain('Sản phẩm: Váy');
    expect(html).toContain('Nguồn chung');
  });

  it('không hiện khung khi không có nguồn nào', () => {
    const html = renderToStaticMarkup(
      <SuggestionSources
        ui={shown('', { ...SUGGESTION, sourceIds: [], sourceTitles: {} })}
        labels={LABELS}
        caption="Nguồn:"
      />,
    );
    expect(html).toBe('');
  });
});
