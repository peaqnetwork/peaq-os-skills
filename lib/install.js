'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// ── Agent definitions ────────────────────────────────────────────────────────

const AGENTS = {
  'claude-code': {
    label: 'Claude Code',
    skillsDir: path.join(os.homedir(), '.claude', 'skills'),
    adapter: 'claude-code',
    detect: () => fs.existsSync(path.join(os.homedir(), '.claude')),
  },
  'cursor': {
    label: 'Cursor',
    skillsDir: path.join(os.homedir(), '.cursor', 'skills'),
    adapter: 'cursor',
    detect: () => fs.existsSync(path.join(os.homedir(), '.cursor')),
  },
  'windsurf': {
    label: 'Windsurf',
    skillsDir: path.join(os.homedir(), '.codeium', 'windsurf', 'skills'),
    adapter: 'windsurf',
    detect: () => fs.existsSync(path.join(os.homedir(), '.codeium')),
  },
};

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

// ── Helpers ──────────────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function detectAgents() {
  return Object.entries(AGENTS)
    .filter(([, cfg]) => cfg.detect())
    .map(([key]) => key);
}

// ── Main install ─────────────────────────────────────────────────────────────

async function install(skillName, agentArg, customDir) {
  // 1. Verify skill exists in package
  const skillSrc = path.join(SKILLS_DIR, skillName);
  if (!fs.existsSync(skillSrc)) {
    const available = fs.readdirSync(SKILLS_DIR).join(', ');
    throw new Error(`Skill "${skillName}" not found. Available skills: ${available}`);
  }

  // 2. Resolve target agent
  let agentKey = agentArg;

  if (!agentKey) {
    const detected = detectAgents();
    if (detected.length === 0) {
      console.log('No supported agents detected. Defaulting to Claude Code.');
      agentKey = 'claude-code';
    } else if (detected.length === 1) {
      agentKey = detected[0];
      console.log(`Detected ${AGENTS[agentKey].label} — installing for ${AGENTS[agentKey].label}.`);
    } else {
      console.log('Multiple agents detected:');
      detected.forEach((key, i) => console.log(`  ${i + 1}. ${AGENTS[key].label}`));
      const answer = await ask('Which agent? (enter number): ');
      const idx = parseInt(answer, 10) - 1;
      if (idx < 0 || idx >= detected.length) throw new Error('Invalid selection.');
      agentKey = detected[idx];
    }
  }

  if (!AGENTS[agentKey]) {
    throw new Error(`Unknown agent "${agentKey}". Supported: ${Object.keys(AGENTS).join(', ')}`);
  }

  const agent = AGENTS[agentKey];

  // 3. Check adapter exists for this agent
  const adapterSrc = path.join(skillSrc, 'adapters', agentKey);
  if (!fs.existsSync(adapterSrc)) {
    throw new Error(
      `No adapter found for "${agentKey}" in skill "${skillName}".\n` +
      `Available adapters: ${fs.readdirSync(path.join(skillSrc, 'adapters')).join(', ')}`
    );
  }

  // 4. Resolve install destination
  const destDir = customDir
    ? path.join(customDir, skillName)
    : path.join(agent.skillsDir, skillName);

  // 5. Warn if already installed
  if (fs.existsSync(destDir)) {
    const answer = await ask(`Skill "${skillName}" is already installed at ${destDir}. Overwrite? (y/N): `);
    if (answer.toLowerCase() !== 'y') {
      console.log('Installation cancelled.');
      return;
    }
    fs.rmSync(destDir, { recursive: true, force: true });
  }

  // 6. Copy skill files
  console.log(`\nInstalling "${skillName}" for ${agent.label}...`);
  copyDir(skillSrc, destDir);
  console.log(`✓ Skill files copied to ${destDir}`);

  // 7. Confirm
  console.log(`
✓ ${skillName} installed for ${agent.label}

To use it, open a ${agent.label} session and run:
  /${skillName}

Full setup guide: ${destDir}/README.md
`);
}

// ── List available skills ────────────────────────────────────────────────────

function listSkills() {
  const skills = fs.readdirSync(SKILLS_DIR).filter((f) =>
    fs.statSync(path.join(SKILLS_DIR, f)).isDirectory()
  );

  if (skills.length === 0) {
    console.log('No skills available.');
    return;
  }

  console.log('\nAvailable skills:\n');
  for (const skill of skills) {
    const manifestPath = path.join(SKILLS_DIR, skill, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      console.log(`  ${skill} — ${manifest.description?.split('.')[0] || ''}`);
    } else {
      console.log(`  ${skill}`);
    }
  }
  console.log('');
}

module.exports = { install, listSkills };
