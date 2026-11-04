/**
 * Luật ranh giới giữa các gói (docs/09_System_Architecture.md §3.1, AGENTS.md bất biến #8).
 * Phụ thuộc chỉ một chiều: apps/* → packages/<sản phẩm> → saas-core → db → shared.
 * Chạy: `pnpm depcruise`. Test của chính các luật: tools/boundaries.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Không cho phép vòng phụ thuộc.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'saas-core-khong-biet-san-pham',
      comment:
        'saas-core dùng chung với ExcelFlow: không import ai, connectors, apps hay schema cf của db.',
      severity: 'error',
      from: { path: '^packages/saas-core/' },
      to: { path: '^(packages/(ai|connectors)/|apps/|packages/db/src/schema/cf)' },
    },
    {
      name: 'packages-khong-import-apps',
      comment: 'Gói dùng chung không được phụ thuộc ngược vào ứng dụng.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'shared-la-goi-la',
      comment: 'packages/shared là gói lá: không import gói nội bộ nào khác.',
      severity: 'error',
      from: { path: '^packages/shared/' },
      to: { path: '^(packages/(?!shared/)|apps/)' },
    },
    {
      name: 'db-khong-import-tang-tren',
      comment:
        'packages/db chỉ được phụ thuộc shared; không import saas-core, ai, connectors, apps.',
      severity: 'error',
      from: { path: '^packages/db/' },
      to: { path: '^(packages/(saas-core|ai|connectors)/|apps/)' },
    },
    {
      name: 'connectors-chi-phu-thuoc-shared',
      comment:
        'packages/connectors (giao diện + khai báo khả năng nền tảng) chỉ được phụ thuộc shared; không import db, saas-core, ai, apps (token đi qua TokenProvider được tiêm).',
      severity: 'error',
      from: { path: '^packages/connectors/' },
      to: { path: '^(packages/(?!shared/|connectors/)|apps/)' },
    },
    {
      name: 'chi-auth-import-auth-db',
      comment:
        'Pool role cf_auth (packages/db/src/auth-db) mở TOÀN BỘ bảng xác thực (băm mật khẩu, token phiên thô): chỉ packages/saas-core/src/auth/, chính packages/db và test được import. Nơi khác dùng qua API của saas-core.',
      severity: 'error',
      from: {
        pathNot: '^packages/(saas-core/(src/auth/|tests/)|db/)|\\.test\\.(ts|tsx|mjs)$',
      },
      to: { path: '^packages/db/src/auth-db' },
    },
    {
      name: 'apps-khong-import-nhau',
      comment: 'Các ứng dụng độc lập: web không import worker và ngược lại.',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(.next|dist|coverage)/' },
    moduleSystems: ['es6', 'cjs'],
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
