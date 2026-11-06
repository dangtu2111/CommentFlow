import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { NotificationBell } from '../../../../components/app/notification-bell';
import { ShellNav } from '../../../../components/app/shell-nav';
import { ShellQuotaCard } from '../../../../components/app/shell-quota-card';
import { UserCard } from '../../../../components/app/user-card';
import { BrandLogo } from '../../../../components/brand-logo';
import { LocaleSwitcher } from '../../../../components/locale-switcher';
import {
  type ConversationView,
  MessageCenter,
} from '../../../../components/messages/message-center';
import { navGroupsFor } from '../../../../lib/app-nav';
import { buildNotifications } from '../../../../lib/notification-model';
import { buildUsageMeterView } from '../../../../lib/usage-meter-view';

const NOW = new Date('2026-11-06T10:30:00Z');
const H = 3_600_000;
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * H);

/** Mọi dữ liệu dưới đây là MẪU (gắn "[MẪU]"), không phải khách/số liệu thật. */
const CONVERSATIONS: ConversationView[] = [
  {
    id: 'a',
    name: '[MẪU] Khách A',
    platform: 'facebook',
    preview: 'Dạ shop đã gửi bảng size…',
    previewBy: 'page',
    ago: '18 phút',
    lastCustomerMessageAt: hoursAgo(22.25),
    chip: null,
    fromComment: true,
  },
  {
    id: 'b',
    name: '[MẪU] Khách B',
    platform: 'instagram',
    preview: 'Cho mình gặp trực tiếp nhân viên…',
    previewBy: 'customer',
    ago: '42 phút',
    lastCustomerMessageAt: hoursAgo(20.8),
    chip: 'needsHuman',
    fromComment: false,
  },
  {
    id: 'c',
    name: '[MẪU] Khách C',
    platform: 'tiktok',
    preview: 'Shop vừa kiểm tra đơn hàng…',
    previewBy: 'ai',
    ago: '2 giờ trước',
    lastCustomerMessageAt: hoursAgo(8),
    chip: 'aiAuto',
    fromComment: false,
  },
  {
    id: 'd',
    name: '[MẪU] Khách D',
    platform: 'facebook',
    preview: 'Mẫu này nam mặc phối đồi…',
    previewBy: 'customer',
    ago: '30 giờ trước',
    lastCustomerMessageAt: hoursAgo(30),
    chip: 'pending',
    fromComment: false,
  },
];

/**
 * Trang Tin nhắn (design/stitch/messages.png) với DỮ LIỆU MẪU — CHỈ khi `NODE_ENV !== 'production'`
 * (UI-first 06/11/2026). Chưa có kênh nhắn tin thật nên chưa có route `/app/messages` và chưa có mục "Tin nhắn" ở thanh bên.
 */
export default async function DevMessagesPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const t = await getTranslations();
  const groups = navGroupsFor('owner').map((group) => ({
    key: group.key,
    label: t(`shell.groups.${group.key}`),
    items: group.items.map((item) => ({ ...item, label: t(`shell.nav.${item.key}`) })),
  }));
  const alerts = { banners: [], silent: null, reconnect: false };
  return (
    <div className="shell">
      <header className="shell-top">
        <BrandLogo href="/dev/ui" />
        <span className="chip-live">[MẪU] Cửa hàng mẫu</span>
        <div className="shell-top-end">
          <LocaleSwitcher />
          <NotificationBell
            model={buildNotifications(alerts.banners, alerts.silent)}
            canOpenChannels
          />
        </div>
      </header>
      <div className="shell-body">
        <ShellNav
          groups={groups}
          label={t('shell.navLabel')}
          quota={<ShellQuotaCard view={buildUsageMeterView({ used: 2140, limit: 3000 })} />}
          footer={
            <UserCard name="[MẪU] Nguyễn Mai Linh" roleLabel={t('workspace.switcher.role.owner')} />
          }
        />
        <div className="shell-main">
          <main className="app-page app-page-wide app-page-full stack">
            <p className="badge badge-off">{t('messagesUi.sampleBanner')}</p>
            <h1 className="auth-title">{t('messagesUi.title')}</h1>
            <MessageCenter
              now={NOW}
              activeTab="pending"
              tabCounts={{
                nearDeadline: 3,
                pending: 8,
                needsHuman: 4,
                aiReplying: 14,
                willAutoSend: 2,
                done: 320,
                all: 351,
              }}
              conversations={CONVERSATIONS}
              activeId="a"
              thread={{
                quotedComment:
                  '[MẪU] Shop tư vấn size giúp mình nhé, mẫu váy hoa nhí bé này cao 1m58 mặc đến đâu ạ?',
                messages: [
                  {
                    from: 'customer',
                    text: '[MẪU] Mình cao 1m58 nặng 52kg thì mặc size M hay L vừa ạ?',
                    time: '10:16',
                  },
                ],
                aiSuggestion:
                  '[MẪU] Dạ số đo vòng eo của size M là 68–72cm bạn nha! Phía sau lưng váy có may bo chun mềm co giãn nhẹ nên ngồi làm việc hay ăn no đều rất thoải mái ạ.',
                aiSources: ['[MẪU] Bảng thông số kỹ thuật sản phẩm', '[MẪU] FAQ: Co giãn eo lưng'],
                pageName: '[MẪU] Cửa hàng mẫu',
                staffName: '[MẪU] Nhân viên',
              }}
              customer={{
                name: '[MẪU] Khách A',
                platform: 'facebook',
                stage: '[MẪU] Khách hàng tiềm năng',
                interactions: '[MẪU] 2',
                firstContact: '[MẪU] 3 ngày trước',
                channelName: 'Facebook Messenger',
                userId: '[MẪU] FB_000000',
                area: '[MẪU] Hà Nội',
                product: {
                  name: '[MẪU] Váy hoa nhí',
                  sku: 'MAU-01',
                  price: '[MẪU] 000.000đ',
                  stock: 12,
                },
                tags: ['[MẪU] Hỏi size', '[MẪU] Cần chốt nhanh'],
                note: '[MẪU] Ghi chú nội bộ mẫu.',
              }}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
