import type { ReactNode } from 'react';

/** Đầu một thẻ Cài đặt: ô biểu tượng + tiêu đề + mô tả, khe bên phải cho nút/chip (theo thiết kế Stitch). */
export function SectionHead({
  id,
  icon,
  title,
  description,
  end,
}: {
  id: string;
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  end?: ReactNode;
}) {
  return (
    <header className="section-head">
      <span className="section-head-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="section-head-text">
        <h2 id={id} className="section-title">
          {title}
        </h2>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {end ? <div className="section-head-end">{end}</div> : null}
    </header>
  );
}
