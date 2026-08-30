export type BootstrapAction = "insert" | "emergency-restore" | "emergency-reset" | "none";

export function envPasswordBootstrapAction(input: {
  userCount: number;
  allowEmergency: boolean;
  emergencyRecovery: boolean;
  activeSuperAdmins: number;
  emergencyReset: boolean;
  emergencyResetAlreadyApplied: boolean;
}): BootstrapAction {
  if (input.userCount <= 0) return "insert";
  if (!input.allowEmergency) return "none";
  if (input.emergencyRecovery && input.activeSuperAdmins <= 0) return "emergency-restore";
  if (input.emergencyReset && !input.emergencyResetAlreadyApplied) return "emergency-reset";
  return "none";
}

export function envPasswordMayAuthenticate(input: { databaseConfigured: boolean; adminUserCount: number }) {
  if (input.databaseConfigured) return false;
  return input.adminUserCount <= 0;
}
