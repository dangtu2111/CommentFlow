/**
 * Từ điển viết tắt MẪU cho ô Thử AI khi chưa nạp được từ điển thật (không có DB). Là tập con của từ điển hệ thống đã
 * seed ở migration 0041 (`cf.system_abbreviations`); khi có DB, ô Thử AI dùng từ điển thật (hệ thống + workspace).
 */
export const DEMO_ABBREVIATIONS: Readonly<Record<string, string>> = {
  bn: 'bao nhiêu',
  bnh: 'bao nhiêu',
  sz: 'size',
  ib: 'inbox',
  dc: 'được',
  đc: 'được',
  ko: 'không',
  k: 'không',
  sp: 'sản phẩm',
  sdt: 'số điện thoại',
  hn: 'Hà Nội',
};
