/**
 * Simple terminal markdown renderer using chalk.
 *
 * Handles: bold, inline code, code blocks, headers, list items.
 * No heavy deps — just chalk.
 */

import chalk from 'chalk';

/**
 * Render a markdown string for terminal display.
 */
export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    // Code block toggle
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        output.push(chalk.dim('─'.repeat(40)));
      } else {
        output.push(chalk.dim('─'.repeat(40)));
      }
      continue;
    }

    // Inside code block — dim, no further formatting
    if (inCodeBlock) {
      output.push(chalk.cyan(line));
      continue;
    }

    let rendered = line;

    // Headers
    if (rendered.startsWith('### ')) {
      output.push(chalk.bold.yellow(rendered.slice(4)));
      continue;
    }
    if (rendered.startsWith('## ')) {
      output.push(chalk.bold.yellow(rendered.slice(3)));
      continue;
    }
    if (rendered.startsWith('# ')) {
      output.push(chalk.bold.yellow(rendered.slice(2)));
      continue;
    }

    // List items
    if (/^\s*[-*]\s/.test(rendered)) {
      const match = rendered.match(/^(\s*)[-*]\s(.*)$/);
      if (match) {
        const indent = match[1];
        const content = match[2];
        rendered = `${indent}${chalk.green('•')} ${formatInline(content)}`;
        output.push(rendered);
        continue;
      }
    }

    // Regular line — apply inline formatting
    output.push(formatInline(rendered));
  }

  return output.join('\n');
}

/**
 * Apply inline formatting: bold (**text**) and inline code (`text`).
 */
function formatInline(text: string): string {
  // Inline code: `text`
  let result = text.replace(/`([^`]+)`/g, (_match, code: string) => chalk.cyan(code));

  // Bold: **text**
  result = result.replace(/\*\*([^*]+)\*\*/g, (_match, bold: string) => chalk.bold(bold));

  return result;
}
