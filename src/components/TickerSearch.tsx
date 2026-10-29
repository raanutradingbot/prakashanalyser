"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { normalizeSymbol } from "@/lib/symbols";
import type { SymbolHit } from "@/lib/types";

export function TickerSearch({ compact = false, autoFocus = false }: { compact?: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SymbolHit[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      fetch(`/api/symbols?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data: { results: SymbolHit[] }) => {
          setSuggestions(data.results ?? []);
          setActiveIndex(-1);
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function go(symbol: string) {
    setOpen(false);
    setError(null);
    setValue(symbol);
    startTransition(() => router.push(`/analyze/${symbol}`));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (open && activeIndex >= 0 && suggestions[activeIndex]) {
      go(suggestions[activeIndex].symbol);
      return;
    }
    const symbol = normalizeSymbol(value);
    if (!symbol) {
      setError(
        value.trim()
          ? `"${value.trim()}" isn't a US ticker. Try searching by company name.`
          : "Enter a ticker or company name.",
      );
      return;
    }
    go(symbol);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const id = compact ? "ticker-compact" : "ticker-main";
  const listId = `${id}-listbox`;
  return (
    <div className={compact ? "" : "search large"} ref={rootRef}>
      <form onSubmit={submit} role="search">
        <label htmlFor={id} className="sr-only">
          US stock or ETF ticker or company name
        </label>
        <input
          id={id}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={compact ? "Ticker or company" : "Enter a ticker or company name, like AAPL or Apple"}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <button type="submit" disabled={pending}>
          {pending ? "Analyzing…" : "Analyze"}
        </button>
        <Link href="/movers" className="movers-btn">
          Movers
        </Link>
      </form>
      {open && suggestions.length > 0 && (
        <ul className="suggestions" id={listId} role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.symbol}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={i === activeIndex ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                go(s.symbol);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <span className="sym">{s.symbol}</span>
              <span className="nm">{s.name}</span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
