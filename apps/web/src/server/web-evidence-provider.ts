import type { EvidenceUseCase, StopEvidence } from "../domain/types";

export type WebEvidenceRequest = {
  city: string;
  query: string;
  stopNames: string[];
  usedFor: EvidenceUseCase;
};

export type WebEvidenceProvider = {
  searchEvidence(input: WebEvidenceRequest): Promise<StopEvidence[]>;
};

export type WebEvidenceProviderEnv = {
  SEARCH_PROVIDER?: string;
  EXA_API_KEY?: string;
};

type ExaWebEvidenceProviderOptions = {
  apiKey: string;
  fetcher?: typeof fetch;
};

const EXA_SEARCH_URL = "https://api.exa.ai/search";

export class NullWebEvidenceProvider implements WebEvidenceProvider {
  async searchEvidence(_input?: WebEvidenceRequest): Promise<StopEvidence[]> {
    return [];
  }
}

export class ExaWebEvidenceProvider implements WebEvidenceProvider {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ExaWebEvidenceProviderOptions) {
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
  }

  async searchEvidence(input: WebEvidenceRequest): Promise<StopEvidence[]> {
    if (!this.apiKey.trim()) {
      return [];
    }

    const query = [input.city, input.query, ...input.stopNames.slice(0, 4), "旅行攻略", "避坑", "预约"]
      .filter(Boolean)
      .join(" ");

    try {
      const response = await this.fetcher(EXA_SEARCH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey
        },
        body: JSON.stringify({
          query,
          type: "auto",
          numResults: 5,
          contents: { highlights: true, summary: true }
        })
      });

      if (!response.ok) {
        return [];
      }

      return normalizeExaEvidence(await response.json(), input.usedFor);
    } catch {
      return [];
    }
  }
}

export function normalizeExaEvidence(payload: unknown, usedFor: EvidenceUseCase): StopEvidence[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return [];
  }

  return payload.results.flatMap((result) => {
    if (!isRecord(result)) {
      return [];
    }

    const title = readString(result.title);
    const url = readSafeUrl(result.url);

    if (!title || !url) {
      return [];
    }

    const sourceName =
      readString(result.source) || readString(result.author) || readHostname(url) || "Web";
    const snippet =
      readFirstString(result.highlights) || readString(result.summary) || readString(result.text) || title;
    const publishedDate = readString(result.publishedDate);

    return [
      {
        title,
        url,
        sourceName,
        snippet,
        usedFor,
        ...(publishedDate ? { publishedDate } : {})
      }
    ];
  });
}

export function createWebEvidenceProvider(env: WebEvidenceProviderEnv): WebEvidenceProvider {
  if (env.SEARCH_PROVIDER === "exa" && env.EXA_API_KEY?.trim()) {
    return new ExaWebEvidenceProvider({ apiKey: env.EXA_API_KEY });
  }

  return new NullWebEvidenceProvider();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readFirstString(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return readString(value.find((item) => readString(item)));
}

function readSafeUrl(value: unknown): string {
  const url = readString(value);

  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

function readHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
