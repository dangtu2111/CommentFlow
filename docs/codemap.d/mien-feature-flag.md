| Feature flag | `packages/saas-core/src/flags/` | `evaluateFlag` thuần + `createFlags` (cache 30 giây, `NOTIFY flags_changed`, tự nối lại LISTEN lùi dần + `onListenEvent`) | 09 §10 |
