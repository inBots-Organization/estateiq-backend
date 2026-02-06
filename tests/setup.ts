import 'reflect-metadata';
import { vi } from 'vitest';

// Set up test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.LLM_API_KEY = 'test-api-key';

// Mock console during tests to reduce noise
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Global test utilities
declare global {
  function createMockLLMProvider(): {
    complete: ReturnType<typeof vi.fn>;
    streamComplete: ReturnType<typeof vi.fn>;
    completeWithMetadata: ReturnType<typeof vi.fn>;
  };
  function createMockRepository<T>(): {
    findById: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

(global as any).createMockLLMProvider = () => ({
  complete: vi.fn(),
  streamComplete: vi.fn(),
  completeWithMetadata: vi.fn(),
});

(global as any).createMockRepository = () => ({
  findById: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
});
