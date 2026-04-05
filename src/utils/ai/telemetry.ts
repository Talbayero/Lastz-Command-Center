import "server-only";

type AiLogStatus = "start" | "success" | "failure";

type AiLogPayload = {
  feature: string;
  promptId: string;
  promptVersion: number;
  provider: string;
  model: string;
  durationMs?: number;
  details?: string;
};

function shouldLogAi() {
  return process.env.ENABLE_AI_LOGS === "true" || process.env.ENABLE_PERF_LOGS === "true";
}

export function logAiEvent(status: AiLogStatus, payload: AiLogPayload) {
  if (!shouldLogAi()) {
    return;
  }

  const details = payload.details ? ` details=${payload.details}` : "";
  const duration = payload.durationMs !== undefined ? ` duration=${payload.durationMs}ms` : "";
  console.info(
    `[AI] status=${status} feature=${payload.feature} prompt=${payload.promptId}@v${payload.promptVersion} provider=${payload.provider} model=${payload.model}${duration}${details}`
  );
}
