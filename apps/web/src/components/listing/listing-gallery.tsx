'use client';

import * as React from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = { images: string[]; alt: string };

/** Keyboard- and swipe-friendly gallery. Only the visible image is eager; the rest load on demand. */
export function ListingGallery({ images, alt }: Props) {
  const [index, setIndex] = React.useState(0);
  const touchStart = React.useRef<number | null>(null);
  const count = images.length;

  const go = React.useCallback(
    (delta: number) => setIndex((i) => (count === 0 ? 0 : (i + delta + count) % count)),
    [count],
  );

  if (count === 0) {
    return (
      <div
        className="flex aspect-[16/10] items-center justify-center rounded-xl bg-surface-sunken text-ink-subtle"
        role="img"
        aria-label="No photos available"
      >
        <ImageOff className="h-10 w-10" aria-hidden />
      </div>
    );
  }

  return (
    <section aria-roledescription="carousel" aria-label="Property photos" className="space-y-3">
      <div
        tabIndex={0}
        className="relative aspect-[16/10] overflow-hidden rounded-xl bg-surface-sunken focus-visible:outline-offset-2"
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') go(-1);
          if (e.key === 'ArrowRight') go(1);
        }}
        onTouchStart={(e) => {
          touchStart.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchStart.current === null) return;
          const dx = e.changedTouches[0].clientX - touchStart.current;
          touchStart.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
        aria-label={`Photo ${index + 1} of ${count}. Use the left and right arrow keys to browse.`}
      >
        <Image
          key={images[index]}
          src={images[index]}
          alt={count > 1 ? `${alt} (photo ${index + 1} of ${count})` : alt}
          fill
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover"
          priority={index === 0}
        />
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-surface/90 shadow-card hover:bg-surface"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-surface/90 shadow-card hover:bg-surface"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span
              className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-3 py-1 text-xs font-medium text-white"
              aria-hidden
            >
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>

      {count > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Photo thumbnails">
          {images.map((src, i) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  'relative block h-16 w-24 cursor-pointer overflow-hidden rounded-lg border-2',
                  i === index ? 'border-brand-600' : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                <Image src={src} alt="" fill sizes="96px" className="object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
