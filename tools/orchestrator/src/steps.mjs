// Phân tích bước dòng lệnh: task:<tên>[@mô hình] | fix:<pr>[@mô hình] | wait:<làn>
const NAME = /^[A-Za-z0-9._-]+$/;
const MODEL = /^[A-Za-z0-9._[\]-]+$/;
const LANE = /^[A-Za-z0-9_-]+$/;

function bad(raw, why) {
  return new Error(
    `Bước không hợp lệ "${raw}": ${why}. Dạng đúng: task:<tên>[@mô hình] | fix:<số-pr>[@mô hình] | wait:<làn>`,
  );
}

function splitModel(raw, text) {
  const at = text.indexOf('@');
  if (at === -1) return [text, undefined];
  const model = text.slice(at + 1);
  if (!MODEL.test(model)) throw bad(raw, `mô hình "${model}" không hợp lệ`);
  return [text.slice(0, at), model];
}

export function parseStep(raw) {
  const m = /^(task|fix|wait):(.+)$/.exec(String(raw).trim());
  if (!m) throw bad(raw, 'thiếu tiền tố task:/fix:/wait:');
  const [, kind, rest] = m;
  if (kind === 'wait') {
    if (!LANE.test(rest)) throw bad(raw, 'tên làn không hợp lệ');
    return { kind, lane: rest };
  }
  const [head, model] = splitModel(raw, rest);
  if (kind === 'task') {
    if (!NAME.test(head)) throw bad(raw, 'tên task chỉ gồm chữ, số, . _ - (không có "/")');
    return { kind, name: head, model };
  }
  const pr = /^#?(\d+)$/.exec(head);
  if (!pr) throw bad(raw, 'số PR phải là số nguyên');
  return { kind, pr: Number(pr[1]), model };
}

export function parseSteps(list) {
  if (list.length === 0) throw new Error('Cần ít nhất một bước.');
  return list.map(parseStep);
}

export function describeStep(step) {
  const model = step.model ? `@${step.model}` : '';
  if (step.kind === 'task') return `task:${step.name}${model}`;
  if (step.kind === 'fix') return `fix:${step.pr}${model}`;
  return `wait:${step.lane}`;
}
