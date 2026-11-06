import { userInitials } from '../../lib/user-initials';

/** Thẻ người dùng (ảnh đại diện chữ + tên + vai trò). Dùng ở đáy thanh bên và đầu trang. Không có ảnh thật. */
export function UserCard({ name, roleLabel }: { name: string; roleLabel: string }) {
  return (
    <div className="user-card" title={name}>
      <span className="user-avatar" aria-hidden="true">
        {userInitials(name)}
      </span>
      <span className="user-card-text">
        <span className="user-card-name">{name}</span>
        <span className="user-card-role">{roleLabel}</span>
      </span>
    </div>
  );
}
