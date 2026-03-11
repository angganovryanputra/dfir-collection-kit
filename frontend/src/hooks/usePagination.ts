import { useState, useMemo, useEffect } from "react";

interface UsePaginationOptions {
  defaultItemsPerPage?: number;
}

export function usePagination<T>(
  items: T[],
  options: UsePaginationOptions = {}
) {
  const { defaultItemsPerPage = 10 } = options;
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(defaultItemsPerPage);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  // Reset to page 1 if current page exceeds total pages (must be in useEffect, not render)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return items.slice(startIndex, endIndex);
  }, [items, currentPage, itemsPerPage]);

  const goToPage = (page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(validPage);
  };

  const setPerPage = (perPage: number) => {
    setItemsPerPage(perPage);
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  return {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    goToPage,
    setPerPage,
  };
}
