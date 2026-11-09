export { main } from './cli.js';

export interface ConvertOptions {
  input: string;
  title?: string;
  outputDir?: string;
}

export async function convertGpToMscz(options: ConvertOptions): Promise<string> {
  // Programmatic API - can be imported
  const { input, title, outputDir } = options;
  // ... implementation would go here
  throw new Error('Use the CLI: gp2mscz <input> [title]');
}