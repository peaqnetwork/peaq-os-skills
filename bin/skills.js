#!/usr/bin/env node

'use strict';

const { install, listSkills } = require('../lib/install');

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
@peaqos/skills — Agent skill installer for peaqOS

Usage:
  npx @peaqos/skills add <skill> [options]
  npx @peaqos/skills list

Commands:
  add <skill>   Install a skill to your agent
  list          List all available skills

Options:
  --agent <name>   Target agent: claude-code, cursor, windsurf (auto-detected if omitted)
  --dir <path>     Custom install directory (overrides agent default)
  --help           Show this help message

Examples:
  npx @peaqos/skills add peaqos
  npx @peaqos/skills add peaqos --agent cursor
  npx @peaqos/skills add peaqos --agent claude-code
`);
}

function parseArgs(args) {
  const opts = { skill: null, agent: null, dir: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) {
      opts.agent = args[++i];
    } else if (args[i] === '--dir' && args[i + 1]) {
      opts.dir = args[++i];
    } else if (!args[i].startsWith('--')) {
      opts.skill = args[i];
    }
  }
  return opts;
}

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === 'list') {
  listSkills();
  process.exit(0);
}

if (command === 'add') {
  const opts = parseArgs(args.slice(1));

  if (!opts.skill) {
    console.error('Error: skill name required. Usage: npx @peaqos/skills add <skill>');
    process.exit(1);
  }

  install(opts.skill, opts.agent, opts.dir).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}
