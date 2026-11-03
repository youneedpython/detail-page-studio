import { blocked } from './lib.mjs';

function fields(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) blocked('Missing current Task section');
  const end = text.indexOf('\n## ', start + heading.length);
  return { start, end: end < 0 ? text.length : end, text: text.slice(start, end < 0 ? text.length : end) };
}

export function syncAgents(agents, tasks) {
  const source = fields(tasks, '## 3. Current Task');
  const task = source.text.match(/^TASK-\d{3}[^\r\n]*/m)?.[0];
  const status = source.text.match(/Status:\s*```text\s*([A-Z_]+)\s*```/)?.[1];
  if (!task || !['READY', 'BLOCKED', 'IN_PROGRESS', 'REVIEW', 'DONE'].includes(status)) blocked('Invalid TASKS current status');
  const section = fields(agents, '## 3. ');
  let count = 0;
  const updated = section.text.replace(/(Current Task:\s*```text[\t ]*\r?\n)[^\r\n`]+(?=\r?\n```)/, (_, prefix) => { count++; return prefix + task; })
    .replace(/(Status:\s*```text\s*)[A-Z_]+(?=\s*```)/, (_, prefix) => { count++; return prefix + status; });
  if (count !== 2) blocked('Missing AGENTS current status fields');
  return agents.slice(0, section.start) + updated + agents.slice(section.end);
}

export function validateAgentsSections(contract) {
  if (!Object.hasOwn(contract, 'agents_sections')) return;
  const sections = contract.agents_sections;
  if (!Array.isArray(sections) || sections.some(x => typeof x !== 'string' || !/^[1-9]\d*(?:\.\d+)*$/.test(x)) || new Set(sections).size !== sections.length) blocked('Invalid Contract agents_sections');
}

export function guardAgents(before, after, tasks, contract = {}) {
  validateAgentsSections(contract);
  if (after === before) return;
  const normalize = text => text.replace(/\r\n/g, '\n');
  const original = normalize(before), candidate = normalize(after);
  const headings = text => [...text.matchAll(/^## [^\n]+$/gm)].map(match => match[0]);
  if (JSON.stringify(headings(original)) !== JSON.stringify(headings(candidate))) blocked('AGENTS modification exceeds approval: section headings changed or deleted');
  const mask = text => text.replace(/(^## ([1-9]\d*(?:\.\d+)*)\. [^\n]+\n)([\s\S]*?)(?=^## |$(?![\s\S]))/gm,
    (whole, heading, number) => contract.agents_sections?.includes(number) ? heading : whole);
  for (const number of contract.agents_sections ?? []) {
    if (!headings(original).some(heading => heading.startsWith(`## ${number}. `))) blocked('AGENTS approved section missing');
  }
  if (mask(candidate) !== mask(original) && mask(candidate) !== mask(normalize(syncAgents(before, tasks)))) blocked('AGENTS modification exceeds Current Task / Status synchronization and approved sections');
}
