# Prompt: xây CommentFlow từ đầu đến cuối, kiểm tra theo từng chức năng

> Dán nguyên khối dưới vào Claude Code trên máy code **sau khi `feat/workspace-members` đã merge**. Phiên sau chỉ cần nhắn: *"Tiếp tục theo docs/PROMPT_BUILD_TOAN_BO.md, đọc docs/plans/MASTER.md và handoff."*

> **Cập nhật 05/11/2026 — quy tắc hỏi thay thế mục 2 ở chỗ mâu thuẫn:** xem `AGENTS.md` § Quy tắc hỏi. Mặc định tự chọn phương án khuyến nghị và ghi `docs/plans/QUYET_DINH_CHO_DUYET.md`; chỉ DỪNG hỏi khi (a) cần việc/tài nguyên chỉ chủ dự án làm được, (b) tốn tiền/không đảo ngược, (c) đổi phạm vi/trải nghiệm lớn, (d) không có phương án đủ an toàn. Được sửa `docs/01–16` cho khớp (ghi vào cùng file). Vẫn giữ: kiểm tra tay cuối mỗi tính năng và xác nhận ở cổng giai đoạn. Chỉ `git add` đúng file của việc; không `git add -A`. Báo cáo ≤ 10 dòng/ngày + mục "Việc chỉ bạn làm được".

