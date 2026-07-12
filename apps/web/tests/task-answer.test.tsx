import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskAnswer } from '@/features/assessment/task-answer';
import type { AttemptDraft } from '@/features/assessment/use-attempt-autosave';
import type { TaskItem } from '@/shared/api/types';

const item: TaskItem = {
  id: 'item-1',
  position: 0,
  blockIndex: 0,
  purpose: 'retrieval',
  task: {
    stableKey: 'js.values.types.choice-001',
    version: 1,
    topicKey: 'js.values.types',
    topicTitle: 'Примитивы и типы',
    kind: 'SINGLE_CHOICE',
    promptMarkdown: 'Какой тип вернёт typeof null?',
    starterCode: null,
    language: null,
    options: [
      { id: 'object', label: 'object' },
      { id: 'null', label: 'null' },
    ],
    hints: [],
    visibleTests: [],
    runnerHarness: null,
  },
  attempt: null,
};

const draft: AttemptDraft = {
  answerText: '',
  answerCode: '',
  selectedOptions: [],
  selfRating: null,
  confidence: null,
  helpLevel: 'NONE',
  hintsUsed: [],
};

describe('TaskAnswer', () => {
  it('updates a choice answer without revealing correctness', () => {
    const onChange = vi.fn();
    render(
      <TaskAnswer
        item={item}
        draft={draft}
        onChange={onChange}
        onRun={vi.fn()}
        running={false}
        runnerResult={null}
      />,
    );
    fireEvent.click(screen.getByLabelText('object'));
    expect(onChange).toHaveBeenCalledWith({ ...draft, selectedOptions: ['object'] });
    expect(screen.queryByText(/правильн/i)).not.toBeInTheDocument();
  });
});
