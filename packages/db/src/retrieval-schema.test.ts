import { KB_GAP_STATUSES, KB_GAP_TOPICS, RETRIEVAL_ROUTES } from '@flow/shared';
import { describe, expect, it } from 'vitest';
import {
  KB_GAP_STATUS_VALUES,
  KB_GAP_TOPIC_VALUES,
  RETRIEVAL_ROUTE_VALUES,
} from './schema/cf/retrieval';

describe('FR-134 hằng của CHECK trong DB khớp hằng của @flow/shared', () => {
  it('FR-134 chủ đề, trạng thái, nhánh truy xuất giống nhau hai nơi', () => {
    expect([...KB_GAP_TOPIC_VALUES]).toEqual([...KB_GAP_TOPICS]);
    expect([...KB_GAP_STATUS_VALUES]).toEqual([...KB_GAP_STATUSES]);
    expect([...RETRIEVAL_ROUTE_VALUES]).toEqual([...RETRIEVAL_ROUTES]);
  });
});
