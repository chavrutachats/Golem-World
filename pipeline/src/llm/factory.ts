import type { PipelineConfig, ProviderName } from '../config.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAiProvider } from './openai.js';
import type { LlmProvider } from './types.js';

function requireKey(provider: ProviderName, key: string): string {
  if (!key) {
    const variable = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    throw new Error(`${variable} está vazia no .env (provedor "${provider}").`);
  }
  return key;
}

export function createProvider(config: PipelineConfig, role: 'generator' | 'verifier'): LlmProvider {
  const { provider, model } = config.llm[role];
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider({ apiKey: requireKey(provider, config.llm.apiKeys.anthropic), model });
    case 'openai':
      return new OpenAiProvider({ apiKey: requireKey(provider, config.llm.apiKeys.openai), model });
  }
}
