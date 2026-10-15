import { ButtonLink } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-md text-ink-muted">
        The page you are looking for does not exist or is no longer available.
      </p>
      <div className="mt-6 flex gap-3">
        <ButtonLink href="/">Go home</ButtonLink>
        <ButtonLink href="/search" variant="outline">
          Browse homes
        </ButtonLink>
      </div>
    </main>
  );
}
