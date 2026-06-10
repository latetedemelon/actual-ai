import { LanguageModel } from 'ai';
import { LlmModelFactoryI } from '../src/types';
import RateLimiter from '../src/utils/rate-limiter';

const UUID = '123e4567-e89b-12d3-a456-426614174000';

async function buildFallbackService(responseText: string) {
  jest.doMock('ai', () => ({
    generateText: jest.fn().mockResolvedValue({ text: responseText }),
  }));

  const LlmService = (await import('../src/llm-service')).default;

  const llmModelFactory: LlmModelFactoryI = {
    create: () => ({}) as LanguageModel,
    getProvider: () => 'ollama',
    getModelProvider: () => 'ollama',
    isFallbackMode: () => true,
  };

  const rateLimiter = new RateLimiter();
  rateLimiter.executeWithRateLimiting = async <T>(
    _provider: string,
    op: () => Promise<T>,
  ): Promise<T> => op();

  return new LlmService(llmModelFactory, rateLimiter, true, undefined);
}

describe('LlmService fallback (ollama) parsing', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test('accepts a structured new-category JSON response (issue #383)', async () => {
    const svc = await buildFallbackService(
      '{"type":"new","newCategory":{"name":"Bank Transaction","groupName":"Bank","groupIsNew":true}}',
    );

    await expect(svc.ask('prompt')).resolves.toEqual({
      type: 'new',
      newCategory: { name: 'Bank Transaction', groupName: 'Bank', groupIsNew: true },
    });
  });

  test('accepts a JSON response with newlines (not corrupted by quote stripping)', async () => {
    const svc = await buildFallbackService(
      '```json\n{\n  "type": "existing",\n  "categoryId": "abc123"\n}\n```',
    );

    await expect(svc.ask('prompt')).resolves.toEqual({
      type: 'existing',
      categoryId: 'abc123',
    });
  });

  test('still accepts a bare UUID response', async () => {
    const svc = await buildFallbackService(UUID);

    await expect(svc.ask('prompt')).resolves.toEqual({
      type: 'existing',
      categoryId: UUID,
    });
  });

  test('throws a clear error when nothing parseable is returned', async () => {
    const svc = await buildFallbackService('I could not determine a category for this.');

    await expect(svc.ask('prompt')).rejects.toThrow('Could not find category in LLM response');
  });
});
