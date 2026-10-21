'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './ChartFilters.module.css';

export type ChartFilterOption = { value: string; text: string; href: string };

export type ChartFilter = { label: string; value: string; options: readonly ChartFilterOption[] };

type ChartFiltersProps = { filters: readonly ChartFilter[] };

function ChartFilterSelect({ filter }: { filter: ChartFilter }) {
  const router = useRouter();
  const [value, setValue] = useState(filter.value);
  const selectedText = filter.options.find((option) => option.value === value)?.text;

  function choose(nextValue: string) {
    const option = filter.options.find((candidate) => candidate.value === nextValue);
    if (option) {
      setValue(nextValue);
      router.push(option.href, { scroll: false });
    }
  }

  return (
    <span className={styles.field}>
      <span className={styles.text} aria-hidden="true">
        {selectedText}
      </span>
      <select
        className={styles.select}
        aria-label={filter.label}
        value={value}
        onChange={(event) => choose(event.target.value)}
      >
        {filter.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </select>
    </span>
  );
}

export function ChartFilters({ filters }: ChartFiltersProps) {
  return (
    <div className={styles.filters}>
      {filters.map((filter) => (
        <ChartFilterSelect key={`${filter.label}:${filter.value}`} filter={filter} />
      ))}
    </div>
  );
}
