import type { AuthProvider } from "@/features/integrations/types";

export const AUTH_PROVIDERS: AuthProvider[] = [
  {
    key: "openai",
    label: "OpenAI",
    description:
      "API-key storage for future native OpenAI-backed agent execution.",
    methods: ["api_key"],
    defaultMethod: "api_key",
    scopes: [],
    models: ["gpt-4.1-mini", "gpt-4.1"],
    secretLabel: "OpenAI API key",
    docsUrl: "https://platform.openai.com/docs",
  },
  {
    key: "anthropic",
    label: "Anthropic",
    description:
      "API-key storage for future native Claude-backed agent execution.",
    methods: ["api_key"],
    defaultMethod: "api_key",
    scopes: [],
    models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
    secretLabel: "Anthropic API key",
    docsUrl: "https://docs.anthropic.com/",
  },
  {
    key: "google",
    label: "Gemini",
    description: "API-key storage for future native Gemini agent execution.",
    methods: ["api_key"],
    defaultMethod: "api_key",
    scopes: [],
    models: ["gemini-1.5-pro", "gemini-1.5-flash"],
    secretLabel: "Gemini API key",
    docsUrl: "https://ai.google.dev/gemini-api/docs",
  },
  {
    key: "custom",
    label: "Custom API",
    description: "OpenAI-compatible endpoint storage for future native model calls.",
    methods: ["api_key"],
    defaultMethod: "api_key",
    scopes: [],
    models: ["custom-model"],
    secretLabel: "Provider API key",
    docsUrl: "https://platform.openai.com/docs/api-reference",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    description:
      "3-legged OAuth foundation for future approval-gated posting and comments.",
    methods: ["oauth"],
    defaultMethod: "oauth",
    scopes: ["openid", "profile", "email", "w_member_social"],
    models: [],
    secretLabel: "LinkedIn OAuth",
    docsUrl:
      "https://learn.microsoft.com/linkedin/shared/authentication/authorization-code-flow",
  },
];

export function getAuthProvider(key: string): AuthProvider | null {
  return AUTH_PROVIDERS.find((provider) => provider.key === key) ?? null;
}
