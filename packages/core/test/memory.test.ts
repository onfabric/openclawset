import { describe, expect, test } from 'bun:test';
import { removeSection, stripMarkers, wrapSection } from '../src/memory.js';

describe('wrapSection', () => {
  test('wraps content in markers', () => {
    const result = wrapSection('fitness', '## Rules\n- Do stuff\n');
    expect(result).toContain('<!-- clawtique:fitness:start -->');
    expect(result).toContain('<!-- clawtique:fitness:end -->');
    expect(result).toContain('## Rules');
  });
});

describe('stripMarkers', () => {
  test('removes markers but keeps content', () => {
    const input = [
      '# HEARTBEAT.md',
      '',
      '<!-- clawtique:fitness:start -->',
      '## fitness',
      '- nudge if late',
      '<!-- clawtique:fitness:end -->',
    ].join('\n');

    const result = stripMarkers('fitness', input);
    expect(result).not.toContain('clawtique:fitness');
    expect(result).toContain('## fitness');
    expect(result).toContain('- nudge if late');
  });
});

describe('removeSection', () => {
  test('removes markers AND content', () => {
    const input = [
      '# HEARTBEAT.md',
      '',
      '## Check-in',
      '- check stuff',
      '',
      '<!-- clawtique:fitness:start -->',
      '',
      '## fitness',
      '- nudge if late',
      '',
      '<!-- clawtique:fitness:end -->',
    ].join('\n');

    const result = removeSection('fitness', input);
    expect(result).not.toContain('clawtique:fitness');
    expect(result).not.toContain('nudge if late');
    expect(result).toContain('# HEARTBEAT.md');
    expect(result).toContain('## Check-in');
    expect(result).toContain('- check stuff');
  });

  test('handles multiple sections from different dresses', () => {
    const input = [
      '# HEARTBEAT.md',
      '',
      '<!-- clawtique:fitness:start -->',
      '- fitness rule',
      '<!-- clawtique:fitness:end -->',
      '',
      '<!-- clawtique:reading:start -->',
      '- reading rule',
      '<!-- clawtique:reading:end -->',
    ].join('\n');

    const result = removeSection('fitness', input);
    expect(result).not.toContain('fitness rule');
    expect(result).toContain('<!-- clawtique:reading:start -->');
    expect(result).toContain('- reading rule');
  });

  test('collapses excessive blank lines', () => {
    const input = [
      '# HEARTBEAT.md',
      '',
      '',
      '<!-- clawtique:fitness:start -->',
      '- rule',
      '<!-- clawtique:fitness:end -->',
      '',
      '',
      '## Other',
    ].join('\n');

    const result = removeSection('fitness', input);
    expect(result).not.toContain('\n\n\n');
  });
});
