export type ExistingVersion = {
  stableKey: string;
  version: number;
  checksum: string;
};

export type IncomingVersion = ExistingVersion;

export type VersionConflict = {
  stableKey: string;
  version: number;
  existingChecksum: string;
  incomingChecksum: string;
};

export type VersionImportPlan<T extends IncomingVersion> = {
  create: T[];
  unchanged: T[];
  conflicts: VersionConflict[];
};

export function createVersionImportPlan<T extends IncomingVersion>(
  incoming: readonly T[],
  existing: readonly ExistingVersion[],
): VersionImportPlan<T> {
  const existingByKey = new Map(
    existing.map((item) => [`${item.stableKey}@${String(item.version)}`, item]),
  );
  const plan: VersionImportPlan<T> = { create: [], unchanged: [], conflicts: [] };

  for (const item of incoming) {
    const current = existingByKey.get(`${item.stableKey}@${String(item.version)}`);
    if (current === undefined) {
      plan.create.push(item);
    } else if (current.checksum === item.checksum) {
      plan.unchanged.push(item);
    } else {
      plan.conflicts.push({
        stableKey: item.stableKey,
        version: item.version,
        existingChecksum: current.checksum,
        incomingChecksum: item.checksum,
      });
    }
  }

  return plan;
}
