import { describe, it, expect } from 'vitest';
import { processProject } from '../src/lib/core';
import path from 'path';

describe('preptex core', () => {
  it('imports and runs with minimal options', async () => {
    const entry = path.resolve(__dirname, '../examples/basic/main.tex');
    const artifact = await processProject(entry, { suppressComments: false });
    expect(artifact).toBeDefined();
    expect(['text', 'json']).toContain(artifact.kind);
  });
});
