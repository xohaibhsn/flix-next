/**
 * L4B Planning write-fence — prepared production operations package.
 * NOT EXECUTED. Separate Professor approval required for any production step.
 *
 * Distinguishes application rollback from database restore.
 * Writers-OFF alone is insufficient after fence arming or durable lineage writes.
 */

import {
  L4B_PLANNING_WRITE_FENCE_DDL_VERSION,
  L4B_PLANNING_WRITE_FENCE_INSTALL_SEQUENCE,
  L4B_PLANNING_WRITE_FENCE_PRIVILEGE_EXPECTATIONS,
  L4B_PLANNING_WRITE_FENCE_ROLLBACK_SEQUENCE,
  SEO_PLANNING_WRITE_FENCE_DELETE_TRIGGER_SQL,
  SEO_PLANNING_WRITE_FENCE_DROP_TRIGGERS_SQL,
  SEO_PLANNING_WRITE_FENCE_INSERT_TRIGGER_SQL,
  SEO_PLANNING_WRITE_FENCE_TABLE_DDL,
  describePlanningWriteFenceDdlPackage,
} from "@/lib/cms/seo-planning-lineage/planning-write-fence-ddl";
import { L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN } from "@/lib/cms/seo-planning-lineage/schema-ddl";

export const L4B_PLANNING_WRITE_FENCE_OPS_VERSION = "l4b-fence-ops-v1" as const;

export function describePlanningWriteFenceProductionOpsPackage(): {
  version: typeof L4B_PLANNING_WRITE_FENCE_OPS_VERSION;
  ddlVersion: typeof L4B_PLANNING_WRITE_FENCE_DDL_VERSION;
  executed: false;
  schemaMarkerMustRemain: typeof L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN;
  objects: ReturnType<typeof describePlanningWriteFenceDdlPackage>;
  privilegeExpectations: typeof L4B_PLANNING_WRITE_FENCE_PRIVILEGE_EXPECTATIONS;
  installSequence: typeof L4B_PLANNING_WRITE_FENCE_INSTALL_SEQUENCE;
  rollbackSequence: typeof L4B_PLANNING_WRITE_FENCE_ROLLBACK_SEQUENCE;
  ddlInventory: {
    controlTable: string;
    insertTrigger: string;
    deleteTrigger: string;
    dropTriggers: string;
  };
  backupPrerequisites: string[];
  mixedVersionBehavior: string[];
  activationReleaseSequencing: string[];
  sequentialApprovals: string[];
  postActivationRecovery: string[];
} {
  return {
    version: L4B_PLANNING_WRITE_FENCE_OPS_VERSION,
    ddlVersion: L4B_PLANNING_WRITE_FENCE_DDL_VERSION,
    executed: false,
    schemaMarkerMustRemain: L4B_LIVE_SCHEMA_VERSION_MUST_REMAIN,
    objects: describePlanningWriteFenceDdlPackage(),
    privilegeExpectations: L4B_PLANNING_WRITE_FENCE_PRIVILEGE_EXPECTATIONS,
    installSequence: L4B_PLANNING_WRITE_FENCE_INSTALL_SEQUENCE,
    rollbackSequence: L4B_PLANNING_WRITE_FENCE_ROLLBACK_SEQUENCE,
    ddlInventory: {
      controlTable: SEO_PLANNING_WRITE_FENCE_TABLE_DDL,
      insertTrigger: SEO_PLANNING_WRITE_FENCE_INSERT_TRIGGER_SQL,
      deleteTrigger: SEO_PLANNING_WRITE_FENCE_DELETE_TRIGGER_SQL,
      dropTriggers: SEO_PLANNING_WRITE_FENCE_DROP_TRIGGERS_SQL,
    },
    backupPrerequisites: [
      "Full logical backup of production CMS schema before any fence DDL",
      "Verify restore rehearsal procedure on a disposable copy (not this task)",
      "Confirm Trigger privilege on production (Hostinger flag ≠ proven CREATE TRIGGER)",
      "Confirm no incompatible in-flight Planning transactions before arm (control-row lock test)",
    ],
    mixedVersionBehavior: [
      "Old worker unmarked Planning INSERT → PLANNING_WRITE_FENCED after arm",
      "Old worker Planning UPDATE (archive/payload) remains allowed (no UPDATE trigger by default)",
      "Old worker linked permanent DELETE → PLANNING_DELETE_FENCED and/or FK RESTRICT",
      "New transactional worker requires session auth + atomic draft+link",
      "Surface fence errors safely in Sidhu UI (controlled rejection, not silent success)",
    ],
    activationReleaseSequencing: [
      "1. Deploy exact SHA with writers still OFF and facade ACTIVATION_DENIED",
      "2. Install control table + triggers (inactive)",
      "3. Verify physical lineage READY",
      "4. Arm fence under exclusive lock (serialized vs in-flight writes)",
      "5. Separately reviewed patch to enable transactional writers (NOT this package)",
      "6. Protected-delete acceptance under fence + policy",
    ],
    sequentialApprovals: [
      "Professor: production backup window",
      "Professor: production fence DDL install (inactive)",
      "Professor: fence arm",
      "Professor: transactional writer authorization flip (separate patch)",
      "Berlin: release-readiness audit at each gate",
    ],
    postActivationRecovery: [
      "Rollback app to writers-OFF does not remove triggers or lineage rows",
      "Emergency disarm (fence_active=0) re-opens legacy INSERT — use only under approval",
      "DROP triggers after lineage exists leaves durable links; restore from backup if schema must revert",
      "Never treat Trigger privilege alone as proof of production executability",
    ],
  };
}
