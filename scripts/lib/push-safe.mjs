// `pnpm push:safe`: CÁCH DUY NHẤT để push (AGENTS.md). Chạy `pnpm precheck`, CHỈ `git push` khi mã thoát = 0.
// Không hook, không ống lọc output giữa lệnh kiểm và lệnh push (lỗi đã lặp 3 lần: precheck đỏ mà vẫn push).
const FORBIDDEN = /^(--force(-with-lease|-if-includes)?|-f|--mirror|--delete|-d|\+.*)$/;

/** Dựng tham số `git push`; cấm force/xóa nhánh/mirror (AGENTS.md: không force-push). */
export function buildPushArgs(argv, { hasUpstream }) {
  const bad = argv.find((arg) => FORBIDDEN.test(arg));
  if (bad !== undefined) {
    return {
      ok: false,
      error: `Tham số "${bad}" bị cấm: không force-push, không xóa nhánh/mirror (cập nhật nhánh bằng merge).`,
    };
  }
  if (argv.length > 0) return { ok: true, args: argv };
  return { ok: true, args: hasUpstream ? [] : ['-u', 'origin', 'HEAD'] };
}

/** Điều phối thuần: `precheck()` và `push(args)` trả mã thoát (null/undefined = lỗi). */
export function runPushSafe({ argv, hasUpstream, precheck, push, log }) {
  const built = buildPushArgs(argv, { hasUpstream });
  if (!built.ok) {
    log(`✖ ${built.error}`);
    return { exitCode: 2 };
  }
  const checked = precheck();
  if (checked !== 0) {
    log(
      `\n✖ precheck ĐỎ (mã thoát ${checked ?? 'không rõ'}) — KHÔNG push. Sửa lỗi ở bước dừng phía trên rồi chạy lại: pnpm push:safe`,
    );
    return { exitCode: 1 };
  }
  const pushed = push(built.args);
  if (pushed !== 0) {
    log(`\n✖ git push lỗi (mã thoát ${pushed ?? 'không rõ'}) — đọc thông báo của git phía trên.`);
    return { exitCode: 1 };
  }
  log('\n✔ precheck xanh và đã push.');
  return { exitCode: 0 };
}
