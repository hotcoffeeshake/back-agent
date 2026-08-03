import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('agentteams/skills');
const directories = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());
assert.ok(directories.length > 0, '未找到 Skill');

for (const entry of directories) {
  const skillFile = path.join(root, entry.name, 'SKILL.md');
  const uiFile = path.join(root, entry.name, 'agents', 'openai.yaml');
  assert.ok(fs.existsSync(skillFile), `${entry.name} 缺少 SKILL.md`);
  assert.ok(fs.existsSync(uiFile), `${entry.name} 缺少 agents/openai.yaml`);
  const text = fs.readFileSync(skillFile, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, `${entry.name} frontmatter 无效`);
  const keys = [...match[1].matchAll(/^([a-z_]+):/gm)].map((item) => item[1]);
  assert.deepEqual(keys.sort(), ['description', 'name'], `${entry.name} frontmatter 只能包含 name 和 description`);
  assert.match(match[1], new RegExp(`^name: ${entry.name}$`, 'm'), `${entry.name} 名称与目录不一致`);
  assert.match(match[1], /^description: .{20,}$/m, `${entry.name} description 过短`);
  const ui = fs.readFileSync(uiFile, 'utf8');
  assert.ok(ui.includes(`$${entry.name}`), `${entry.name} default_prompt 未显式引用 Skill`);
}

console.log(`AgentTeams Skill validation OK (${directories.length} skills)`);
