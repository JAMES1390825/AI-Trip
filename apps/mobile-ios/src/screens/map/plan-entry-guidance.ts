export type GuidancePrimaryActionKind = "OPEN_DESTINATION_SEARCH" | "OPEN_DATE_PICKER";

export type GuidanceSuggestionAction =
  | { kind: "SET_DAYS"; value: string; days: number }
  | { kind: "SET_START_DATE"; value: string; startDate: string }
  | { kind: "SET_DESTINATION"; value: string }
  | { kind: "APPEND_NOTE"; value: string };

export type PlanEntryGuidance = {
  needsCompletion: boolean;
  message: string;
  primaryAction: { kind: GuidancePrimaryActionKind; label: string } | null;
  highlights: {
    destination: boolean;
    schedule: boolean;
    planningNote: boolean;
  };
};

type BuildPlanEntryGuidanceInput = {
  missingFields: string[];
  nextAction: string;
  clarificationQuestion: string;
  suggestedOptions: string[];
};

function normalizeText(value: string): string {
  return String(value || "").trim();
}

function normalizeMissingFields(values: string[]): string[] {
  return values.map((item) => normalizeText(item)).filter(Boolean);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizeText(value));
}

export function buildPlanEntryGuidance(input: BuildPlanEntryGuidanceInput): PlanEntryGuidance {
  const missingFields = normalizeMissingFields(input.missingFields);
  const nextAction = normalizeText(input.nextAction);
  const clarificationQuestion = normalizeText(input.clarificationQuestion);
  const needsCompletion = missingFields.length > 0;

  if (!needsCompletion) {
    return {
      needsCompletion: false,
      message: "",
      primaryAction: null,
      highlights: {
        destination: false,
        schedule: false,
        planningNote: false,
      },
    };
  }

  if (nextAction === "CONFIRM_DESTINATION" || missingFields.includes("destination")) {
    return {
      needsCompletion: true,
      message: clarificationQuestion,
      primaryAction: { kind: "OPEN_DESTINATION_SEARCH", label: "去确认目的地" },
      highlights: {
        destination: true,
        schedule: false,
        planningNote: false,
      },
    };
  }

  if (
    nextAction === "CONFIRM_DAYS" ||
    nextAction === "CONFIRM_START_DATE" ||
    missingFields.includes("days") ||
    missingFields.includes("start_date")
  ) {
    return {
      needsCompletion: true,
      message: clarificationQuestion,
      primaryAction: { kind: "OPEN_DATE_PICKER", label: "去补日期和天数" },
      highlights: {
        destination: false,
        schedule: true,
        planningNote: false,
      },
    };
  }

  return {
    needsCompletion: true,
    message: clarificationQuestion,
    primaryAction: null,
    highlights: {
      destination: false,
      schedule: false,
      planningNote: true,
    },
  };
}

export function interpretSuggestedOption(nextAction: string, option: string): GuidanceSuggestionAction {
  const value = normalizeText(option);
  const normalizedNextAction = normalizeText(nextAction);

  if (normalizedNextAction === "CONFIRM_DAYS") {
    const match = value.match(/(\d+)/);
    if (match) {
      return {
        kind: "SET_DAYS",
        value,
        days: Number(match[1]),
      };
    }
  }

  if (normalizedNextAction === "CONFIRM_START_DATE" && isIsoDate(value)) {
    return {
      kind: "SET_START_DATE",
      value,
      startDate: value,
    };
  }

  if (normalizedNextAction === "CONFIRM_DESTINATION" && value) {
    return {
      kind: "SET_DESTINATION",
      value,
    };
  }

  return {
    kind: "APPEND_NOTE",
    value,
  };
}

export function resolveMissingFieldsAfterSuggestion(
  missingFields: string[],
  action: GuidanceSuggestionAction,
): string[] {
  const normalizedMissingFields = normalizeMissingFields(missingFields);

  switch (action.kind) {
    case "SET_DAYS":
      return normalizedMissingFields.filter((item) => item !== "days");
    case "SET_START_DATE":
      return normalizedMissingFields.filter((item) => item !== "start_date");
    case "SET_DESTINATION":
      return normalizedMissingFields.filter((item) => item !== "destination");
    case "APPEND_NOTE":
      return normalizedMissingFields;
  }
}
