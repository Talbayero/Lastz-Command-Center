export type SharedDraft = {
  name: string;
  techPower: number;
  heroPower: number;
  troopPower: number;
  modVehiclePower: number;
  structurePower: number;
  march1Power: number;
  march2Power: number;
  march3Power: number;
  march4Power: number;
  combatPower: number;
  kills: number;
  notes: string;
};

export type ApplicantDraft = SharedDraft & {
  timezone: string;
  status: string;
};

export type MigrationDraft = SharedDraft & {
  originalServer: string;
  originalAlliance: string;
  reasonForLeaving: string;
  contactStatus: string;
  category: string;
  status: string;
};

export type ApplicantRecord = ApplicantDraft & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type MigrationRecord = MigrationDraft & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export function normalizeCsvHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

export function parseCsvText(text: string) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map(normalizeCsvHeader);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = values[index] ?? "";
      return acc;
    }, {});
  });
}

export function csvNumber(value: string | undefined) {
  const digits = (value ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

export function getCsvValue(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const normalized = normalizeCsvHeader(key);
    const value = row[normalized];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return "";
}

export function preferNonZero(current: number, incoming: number) {
  return current === 0 && incoming > 0 ? incoming : current;
}

export function preferBlank(current: string, incoming: string) {
  return current.trim() === "" && incoming.trim() !== "" ? incoming : current;
}

export function toApplicantDraftFromCsv(row: Record<string, string>): ApplicantDraft {
  return {
    name: getCsvValue(row, "player name", "name"),
    timezone: getCsvValue(row, "timezone") || "UTC-6",
    status: getCsvValue(row, "status") || "New",
    techPower: csvNumber(getCsvValue(row, "tech power", "tech")),
    heroPower: csvNumber(getCsvValue(row, "hero power", "hero")),
    troopPower: csvNumber(getCsvValue(row, "troop power", "troop")),
    modVehiclePower: csvNumber(getCsvValue(row, "mod vehicle power", "mod vehicle", "modvehicle")),
    structurePower: csvNumber(getCsvValue(row, "structure power", "structure")),
    march1Power: csvNumber(getCsvValue(row, "march 1 power", "march1power", "march1")),
    march2Power: csvNumber(getCsvValue(row, "march 2 power", "march2power", "march2")),
    march3Power: csvNumber(getCsvValue(row, "march 3 power", "march3power", "march3")),
    march4Power: csvNumber(getCsvValue(row, "march 4 power", "march4power", "march4")),
    combatPower: 0,
    kills: csvNumber(getCsvValue(row, "kills")),
    notes: getCsvValue(row, "notes"),
  };
}

export function toMigrationDraftFromCsv(row: Record<string, string>): MigrationDraft {
  return {
    name: getCsvValue(row, "player name", "name"),
    originalServer: getCsvValue(row, "original server", "server", "origin server"),
    originalAlliance: getCsvValue(row, "original alliance", "alliance", "origin alliance"),
    reasonForLeaving: getCsvValue(row, "reason for leaving", "reason"),
    contactStatus: getCsvValue(row, "contact status", "contact") || "Not Contacted",
    category: getCsvValue(row, "category") || "Regular",
    status: getCsvValue(row, "status") || "Scouted",
    techPower: csvNumber(getCsvValue(row, "tech power", "tech")),
    heroPower: csvNumber(getCsvValue(row, "hero power", "hero")),
    troopPower: csvNumber(getCsvValue(row, "troop power", "troop")),
    modVehiclePower: csvNumber(getCsvValue(row, "mod vehicle power", "mod vehicle", "modvehicle")),
    structurePower: csvNumber(getCsvValue(row, "structure power", "structure")),
    march1Power: csvNumber(getCsvValue(row, "march 1 power", "march1power", "march1")),
    march2Power: csvNumber(getCsvValue(row, "march 2 power", "march2power", "march2")),
    march3Power: csvNumber(getCsvValue(row, "march 3 power", "march3power", "march3")),
    march4Power: csvNumber(getCsvValue(row, "march 4 power", "march4power", "march4")),
    combatPower: 0,
    kills: csvNumber(getCsvValue(row, "kills")),
    notes: getCsvValue(row, "notes"),
  };
}

export function mergeApplicantDraft(existing: ApplicantRecord, incoming: ApplicantDraft): ApplicantDraft {
  return {
    name: existing.name,
    timezone: preferBlank(existing.timezone, incoming.timezone) || "UTC-6",
    status: existing.status || incoming.status,
    techPower: preferNonZero(existing.techPower, incoming.techPower),
    heroPower: preferNonZero(existing.heroPower, incoming.heroPower),
    troopPower: preferNonZero(existing.troopPower, incoming.troopPower),
    modVehiclePower: preferNonZero(existing.modVehiclePower, incoming.modVehiclePower),
    structurePower: preferNonZero(existing.structurePower, incoming.structurePower),
    march1Power: preferNonZero(existing.march1Power, incoming.march1Power),
    march2Power: preferNonZero(existing.march2Power, incoming.march2Power),
    march3Power: preferNonZero(existing.march3Power, incoming.march3Power),
    march4Power: preferNonZero(existing.march4Power, incoming.march4Power),
    combatPower: 0,
    kills: preferNonZero(existing.kills, incoming.kills),
    notes: preferBlank(existing.notes, incoming.notes),
  };
}

export function mergeMigrationDraft(existing: MigrationRecord, incoming: MigrationDraft): MigrationDraft {
  return {
    name: existing.name,
    originalServer: preferBlank(existing.originalServer, incoming.originalServer),
    originalAlliance: preferBlank(existing.originalAlliance, incoming.originalAlliance),
    reasonForLeaving: preferBlank(existing.reasonForLeaving, incoming.reasonForLeaving),
    contactStatus: existing.contactStatus || incoming.contactStatus,
    category: existing.category || incoming.category || "Regular",
    status: existing.status || incoming.status,
    techPower: preferNonZero(existing.techPower, incoming.techPower),
    heroPower: preferNonZero(existing.heroPower, incoming.heroPower),
    troopPower: preferNonZero(existing.troopPower, incoming.troopPower),
    modVehiclePower: preferNonZero(existing.modVehiclePower, incoming.modVehiclePower),
    structurePower: preferNonZero(existing.structurePower, incoming.structurePower),
    march1Power: preferNonZero(existing.march1Power, incoming.march1Power),
    march2Power: preferNonZero(existing.march2Power, incoming.march2Power),
    march3Power: preferNonZero(existing.march3Power, incoming.march3Power),
    march4Power: preferNonZero(existing.march4Power, incoming.march4Power),
    combatPower: 0,
    kills: preferNonZero(existing.kills, incoming.kills),
    notes: preferBlank(existing.notes, incoming.notes),
  };
}

export function createCsvTemplate(scope: "applicants" | "migrations") {
  const headers =
    scope === "applicants"
      ? [
          "player_name",
          "timezone",
          "status",
          "tech_power",
          "hero_power",
          "troop_power",
          "mod_vehicle_power",
          "structure_power",
          "march_1_power",
          "march_2_power",
          "march_3_power",
          "march_4_power",
          "kills",
          "notes",
        ]
      : [
          "player_name",
          "original_server",
          "original_alliance",
          "status",
          "contact_status",
          "category",
          "reason_for_leaving",
          "tech_power",
          "hero_power",
          "troop_power",
          "mod_vehicle_power",
          "structure_power",
          "march_1_power",
          "march_2_power",
          "march_3_power",
          "march_4_power",
          "kills",
          "notes",
        ];

  const sample =
    scope === "applicants"
      ? [
          "SamplePlayer",
          "UTC-6",
          "New",
          "19255142",
          "56195929",
          "81674460",
          "8061391",
          "63673199",
          "0",
          "0",
          "0",
          "0",
          "4341281",
          "Optional notes",
        ]
      : [
          "SamplePlayer",
          "123",
          "PHnx",
          "Scouted",
          "Not Contacted",
          "Regular",
          "Optional reason",
          "19255142",
          "56195929",
          "81674460",
          "8061391",
          "63673199",
          "0",
          "0",
          "0",
          "0",
          "4341281",
          "Optional notes",
        ];

  return `${headers.join(",")}\n${sample.join(",")}\n`;
}
