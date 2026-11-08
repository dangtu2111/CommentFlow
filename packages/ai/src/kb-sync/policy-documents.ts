import type { ChunkDocument, KbTopic } from '@flow/shared';
import { detectChunkLang } from './lang';
import { classifyTopic, type PolicyKind } from './topic';

export type PolicyInput = {
  id: string;
  kind: PolicyKind;
  lang: 'vi' | 'en' | 'all';
  title: string;
  content: string;
};

export type PolicyDocument = { doc: ChunkDocument; topic: KbTopic; policyKind: PolicyKind };

export type Section = { heading: string | null; body: string };

const HEADING = /^#{1,3}\s+(.+?)\s*$/;

/** Cắt nội dung chính sách theo dòng tiêu đề `#`/`##`/`###`; phần trước tiêu đề đầu là mục không tên; bỏ mục rỗng. */
export function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let heading: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    const body = lines.join('\n').trim();
    if (body !== '') sections.push({ heading, body });
    lines = [];
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const match = HEADING.exec(line);
    if (match) {
      flush();
      heading = match[1] ?? null;
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

/** Chính sách → tài liệu cần cắt đoạn: mỗi mục một tài liệu (`policy:<id>:<thứ tự>`), mục = "tiêu đề › tên mục". */
export function buildPolicyDocuments(
  policies: readonly PolicyInput[],
  sourceTitle: string,
): PolicyDocument[] {
  return policies.flatMap((policy) =>
    splitSections(policy.content).map((section, index): PolicyDocument => {
      const sectionName = section.heading ? `${policy.title} › ${section.heading}` : policy.title;
      return {
        topic: classifyTopic(`${section.heading ?? ''} ${section.body}`, policy.kind),
        policyKind: policy.kind,
        doc: {
          key: `policy:${policy.id}:${index}`,
          kind: 'policy',
          sourceTitle,
          section: sectionName,
          lang: detectChunkLang(`${section.heading ?? ''} ${section.body}`, policy.lang),
          text: section.body,
        },
      };
    }),
  );
}
