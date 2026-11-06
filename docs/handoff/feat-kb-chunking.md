# Handoff feat-kb-chunking (claude, làn b)

**Đã làm:** `chunkDocument`/`chunkText`/`buildContextHeader`/hạn hiệu lực (shared), `contentHash`/`Embedder`+mock/`embedInBatches`/`planChunkIndexing`/`buildChunkRows` (ai), truy vấn ghi nháp + `validChunkFilter` (db). Không migration. Quyết định QKC1.

**Đã đọc + rút ra:** `kb_chunks` chỉ hệ thống ghi (`withJob`), UPDATE theo cột đã GRANT, unique `kb_chunks_key_unique` NULLS NOT DISTINCT; `unaccent` chưa có trong migration → tsv vi bỏ dấu ở app bằng `foldText` (KB-SEARCH-FTS phải dùng cùng cách); packages/ai chưa có interface embedding (đã thêm `Embedder`); `packages/shared` coverage ngưỡng 100% dòng.

**Chưa chạy được:** `pnpm test:db` (làn không có DB) — `kb-chunks.int.test.ts` chạy ở CI.

**Còn lại:** `KB-INDEX-JOB` (nối nguồn → chunkDocument → worker), `KB-PUBLISH` (nháp → phiên bản một giao dịch), `KB-EMBED-LITELLM`, `KB-SEARCH-FTS`, UI cảnh báo sắp hết hạn.
