import { AutosaveIndicator, ResumeBanner, StatusBadge } from '@skillforge/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('shared evidence UI states', () => {
  it('renders status with text instead of color only', () => {
    render(<StatusBadge status="UNKNOWN" />);
    expect(screen.getByText('Нет данных')).toBeInTheDocument();
  });

  it('describes a calm return without guilt copy', () => {
    render(
      <ResumeBanner
        topic="Замыкания"
        step="лексическое окружение"
        action={<button>Восстановить контекст</button>}
      />,
    );
    expect(screen.getByText('С возвращением')).toBeInTheDocument();
    expect(screen.getByText(/15–20 минут/)).toBeInTheDocument();
    expect(screen.queryByText(/потерял|пропустил|серия/i)).not.toBeInTheDocument();
  });

  it('announces autosave errors honestly', () => {
    render(<AutosaveIndicator state="error" />);
    expect(screen.getByRole('status')).toHaveTextContent('Ошибка сохранения');
  });
});
