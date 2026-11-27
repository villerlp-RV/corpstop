import { Search, X } from "lucide-react";

// A row of filters: a search box, selects, a count of what's shown and Clear.
export function FilterBar({ label, query, onQuery, placeholder, selects, shown, total, noun, onClear, active }) {
  return (
    <div className="filter-bar" role="search" aria-label={label}>
      <label className="filter-search">
        <Search size={15} aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </label>
      {selects.map((s) => (
        <select key={s.id} id={s.id} aria-label={s.label} value={s.value} onChange={(e) => s.onChange(e.target.value)} className={s.value ? "is-set" : undefined}>
          {s.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ))}
      <span className="filter-count muted" aria-live="polite">
        {active ? `${shown} of ${total} ${noun}` : `${total} ${noun}`}
      </span>
      {active && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={onClear}>
          <X size={14} /> Clear
        </button>
      )}
    </div>
  );
}
