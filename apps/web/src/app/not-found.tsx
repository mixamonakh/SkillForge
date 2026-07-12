import { EmptyState } from '@skillforge/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <EmptyState
      title="Страница не найдена"
      description="Проверь адрес или вернись к ближайшему полезному шагу."
      action={
        <Link className="sf-button sf-button--primary" href="/">
          На Dashboard
        </Link>
      }
    />
  );
}
