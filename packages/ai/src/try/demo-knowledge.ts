import { unsafeMarkMasked } from '@flow/shared';
import type { KbGapTopic, VariantAxis } from '../decide/decide-action';
import type { TryCandidate, TryKnowledge } from './try-pipeline';

/**
 * Kiến thức MẪU trong bộ nhớ cho ô Thử AI khi chưa nối KB thật (Xong-mock, Q-ATB1). Không phải dữ liệu khách.
 * Chấm điểm tìm kiếm: số từ khóa trùng (không dấu) → `1 − 0,5^n` (xác định, không vector/LLM).
 */
type DemoProduct = {
  id: string;
  name: string;
  priceVnd: number;
  sizes: string[];
  colors: string[];
};

const PRODUCTS: readonly DemoProduct[] = [
  {
    id: 'demo-p1',
    name: 'Áo thun basic',
    priceVnd: 150_000,
    sizes: ['S', 'M', 'L'],
    colors: ['đen', 'trắng'],
  },
  { id: 'demo-p2', name: 'Váy hoa nhí', priceVnd: 320_000, sizes: ['M'], colors: ['xanh'] },
];

type DemoChunk = {
  id: string;
  title: string;
  text: string;
  topics: KbGapTopic[];
  keywords: string[];
};

const CHUNKS: readonly DemoChunk[] = [
  {
    id: 'demo-kb-ship',
    title: 'Phí vận chuyển',
    text: 'Phí ship nội thành 20.000đ, toàn quốc 30.000đ. Giao hàng trong 2–4 ngày.',
    topics: ['shipping'],
    keywords: ['ship', 'giao', 'van', 'chuyen', 'phi', 've', 'noi', 'thanh'],
  },
  {
    id: 'demo-kb-return',
    title: 'Chính sách đổi trả',
    text: 'Đổi trả trong 7 ngày nếu sản phẩm còn tem mác và chưa giặt.',
    topics: ['policy'],
    keywords: ['doi', 'tra', 'hoan', 'bao', 'hanh', 'tem', 'mac'],
  },
];

const fold = (text: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
const tokens = (text: string) =>
  new Set(
    fold(text)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2),
  );

const formatVnd = (value: number) => `${value.toLocaleString('vi-VN')}đ`;

function productCandidate(product: DemoProduct): TryCandidate {
  return {
    id: product.id,
    kind: 'product',
    title: product.name,
    text: unsafeMarkMasked(
      `${product.name}: giá ${formatVnd(product.priceVnd)}; size ${product.sizes.join(', ')}; màu ${product.colors.join(', ')}; còn hàng.`,
    ),
    score: 1,
    topics: ['product_info', 'size'],
  };
}

export function createDemoKnowledge(): TryKnowledge {
  return {
    async matchProducts(mentions) {
      const wanted = mentions.map(fold);
      const hits = PRODUCTS.filter((product) =>
        wanted.some((mention) => mention !== '' && fold(product.name).includes(mention)),
      );
      const axes = (product: DemoProduct): VariantAxis[] => [
        ...(product.sizes.length > 1 ? (['size'] as const) : []),
        ...(product.colors.length > 1 ? (['color'] as const) : []),
      ];
      return {
        ids: hits.map((p) => p.id),
        names: hits.map((p) => p.name),
        missingAxes: hits.length === 1 ? axes(hits[0] as DemoProduct) : [],
      };
    },
    async lookupProductFacts(ids) {
      return PRODUCTS.filter((product) => ids.includes(product.id)).map(productCandidate);
    },
    async searchKb(query) {
      const wanted = tokens(query);
      return CHUNKS.flatMap((chunk) => {
        const matches = chunk.keywords.filter((keyword) => wanted.has(keyword)).length;
        if (matches === 0) return [];
        return [
          {
            id: chunk.id,
            kind: 'kb' as const,
            title: chunk.title,
            text: unsafeMarkMasked(chunk.text),
            score: 1 - 0.5 ** matches,
            topics: chunk.topics,
          },
        ];
      });
    },
  };
}
