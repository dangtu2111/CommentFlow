# Kế hoạch `feat/connector-iface` — giao diện connector chung + khai báo khả năng

## Việc

Mã MASTER: `CONNECTOR-IFACE` · FR-016 · Spec: `docs/12` §9 (interface), §1–§3 (giới hạn từng nền tảng), `docs/09` §3 (`packages/connectors`), AGENTS.md (`saas-core` không import connectors).

**Tóm tắt (2–3 câu tiếng Việt dễ hiểu):** Mỗi nền tảng (Facebook, Instagram, TikTok) có luật khác nhau: TikTok chỉ cho trả lời trong 48 giờ, tối đa 150 ký tự và không có nút Ẩn; tin nhắn Messenger có cửa sổ 24 giờ (tự động được) và 24 giờ–7 ngày (chỉ người). Nhánh này tạo gói `packages/connectors` với **giao diện chung** `PlatformConnector` và **bảng khai báo khả năng** của từng nền tảng, kèm hàm thuần `evaluateAction` để phần xử lý (cổng gửi, kiểm lại trước khi gửi, giao diện) **đọc khai báo thay vì viết cứng**. Chưa gọi Facebook thật (làm ở `FB-OAUTH`, `WH-INGEST`): chỉ khung, kiểu dữ liệu, khai báo, bộ test hợp đồng và connector giả cho test. Rủi ro thấp (không DB, không bí mật).

## Điểm chưa rõ

