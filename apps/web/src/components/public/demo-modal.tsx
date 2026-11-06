'use client';

import { useState } from 'react';
import { Icon } from '../ui/icon';

/** Nút "Xem demo" + hộp thoại thử nghiệm (design/stitch/landing-pricing.html). Kết quả là [MẪU]; chưa gọi AI thật. */
export function DemoModal() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-space-xs px-space-xl py-3 rounded-lg bg-surface-container-highest text-on-surface font-title-sm text-title-sm hover:bg-surface-container transition-colors shadow-sm"
      >
        <Icon name="play_circle" size={20} className="text-secondary" />
        <span>Xem demo thực tế</span>
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Thử nghiệm phản hồi AI"
        >
          <div className="bg-surface-container-lowest rounded-xl shadow-2xl max-w-2xl w-full p-space-lg relative">
            <button
              type="button"
              aria-label="Đóng"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface"
            >
              <Icon name="close" size={24} />
            </button>
            <div className="flex items-center gap-2 mb-space-sm text-secondary">
              <Icon name="smart_toy" size={24} />
              <h3 className="font-title-md text-title-md text-on-surface font-bold">
                Thử nghiệm phản hồi AI trực tiếp
              </h3>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
              Nhập bình luận thử nghiệm từ góc độ khách hàng để xem AI phân loại và soạn câu. [MẪU]
              Chức năng chạy thử chưa bật.
            </p>
            <div className="space-y-space-md">
              <div>
                <span className="font-label-sm text-label-sm text-on-surface font-bold block mb-1">
                  Bình luận của khách hàng:
                </span>
                <div className="flex gap-2">
                  <input
                    className="w-full px-3 py-2 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary"
                    type="text"
                    aria-label="Bình luận của khách hàng"
                    readOnly
                    value="Báo giá cho mình đôi giày sneaker trắng sz 39 nhé, ship qua Cầu Giấy"
                  />
                  <button
                    type="button"
                    aria-disabled="true"
                    title="Sắp có"
                    tabIndex={-1}
                    className="px-4 py-2 bg-primary text-on-primary rounded-lg font-title-sm text-title-sm shrink-0 flex items-center gap-1 cursor-not-allowed opacity-70"
                  >
                    <Icon name="play_arrow" size={16} /> Chạy test
                  </button>
                </div>
              </div>
              <div className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-2">
                <div className="flex items-center justify-between text-on-surface-variant font-code-sm text-code-sm">
                  <span className="flex items-center gap-1 text-primary font-bold">
                    <Icon name="security" size={16} /> Phát hiện SĐT: gắn cờ cho nhân viên xem
                  </span>
                  <span className="text-on-surface font-bold">Thời gian: [MẪU] —</span>
                </div>
                <div className="p-2 rounded bg-surface-container-lowest font-body-sm text-body-sm text-on-surface">
                  <strong>AI Soạn Trả Lời:</strong> &quot;[MẪU] Chào bạn, mẫu Sneaker Trắng size 39
                  hiện đang có sẵn ạ! Mình đã inbox thông tin chi tiết cho bạn nhé!&quot;
                </div>
                <div className="flex items-center gap-2 font-label-sm text-label-sm text-secondary font-medium">
                  <Icon name="auto_awesome" size={14} />
                  <span>Độ tin cậy: [MẪU] — • Nguồn tham chiếu: [MẪU] Bảng giá</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
