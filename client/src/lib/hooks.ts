import { useEffect, useState } from 'react';
import { fetchChapters, fetchReciters, fetchTranslations, type Chapter, type Reciter, type Translation } from './quranApi';
import { fetchBackgroundLibrary, fetchPreviewData, type PreviewData } from './backendApi';
import type { BackgroundLibrary } from './types';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useAsync<T>(fetcher: () => Promise<T>): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fetcher()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

export function useChapters(): AsyncState<Chapter[]> {
  return useAsync(fetchChapters);
}

export function useReciters(): AsyncState<Reciter[]> {
  return useAsync(fetchReciters);
}

export function useTranslations(): AsyncState<Translation[]> {
  return useAsync(fetchTranslations);
}

export function useBackgroundLibrary(): AsyncState<BackgroundLibrary> {
  return useAsync(fetchBackgroundLibrary);
}

/** Re-fetches whenever chapterId/reciterId/translationId change, for the live preview player. */
export function usePreviewData(chapterId: number, reciterId: number, translationId: number): AsyncState<PreviewData> {
  const [state, setState] = useState<AsyncState<PreviewData>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fetchPreviewData(chapterId, reciterId, translationId)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [chapterId, reciterId, translationId]);

  return state;
}
