// Tên các dấu trạng thái trong stateDir (tách riêng để runner và janitor không import vòng nhau).
export const FREEZE_MARKER = 'merge-freeze';
export const trackingMarker = (pr) => `pr-${pr}.tracking`;
export const janitorStuckMarker = (pr) => `pr-${pr}.janitor-stuck`;
