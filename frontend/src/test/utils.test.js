import { describe, it, expect } from 'vitest';
import { markdownToHtml } from '../utils/markdown';
import { liveSla } from '../utils/sla';
import { fileProblem, passwordProblem } from '../validators';
import { dur } from '../utils/format';

describe('markdown renderer', () => {
  it('escapes HTML so article content cannot inject markup', () => {
    const html = markdownToHtml('<img src=x onerror=alert(1)>\n**bold** `code`');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders headings and lists', () => {
    expect(markdownToHtml('## Steps\n1. One\n2. Two\n- a')).toBe('<h2>Steps</h2><ol><li>One</li><li>Two</li></ol><ul><li>a</li></ul>');
  });
});

describe('live SLA label', () => {
  const base = { status: 'In Progress', firstResponseAt: new Date().toISOString(), sla: { responseDueAt: new Date(Date.now() + 1e6).toISOString(), pausedSeconds: 0, policyResolutionMinutes: 1440 } };
  it('reports overdue tickets as breached', () => {
    const s = liveSla({ ...base, sla: { ...base.sla, resolutionDueAt: new Date(Date.now() - 2 * 3600e3).toISOString() } });
    expect(s.state).toBe('breached');
    expect(s.label).toMatch(/^Overdue 2h/);
  });
  it('shows paused tickets as paused', () => {
    expect(liveSla({ ...base, sla: { ...base.sla, pausedAt: new Date().toISOString() } }).state).toBe('paused');
  });
});

describe('client validators', () => {
  it('blocks executables and oversize files', () => {
    const limits = { maxBytes: 10, blocked: ['exe'], allowed: ['txt'] };
    expect(fileProblem({ name: 'a.exe', size: 1 }, limits)).toMatch(/not allowed/);
    expect(fileProblem({ name: 'a.txt', size: 11 }, limits)).toMatch(/larger/);
    expect(fileProblem({ name: 'a.txt', size: 5 }, limits)).toBeNull();
  });
  it('enforces the password policy', () => {
    expect(passwordProblem('short1')).toBeTruthy();
    expect(passwordProblem('longenoughbutnodigits')).toBeTruthy();
    expect(passwordProblem('good-password-2026')).toBeNull();
  });
  it('formats durations like the original', () => {
    expect(dur(90)).toBe('1h 30m');
    expect(dur(1500)).toBe('1d 1h');
  });
});