```
# Nhiệm vụ: xây CommentFlow từ GĐ0 đến GĐ5 theo docs/16, từng tính năng một; chủ dự án kiểm tra tay sau mỗi tính năng

Vai trò và nguyên tắc: theo AGENTS.md (Senior Architect & Full-stack, Clean Code, đọc source tiết kiệm, không làm trùng việc, hai máy). Làm tự chủ, nhưng DỪNG đúng các điểm ở mục 2.

## 0. Chuẩn bị một lần — nhánh chore/build-system
1. Chỉ đọc: AGENTS.md, docs/16 §1–3.4, docs/14, docs/gap-matrix.md, docs/decisions/*, docs/codemap.md.
2. Tạo docs/plans/MASTER.md: toàn bộ tính năng còn lại theo thứ tự GĐ (từ gap matrix + 16 §3.2), mỗi dòng gồm: mã, FR, US/UF, phụ thuộc, nhạy cảm (có/không), cần tài nguyên bên ngoài (có/không), trạng thái. Mỗi tính năng ≤ 1–2 ngày công; tính năng lớn tách nhỏ.
3. Viết docs/testing/STANDARD.md — chuẩn test thống nhất cho mọi tính năng:
   - Tầng test: unit (Vitest, pytest) → integration trên DB thật cf_test → contract (fixture webhook/API đã ghi) → E2E Playwright theo UF (07) → AI eval promptfoo (14 §4).
   - Truy vết: describe('FR-xxx …') / test('US-xxx …'); mỗi FR đánh dấu Xong phải có ≥ 1 test mang mã FR.
   - TDD bắt buộc (test đỏ trước) cho logic quy tắc: cổng tự gửi, sendRecheck, decideAction, độ tin cậy, guard, hạn mức, cửa sổ 24 giờ, che PII, nhận ngôn ngữ, rate limit, feature flag.
   - Property-based (fast-check / hypothesis) cho: che PII, chuẩn hóa văn bản, guard số tiền, thứ tự cổng, băm rollout, tách thông tin (extract).
   - Mỗi bảng mới có workspace_id: test RLS truy cập chéo + check-rls. Mỗi action/route mới: test 404 chéo workspace + test quét requireAppUser.
   - Mỗi chuỗi giao diện: lint:i18n + test khớp khóa vi/en; E2E chạy cả vi và en cho luồng chính.
   - Cô lập: mỗi test tự dựng/dọn dữ liệu, không phụ thuộc thứ tự, không sleep cứng (poll có hạn), giờ giả lập bằng fake timers.
   - Flaky là lỗi: sửa gốc, không retry để che. Test bị skip phải có lý do + issue.
   - Ngưỡng: packages/ai, packages/shared, saas-core ≥ 85% dòng và nhánh; module logic quy tắc ≥ 95% nhánh; mutation testing (Stryker) cho cổng tự gửi, sendRecheck, guard, decideAction ≥ 80% mutant bị diệt — chạy trước khi merge nhánh chạm các module này.
   - Không dữ liệu khách giả làm số liệu; fixture tối thiểu, ghi rõ là fixture; bình luận thật chỉ dùng bản đã che PII.
4. Script pnpm test:trace (đưa vào CI): đối chiếu FR trạng thái Xong trong gap matrix với mã FR trong test; thiếu → đỏ. Thêm ngưỡng coverage vào CI.
5. Skill: tìm và đánh giá skill/quy trình tốt cho Claude Code (ví dụ obra/superpowers: TDD, systematic debugging, verification-before-completion; các skill chính thức của Anthropic; Spec Kit đã mượn ý). Đọc hết nội dung trước khi dùng. Chỉ chép văn bản vào .claude/skills/<tên>/SKILL.md, chỉnh cho khớp AGENTS.md; ghi nguồn + giấy phép vào docs/decisions/006-skills.md. Không cài plugin, không hook, không script tự chạy. Tối đa 5 skill, chỉ cái thực sự dùng trong vòng lặp ở mục 1.
6. Đề xuất danh sách allow trong .claude/settings.json cho lệnh thường dùng (pnpm, git add/commit, git push origin feat/* fix/* chore/* docs/*, gh pr create/merge/checks, ssh cf "cd ~/CommentFlow && git pull", docker compose -p cf-dev …) để bớt hỏi quyền. KHÔNG đổi khối deny. Tôi duyệt trước khi áp.
7. PR → CI xanh → merge giữ lịch sử. Báo tôi ≤ 15 dòng: MASTER.md, STANDARD.md, skill đã chọn, allow-list đề xuất → DỪNG chờ duyệt.

## 1. Vòng lặp cho mỗi tính năng trong MASTER.md
1. git pull; ssh cf "cd ~/CommentFlow && git pull"; nhánh feat/<mã> (hoặc fix/…).
2. Plan theo docs/plans/TEMPLATE.md, qua check:plans. Nếu mọi quyết định đã có trong spec/ADR → tự đánh dấu Đã duyệt và làm tiếp. Nếu có [CẦN LÀM RÕ] ảnh hưởng nghiệp vụ, bảo mật, chi phí, dữ liệu người dùng hoặc giao diện → gom câu hỏi, mỗi câu kèm khuyến nghị, DỪNG hỏi tôi.
3. Test trước theo STANDARD.md, rồi code; commit nhỏ theo mốc.
4. /finish: lint, typecheck, depcruise, check-rls, lint:i18n, check:plans, test:trace, unit, integration, coverage; diff nhạy cảm → verifier-security / verifier-db một lần, sửa hết "Chặn merge"; sửa sau verifier chạm lại phần nhạy cảm → gộp vào kiểm chứng của nhánh kế tiếp và ghi gap matrix.
5. Gửi tôi mục "Kiểm tra tay": ≤ 10 bước bấm thử (URL, tài khoản thử, Mailpit http://192.168.1.124:8025), cả tiếng Việt và tiếng Anh, kết quả mong đợi từng bước. DỪNG chờ tôi báo đạt.
6. Tôi báo đạt → PR, CI xanh, merge giữ lịch sử, xóa nhánh/plan/handoff, sync máy ảo, cập nhật MASTER.md + gap matrix + codemap. Báo nội dung đã đổi trong docs/01–16 hoặc docs/decisions (nếu có) để tôi cập nhật bản trên Project.
7. Việc cơ học kiểm được bằng công cụ (dịch chuỗi sang en, đổi tên hàng loạt, cập nhật bản đồ) → tạo GitHub issue nhãn mech cho máy phụ thay vì tự làm.
8. Gần hết lượt hoặc hết phiên: ghi docs/handoff/<nhánh>.md; phiên sau đọc handoff + MASTER.md, không đọc lại source đã ghi.

## 2. Điểm DỪNG bắt buộc — không tự vượt
- Cuối mỗi tính năng: chờ tôi kiểm tra tay.
- Cổng giai đoạn (docs/16 §3, docs/14 §8): chạy đủ kiểm tra của cổng, báo kết quả, chờ tôi xác nhận qua cổng.
- Cần tài nguyên bên ngoài hoặc quyết định kinh doanh: tên sản phẩm/tên miền (Q6), Meta App (OAuth, webhook, Page thử), Business Verification, App Review, TikTok, Shopify dev store, Google Cloud, khóa nhà cung cấp LLM trả phí, bộ ~300 bình luận thật, chọn nhà cung cấp email/VPS, bảng giá, pháp lý.
- Việc tốn tiền, gửi dữ liệu ra ngoài ngoài các dịch vụ đã duyệt, hoặc không đảo ngược được.
- Lệch spec docs/01–16: đề xuất bằng lời; chỉ sửa khi tôi cho phép, rồi báo đúng nội dung đã đổi.

## 3. Không bao giờ — kể cả khi tôi đã cho phép mọi quyền
- Force-push hoặc sửa lịch sử main; merge khi CI đỏ; tắt test/lint/ngưỡng để qua CI.
- Đọc .env*, in bí mật, chép bí mật giữa hai máy, commit bí mật; nới khối deny trong .claude/settings.json.
- Migration hoặc lệnh ghi lên staging/production từ máy dev; đụng cf-staging ngoài việc được giao.
- Gọi model trả phí vượt trần ngân sách đã đặt; dùng dữ liệu khách thật chưa che PII trong test hoặc phiên Codex.
- Scraping hoặc API không chính thức; cho AI tự ẩn bình luận; bịa số liệu/huy hiệu trên giao diện.

## 4. Báo cáo
- Mỗi tính năng: ≤ 8 dòng + mục "Kiểm tra tay".
- Mỗi tuần (hoặc khi tôi hỏi): số tính năng xong/còn lại theo GĐ, số lần chạy verifier, việc đang chờ tôi, chi phí AI ước tính.

Bắt đầu bằng mục 0.
```