Không có. Quyết định thiết kế (theo spec; chủ dự án đã duyệt thứ tự MASTER và vòng lặp tự duyệt khi quyết định đã có trong spec/ADR):
1. **Token không đi qua tham số hàm:** `docs/12` §9 vẽ `reply(channel, …)`; ta dùng `ChannelRef` (id, workspaceId, platform, externalId — **không có bí mật**) và một `TokenProvider` được **tiêm lúc dựng connector** (`createXConnector({ tokens })`). Lý do: token nhạy cảm (nguyên tắc #6, 13 §5) không nằm trong tham số/log/stack; connector thật sẽ lấy token qua `TokenProvider` do `TOKEN-ENC` cung cấp.
2. **Con số chưa xác minh được đánh dấu `verified: false`:** giới hạn TikTok (48 giờ, 150 ký tự — "bên thứ ba ghi, cần đối chiếu", `docs/12` §3) và các ghi chú "cần kiểm" của Instagram ghi rõ trong khai báo; UI/`guard` dùng giá trị như spec nhưng có cờ để biết còn phải đối chiếu tài liệu chính thức.
3. **`packages/connectors` chỉ phụ thuộc `@flow/shared`** (Zod, lỗi có mã); không import `db`, `saas-core`, `ai`, `apps` (luật depcruise thêm mới). Kiểu `Channel`/`Conversation` của DB sẽ ánh xạ sang `ChannelRef` ở `CH-SCHEMA`.
4. **Không scraping, không API không chính thức** (nguyên tắc #1): khai báo TikTok `hide: unsupported` đến khi có API chính thức.

## Tiêu chí nghiệm thu

1. `@flow/connectors` xuất `PlatformConnector`, `ChannelRef`, `NormalizedEvent`, `NormalizedComment`, `PlatformError`/mã lỗi (`TOKEN_EXPIRED | PERMISSION | RATE_LIMIT | BLOCKED | UNKNOWN`), `ConnectorCapabilities`, `TokenProvider` đúng `docs/12` §9 — kiểm bằng: `pnpm typecheck` + test hợp đồng kiểu.
2. `evaluateAction(capabilities, ctx)` (hàm thuần) trả đúng: hành động không hỗ trợ → `ACTION_UNSUPPORTED`; quá cửa sổ → `WINDOW_EXPIRED`; trong cửa sổ chỉ-người mà không phải người → `HUMAN_REQUIRED`; vượt `maxTextLength` → `TEXT_TOO_LONG`; hành động một-lần đã dùng → `ALREADY_USED`; hợp lệ → `allowed` — kiểm bằng: bảng test `FR-016 evaluateAction` (≥ 20 ca, gồm biên đúng-bằng cửa sổ, 0 ký tự, đồng hồ giả bằng `now` truyền vào) + property test (đơn điệu theo thời gian: đã `WINDOW_EXPIRED` ở thời điểm t thì mọi t' > t cũng vậy).
3. Khai báo `FACEBOOK`, `INSTAGRAM`, `TIKTOK` đúng `docs/12` §1–§3: Facebook (trả lời, ẩn/bỏ ẩn, nhắn riêng 1 lần trong 7 ngày, Messenger 24 giờ tự động + 24 giờ–7 ngày chỉ người `HUMAN_AGENT`); Instagram (trả lời, ẩn; ghi chú dark post `verified:false`); TikTok (chỉ trả lời, 48 giờ, 150 ký tự, **không có ẩn**) — kiểm bằng: test `FR-016 khai báo từng nền tảng` so từng trường với spec.
5. **Bộ test hợp đồng dùng lại được** `assertConnectorContract(connector)`: mọi connector phải (a) khai báo `capabilities` hợp lệ theo Zod, (b) có phương thức tương ứng với mọi hành động `supported: true` và **không** có/ném `ACTION_UNSUPPORTED` cho hành động `supported: false` (thiếu `setHidden` ⇒ `hide: unsupported`), (c) `mapError` trả đúng 5 mã — kiểm bằng: chạy hợp đồng trên connector giả (`createFakeConnector`) cho cả 3 nền tảng, và test âm tính (connector khai báo ẩn nhưng thiếu `setHidden` → hợp đồng đỏ).
6. Registry: `createConnectorRegistry([...])` từ chối trùng nền tảng, `get(platform)` ném lỗi có mã `NOT_FOUND` khi chưa đăng ký, `capabilitiesOf(platform)` đọc được cả khi chưa có connector thật — kiểm bằng: test.
7. Luật ranh giới: `packages/connectors` import ngoài `@flow/shared`/Zod → `pnpm depcruise` đỏ (test luật ở `tools/boundaries`); `saas-core`/`db` import connectors đã đỏ sẵn — kiểm bằng: test luật mới + `pnpm depcruise` xanh.
8. Truy vết & chất lượng: test mang mã `FR-016`; `pnpm test:trace` xanh (FR-016 ra khỏi nợ nếu có trong baseline); coverage của gói `@flow/connectors` ≥ 95% nhánh (module logic quy tắc, STANDARD §8) và ngưỡng đặt trong `vitest.config.ts` — kiểm bằng: `pnpm --filter @flow/connectors test:coverage`.
9. Công cụ xanh: `pnpm lint && pnpm lint:i18n && pnpm typecheck && pnpm depcruise && pnpm check:plans && pnpm check:migrations && pnpm test && pnpm test:trace && pnpm test:coverage`.

## File sẽ đọc (≤ ~8, kèm lý do)

1. `docs/12_Integration_Specification.md` §1–§3, §9 — nguồn sự thật cho khai báo và interface (đã đọc khi lập plan).
2. `packages/ai/{package.json,tsconfig.json,vitest.config.ts}` — mẫu cấu hình gói (đã đọc).
3. `.dependency-cruiser.cjs` + `tools/boundaries/*` — thêm luật và test luật.
4. `packages/shared/src/errors.ts` — dùng `AppError` cho `NOT_FOUND`/`VALIDATION_FAILED` (đã đọc đoạn mã lỗi).
5. `docs/testing/STANDARD.md`, `docs/testing/trace-baseline.json` — tên test mang FR, property-based, ngưỡng.
6. `docs/gap-matrix.md`, `docs/codemap.md` — cập nhật dòng.

## File sẽ sửa / tạo

- `packages/connectors/` (mới): `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/{index,types,errors,capabilities,declarations,registry,contract}.ts`, `src/testing/fake-connector.ts` (xuất `@flow/connectors/testing`), các `*.test.ts`.
- `.dependency-cruiser.cjs` (+ test ở `tools/boundaries`): luật `connectors-chi-phu-thuoc-shared`.
- `pnpm-lock.yaml` (gói workspace mới), `docs/codemap.md`, `docs/gap-matrix.md` (`FR-016`/`CONNECTOR-IFACE` ✅), `docs/plans/MASTER.md` (dòng ✅), `docs/testing/trace-baseline.json` (nếu FR-016 có mặt).

## Migration

Không có.

## Test viết trước

(logic quy tắc: cửa sổ thời gian, giới hạn ký tự, hành động được phép — viết test đỏ trước)
- `capabilities.test.ts`: bảng `evaluateAction` + property đơn điệu theo thời gian (fast-check — **thư viện mới**, xem Complexity tracking; nếu không đồng ý thì dùng vòng lặp ngẫu nhiên có seed cố định bằng `Math`/`crypto`, không thêm thư viện).
- `declarations.test.ts`: từng trường khai báo đúng spec (kèm dẫn nguồn `docs/12 §…` trong tên ca).
- `contract.test.ts`: hợp đồng chạy trên 3 connector giả + ca âm tính.
- `registry.test.ts`.
- `tools/boundaries`: luật mới có ca đỏ/xanh.

## Lệnh test phạm vi hẹp

```
pnpm --filter @flow/connectors test
pnpm --filter @flow/connectors test:coverage
pnpm --filter @flow/boundaries test   # (tên gói thật của tools/boundaries)
pnpm lint && pnpm typecheck && pnpm depcruise && pnpm check:plans && pnpm test:trace
```

## Cần kiểm chứng độc lập không?

**Không.** Không đụng auth, token thật, webhook, RLS, thanh toán, cổng tự gửi hay migration; chỉ kiểu dữ liệu, khai báo và hàm thuần. (Cổng tự gửi/`sendRecheck` dùng `evaluateAction` ở nhánh sau sẽ có verifier riêng.)

## Rủi ro / câu hỏi cho chủ dự án

- Con số TikTok (48 giờ/150 ký tự) và hành vi dark post Instagram **chưa xác minh** (spec ghi "cần kiểm"); khai báo mang cờ `verified: false` và sẽ được đối chiếu khi có quyền TikTok/Page thử. Không có quyết định kinh doanh nào ở nhánh này.
- Không có bước bấm tay: nhánh này chỉ có mã nền và test (Kiểm tra tay: không áp dụng).

## Đề xuất thay đổi

Không (spec `docs/12` §9 giữ nguyên; ghi chú `TokenProvider` được ghi trong codemap, không sửa spec).

## Complexity tracking

- **Thêm thư viện `fast-check` (MIT)** cho property-based test (STANDARD §4 yêu cầu cho các module logic quy tắc, trong đó cổng/guard). Phương án đơn giản hơn đã loại: vòng lặp ngẫu nhiên tự viết (không co/giảm phản ví dụ, dễ không tái lập). Nếu chủ dự án muốn tránh thêm thư viện, dùng vòng lặp có seed cố định — quyết định mặc định: **dùng fast-check** (devDependency của `@flow/connectors`, không vào bundle).
- **Tạo gói mới trước khi có ≥ 2 nơi dùng** (nguyên tắc "không trừu tượng hóa sớm"): ngoại lệ đã nêu trong AGENTS.md cho "connector nền tảng" và `docs/09` §3 (cấu trúc gói do spec quy định).

## Checklist plan

- [x] Không còn thẻ chưa-rõ chưa trả lời (hoặc mục "Điểm chưa rõ" ghi "Không có")
- [x] Mỗi tiêu chí nghiệm thu kiểm được và có cách kiểm
- [x] Logic quy tắc đã có test viết trước
- [x] Đã đánh dấu diff nhạy cảm (cần verifier hay không)
- [x] Mọi thư viện mới nêu lý do + giấy phép; mọi vi phạm nguyên tắc ghi ở Complexity tracking
- [x] Danh sách "File sẽ đọc / sửa" đủ để làm mà không quét repo
- [x] Mỗi bảng mới nêu policy ghi theo vai trò hay chỉ theo workspace — không có bảng mới

## Trạng thái duyệt

**Đã duyệt** (tự duyệt theo PROMPT_BUILD_TOAN_BO §1.2: mọi quyết định đã có trong `docs/12` và MASTER; chủ dự án đã duyệt thứ tự `CONNECTOR-IFACE → CH-SCHEMA → WH-INGEST → INBOX-LIST` ngày 04/11/2026).
