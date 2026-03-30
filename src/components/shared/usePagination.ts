"use client";

import { useMemo, useState, useCallback } from "react";
import { PAGE_SIZE } from "./Pagination";

interface UsePaginationOptions {
  pageSize?: number;
  initialPage?: number;
}

interface UsePaginationResult<T> {
  page: number;
  pageSize: number;
  totalItems: number;
  pageItems: T[];
  setPage: (page: number) => void;
  resetPage: () => void;
}

/**
 * Client-side pagination hook: accepts the full array and returns
 * the slice for the current page plus pagination metadata.
 */
export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {},
): UsePaginationResult<T> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const [page, setPageRaw] = useState(options.initialPage ?? 1);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Clamp page if items shrink (e.g. after filtering)
  const safePage = Math.min(page, totalPages);

  const pageItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize],
  );

  const setPage = useCallback(
    (p: number) => setPageRaw(Math.max(1, Math.min(p, totalPages))),
    [totalPages],
  );

  const resetPage = useCallback(() => setPageRaw(1), []);

  return {
    page: safePage,
    pageSize,
    totalItems,
    pageItems,
    setPage,
    resetPage,
  };
}
