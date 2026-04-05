export type AiPromptDefinition = {
  id: string;
  version: number;
  description: string;
  expectsJson: boolean;
  text: string;
};

export const AI_PROMPTS = {
  playerNameVision: {
    id: "player-name-vision",
    version: 1,
    description: "Extract the player name from a cropped Last Z profile screenshot header.",
    expectsJson: false,
    text: "Read only the player name from this game screenshot crop. Respond with just the exact player name and nothing else. If uncertain, return UNKNOWN.",
  },
  allianceDuelVision: {
    id: "alliance-duel-vision",
    version: 1,
    description: "Extract visible alliance duel ranking rows from a Last Z screenshot.",
    expectsJson: true,
    text: [
      "Read this Last Z alliance duel ranking screenshot.",
      "Return JSON only.",
      'Use this schema: {"entries":[{"rank":1,"name":"Player Name","score":123456}]}',
      "Extract only visible players.",
      "Do not invent missing players.",
      "Each score must belong to the same horizontal row as the player name and rank.",
      "Do not borrow a score from a different player row.",
      "Ignore alliance tags like [BOM] and ignore decorative UI text.",
      "Scores must be integers with no commas.",
      "If rank is not visible, use null.",
    ].join(" "),
  },
} as const satisfies Record<string, AiPromptDefinition>;

export type AiPromptKey = keyof typeof AI_PROMPTS;

export function getAiPrompt(key: AiPromptKey) {
  return AI_PROMPTS[key];
}
