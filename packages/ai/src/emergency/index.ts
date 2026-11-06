// API công khai của module emergency. Thêm export mới ở ĐÂY (không sửa src/index.ts).
export {
  createEmergencyStopService,
  type EmergencyActor,
  type EmergencyStopService,
  type ResumeResult,
  type StopResult,
} from './emergency-service';
export {
  decideEmergencyChange,
  EMERGENCY_RESUME_ROLES,
  EMERGENCY_STOP_ROLES,
  type EmergencyAction,
  type EmergencyActorRole,
  type EmergencyChange,
  type EmergencyChangeErrorCode,
  type EmergencyChangeResult,
  type EmergencyState,
  type EmergencyStopRole,
  initialEmergencyState,
  isEmergencyStopped,
  stateFromStoppedAt,
} from './emergency-stop';
export { createInMemoryEmergencyStopStore, type EmergencyStopStore } from './emergency-store';
