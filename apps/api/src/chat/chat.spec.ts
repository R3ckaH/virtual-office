import { previewOf, segmentMessage } from '@vo/shared';
import { canAnnounce, canCreateChannels } from './chat.service';

describe('segmentMessage', () => {
  it('finds links, mentions, code, bold and italic, and leaves the rest as text', () => {
    const s = segmentMessage('Hi @Ana Cruz see https://example.com/a?b=1. Run `pnpm test` **now** _please_ <b>x</b>', [{ userId: 'u1', fullName: 'Ana Cruz' }]);
    expect(s).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'mention', text: '@Ana Cruz', userId: 'u1' },
      { type: 'text', text: ' see ' },
      { type: 'link', text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { type: 'text', text: '. Run ' },
      { type: 'code', text: 'pnpm test' },
      { type: 'text', text: ' ' },
      { type: 'bold', text: 'now' },
      { type: 'text', text: ' ' },
      { type: 'italic', text: 'please' },
      { type: 'text', text: ' <b>x</b>' },
    ]);
  });

  it('only highlights people who were actually mentioned, and not snake_case words', () => {
    expect(segmentMessage('@Bob and my_var_name')).toEqual([{ type: 'text', text: '@Bob and my_var_name' }]);
  });

  it('makes short previews', () => {
    expect(previewOf('  **Hello**\n\nworld ')).toBe('Hello world');
    expect(previewOf('', 2)).toBe('Shared 2 files');
    expect(previewOf('x'.repeat(100), 0, 10)).toBe('xxxxxxxxx…');
  });
});

describe('chat permissions', () => {
  it('Admins, HR and leaders announce; Admins, HR and Managers create channels', () => {
    expect(canAnnounce({ role: 'EMPLOYEE', attendanceTracked: true })).toBe(false);
    expect(canAnnounce({ role: 'MANAGER', attendanceTracked: true })).toBe(false);
    expect(canAnnounce({ role: 'MANAGER', attendanceTracked: false })).toBe(true);
    expect(canAnnounce({ role: 'HR', attendanceTracked: true })).toBe(true);
    expect(canCreateChannels({ role: 'MANAGER' })).toBe(true);
    expect(canCreateChannels({ role: 'EMPLOYEE' })).toBe(false);
  });
});
