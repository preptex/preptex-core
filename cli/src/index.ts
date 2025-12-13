import { parseCommand, printGlobalHelp } from './args.js';
import { handleTransform } from './commands/transform-cmd.js';

export async function runPreptexCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseCommand(argv);
  if (!parsed) {
    printGlobalHelp();
    return;
  }

  const { command, rest } = parsed;
  if (command === 'transform') {
    await handleTransform(rest);
    return;
  }

  if (command === 'ast') {
    throw new Error('AST command not implemented yet');
  }
}

runPreptexCli().catch((err) => {
  process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
