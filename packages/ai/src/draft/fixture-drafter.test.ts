import { maskPii } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import type { DraftInput } from './draft-prompt';
import { needsHumanResult } from './draft-result';
import { createFixtureDrafter, FIXTURE_DRAFT_DEFAULT } from './fixture-drafter';

const input = (q: string): DraftInput => ({
  workspaceId: '11111111-1111-4111-8111-111111111111',
  question: maskPii(q),
  lang: 'vi',
  kbVersion: 'k',
  voice: { do: [], dont: [], shopPronoun: 'em', customerAddress: 'ban' },
  sources: [],
});

describe('FR-029 drafter mock theo fixture', () => {
  const hit = { ...needsHumanResult('x'), reply: 'Dạ ok', needs_human: false, reason: '' };
  it('fixture khớp đầu tiên thắng; không khớp → needs_human mặc định', async () => {
    const d = createFixtureDrafter([
      { match: /giá/i, result: hit },
      { match: /.*/, result: needsHumanResult('khác') },
    ]);
    expect(await d.draft(input('giá bao nhiêu'))).toBe(hit);
    expect(await createFixtureDrafter().draft(input('gì đó'))).toBe(FIXTURE_DRAFT_DEFAULT);
    expect(FIXTURE_DRAFT_DEFAULT.needs_human).toBe(true);
  });
});
