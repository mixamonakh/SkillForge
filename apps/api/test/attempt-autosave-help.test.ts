import { describe, expect, it } from 'vitest';

import { mergeAttemptHelp } from '../src/modules/assessment/attempt-autosave.service.js';

describe('attempt help audit merge', () => {
  it('does not let a later autosave erase a persisted AI nudge', () => {
    expect(
      mergeAttemptHelp(
        { helpLevel: 'NUDGE', hintsUsed: ['Сначала проверь один маленький шаг.'] },
        { helpLevel: 'NONE', hintsUsed: [] },
      ),
    ).toEqual({
      helpLevel: 'NUDGE',
      hintsUsed: ['Сначала проверь один маленький шаг.'],
    });
  });

  it('keeps all actually revealed help and the strongest help level', () => {
    expect(
      mergeAttemptHelp(
        { helpLevel: 'NUDGE', hintsUsed: ['AI nudge'] },
        { helpLevel: 'HINT', hintsUsed: ['Built-in hint'] },
      ),
    ).toEqual({ helpLevel: 'HINT', hintsUsed: ['AI nudge', 'Built-in hint'] });
  });
});
