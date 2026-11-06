import { BadgeCheck, Bell, Settings, Sparkles, Users } from 'lucide-react';
import { notFound } from 'next/navigation';
import { Avatar } from '../../../../components/ui/avatar';
import { Banner } from '../../../../components/ui/banner';
import { Button, buttonClass, IconButton } from '../../../../components/ui/button';
import { Card } from '../../../../components/ui/card';
import { Chip } from '../../../../components/ui/chip';
import { Dialog, DialogTrigger } from '../../../../components/ui/dialog';
import { TextField } from '../../../../components/ui/fields';
import { Breadcrumb, PageHeader } from '../../../../components/ui/page-header';
import { SectionHead } from '../../../../components/ui/section-head';
import { SplitLayout } from '../../../../components/ui/split-layout';
import { Stat } from '../../../../components/ui/stat';
import { Stepper } from '../../../../components/ui/stepper';
import { Tabs } from '../../../../components/ui/tabs';

/**
 * Trang xem MẪU bộ thành phần dùng chung — CHỈ khi `NODE_ENV !== 'production'`. Không đọc DB/phiên; mọi chữ là
 * nội dung mẫu gắn "[MẪU]", không bao giờ là số liệu thật. Mỗi mục = một thành phần của `components/ui`.
 */
export default function DevUiKitPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main className="app-page app-page-wide">
      <Breadcrumb label="Đường dẫn" root="[MẪU] Kit" current="Thành phần dùng chung" />
      <PageHeader
        title="[MẪU] Bộ thành phần dùng chung"
        subtitle="Mỗi mục là một thành phần trong components/ui — trang thật chỉ ghép chúng."
      />

      <Card stack aria-labelledby="kit-button">
        <SectionHead id="kit-button" icon={<Settings size={22} />} title="Button · IconButton" />
        <div className="row">
          <Button>Chính</Button>
          <Button variant="secondary">Phụ</Button>
          <Button variant="danger">Nguy hiểm</Button>
          <Button variant="ghost">Mờ</Button>
          <Button variant="danger-ghost">Nguy hiểm (mờ)</Button>
          <Button disabled>Đang tắt</Button>
          <a href="#kit-button" className={buttonClass({ variant: 'primary' })}>
            Liên kết dạng nút
          </a>
          <IconButton label="Thông báo mẫu">
            <Bell size={18} aria-hidden="true" />
          </IconButton>
        </div>
      </Card>

      <Card stack aria-labelledby="kit-chip">
        <SectionHead id="kit-chip" icon={<BadgeCheck size={22} />} title="Chip · Avatar · Stat" />
        <div className="row">
          <Chip tone="success">Thành công</Chip>
          <Chip tone="info">Thông tin</Chip>
          <Chip tone="muted">Trung tính</Chip>
          <Chip tone="warning">Cảnh báo</Chip>
          <Avatar size="sm">NA</Avatar>
          <Avatar>NA</Avatar>
          <Avatar size="lg">NA</Avatar>
          <Avatar ai>
            <Sparkles size={18} />
          </Avatar>
        </div>
        <Stat label="Email [MẪU]" value="mau@example.test" note="Đã xác minh" noteOk />
      </Card>

      <Card stack aria-labelledby="kit-tabs">
        <SectionHead id="kit-tabs" icon={<Users size={22} />} title="Tabs" />
        <Tabs
          label="Tab mẫu"
          items={[
            { key: 'a', href: '#kit-tabs', label: 'Đăng nhập', current: true },
            { key: 'b', href: '#kit-tabs', label: 'Đăng ký', current: false },
          ]}
        />
        <Tabs
          variant="section"
          label="Tab mục mẫu"
          items={[
            { key: 'a', href: '#kit-tabs', label: 'Bình luận', current: true },
            { key: 'b', href: '#kit-tabs', label: 'AI đã gửi', current: false },
          ]}
        />
        <Tabs
          variant="pill"
          label="Tab viên thuốc mẫu"
          items={[
            { key: 'a', href: '#kit-tabs', label: 'Tất cả', current: true },
            { key: 'b', href: '#kit-tabs', label: 'Facebook', current: false },
          ]}
        />
        <Avatar badge="FB">NA</Avatar>
        <Stepper
          label="Các bước mẫu"
          progress={50}
          steps={[
            { key: 'a', state: 'done', eyebrow: 'Bước 1', title: 'Kết nối', caption: 'Xong' },
            {
              key: 'b',
              state: 'current',
              eyebrow: 'Bước 2',
              title: 'Kiến thức',
              caption: 'Đang làm',
            },
            {
              key: 'c',
              state: 'todo',
              eyebrow: 'Bước 3',
              title: 'Bật AI',
              caption: 'Chưa bắt đầu',
            },
          ]}
        />
      </Card>

      <Card stack aria-labelledby="kit-form">
        <SectionHead
          id="kit-form"
          icon={<Settings size={22} />}
          title="FormField · Dialog · Banner"
        />
        <div className="form">
          <TextField name="a" label="Ô nhập" icon="mail" hint="Gợi ý dưới ô" />
          <TextField name="b" label="Ô nhập lỗi" icon="user" error="Thông báo lỗi mẫu" />
        </div>
        <Banner variant="info">Banner thông tin mẫu</Banner>
        <DialogTrigger dialogId="kit-dialog">Mở hộp thoại</DialogTrigger>
        <Dialog
          dialogId="kit-dialog"
          title="[MẪU] Hộp thoại"
          description="Nội dung mẫu"
          badge="Mới"
        >
          <p>Nội dung hộp thoại mẫu.</p>
        </Dialog>
      </Card>

      <Card aria-labelledby="kit-split">
        <SectionHead id="kit-split" icon={<Users size={22} />} title="SplitLayout" />
        <SplitLayout
          navLabel="Điều hướng mẫu"
          navTitle="CẤU HÌNH MẪU"
          items={[
            {
              key: 'a',
              href: '#kit-split',
              label: 'Kênh',
              icon: <Bell size={18} />,
              count: '1/2',
              current: true,
            },
            {
              key: 'b',
              href: '#kit-split',
              label: 'Thành viên',
              icon: <Users size={18} />,
              count: null,
              current: false,
            },
          ]}
        >
          <p className="muted">Nội dung cột phải (mẫu).</p>
        </SplitLayout>
      </Card>
    </main>
  );
}
