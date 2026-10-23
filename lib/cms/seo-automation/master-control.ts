/**
 * SEO Automation master control plane — SEO Manager single-operator surface.
 *
 * ALL autonomous operations default OFF. Env/request flags cannot silently
 * activate writers. Compile-time constants remain the authority for Apply /
 * publisher wiring until a Berlin-approved activation patch.
 */

export const SEO_AUTOMATION_MASTER_CONTROL_SPEC = "seo-automation-master-control-v1" as const;

/** Compile-time emergency kill — true means every autonomous path must refuse. */
export const SEO_AUTOMATION_EMERGENCY_KILL_SWITCH = true as const;

/** Master automation switch — OFF until supervised pilot acceptance. */
export const SEO_AUTOMATION_MASTER_ENABLED = false as const;

export const SEO_AUTOMATION_RESEARCH_ENABLED = false as const;
export const SEO_AUTOMATION_GENERATION_ENABLED = false as const;
export const SEO_AUTOMATION_APPLY_WRITERS_ENABLED = false as const;
export const SEO_AUTOMATION_PUBLISHER_ENABLED = false as const;
export const SEO_AUTOMATION_SCHEDULER_ENABLED = false as const;
export const SEO_AUTOMATION_OUTCOMES_RECURRING_ENABLED = false as const;

export const SEO_AUTOMATION_DEFAULT_TIMEZONE = "Europe/London" as const;

export type SeoAutomationSwitchBoard = {
  spec: typeof SEO_AUTOMATION_MASTER_CONTROL_SPEC;
  emergencyKill: boolean;
  masterEnabled: boolean;
  researchEnabled: boolean;
  generationEnabled: boolean;
  applyWritersEnabled: boolean;
  publisherEnabled: boolean;
  schedulerEnabled: boolean;
  outcomesRecurringEnabled: boolean;
  timezone: typeof SEO_AUTOMATION_DEFAULT_TIMEZONE;
  allAutonomousOff: true;
};

export function readSeoAutomationSwitchBoard(): SeoAutomationSwitchBoard {
  const emergencyKill = Boolean(SEO_AUTOMATION_EMERGENCY_KILL_SWITCH);
  const masterEnabled = !emergencyKill && Boolean(SEO_AUTOMATION_MASTER_ENABLED);
  return {
    spec: SEO_AUTOMATION_MASTER_CONTROL_SPEC,
    emergencyKill,
    masterEnabled,
    researchEnabled: masterEnabled && Boolean(SEO_AUTOMATION_RESEARCH_ENABLED),
    generationEnabled: masterEnabled && Boolean(SEO_AUTOMATION_GENERATION_ENABLED),
    applyWritersEnabled: masterEnabled && Boolean(SEO_AUTOMATION_APPLY_WRITERS_ENABLED),
    publisherEnabled: masterEnabled && Boolean(SEO_AUTOMATION_PUBLISHER_ENABLED),
    schedulerEnabled: masterEnabled && Boolean(SEO_AUTOMATION_SCHEDULER_ENABLED),
    outcomesRecurringEnabled:
      masterEnabled && Boolean(SEO_AUTOMATION_OUTCOMES_RECURRING_ENABLED),
    timezone: SEO_AUTOMATION_DEFAULT_TIMEZONE,
    allAutonomousOff: true,
  };
}

export function assertSeoAutomationPathAllowed(
  path:
    | "research"
    | "generation"
    | "apply_writers"
    | "publisher"
    | "scheduler"
    | "outcomes_recurring",
): { ok: true } | { ok: false; code: "emergency_off" | "master_off" | "path_off"; error: string } {
  const board = readSeoAutomationSwitchBoard();
  if (board.emergencyKill) {
    return {
      ok: false,
      code: "emergency_off",
      error: "SEO Automation emergency kill switch is ON. All autonomous paths are blocked.",
    };
  }
  if (!board.masterEnabled) {
    return {
      ok: false,
      code: "master_off",
      error: "SEO Automation master switch is OFF.",
    };
  }
  const map = {
    research: board.researchEnabled,
    generation: board.generationEnabled,
    apply_writers: board.applyWritersEnabled,
    publisher: board.publisherEnabled,
    scheduler: board.schedulerEnabled,
    outcomes_recurring: board.outcomesRecurringEnabled,
  } as const;
  if (!map[path]) {
    return {
      ok: false,
      code: "path_off",
      error: `SEO Automation path "${path}" is OFF.`,
    };
  }
  return { ok: true };
}
