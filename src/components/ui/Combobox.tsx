'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Search, Plus } from 'lucide-react';

export interface ComboOption {
  value: string;
  label: string;
}

interface Props {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Nombre en español para el label de "Crear nuevo X": ej "proveedor" */
  createLabel?: string;
  onCreateNew?: (searchTerm: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Buscar…',
  createLabel,
  onCreateNew,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const hasExactMatch = options.some(
    o => o.label.toLowerCase() === search.trim().toLowerCase()
  );

  // Cierra al hacer click fuera
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function openDropdown() {
    if (disabled) return;
    setOpen(true);
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function selectOption(opt: ComboOption) {
    onChange(opt.value);
    setOpen(false);
    setSearch('');
  }

  function clearValue(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
    if (e.key === 'Enter' && filtered.length > 0) {
      selectOption(filtered[0]);
    }
  }

  function handleCreateNew() {
    onCreateNew?.(search.trim());
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      {/* Trigger cerrado */}
      {!open ? (
        <div
          onClick={openDropdown}
          className={`flex w-full cursor-pointer items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm transition-colors ${
            disabled
              ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
            {selected?.label ?? placeholder}
          </span>
          <div className="ml-2 flex flex-shrink-0 items-center gap-1">
            {value && !disabled && (
              <button
                type="button"
                onClick={clearValue}
                className="rounded p-0.5 text-gray-300 transition-colors hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </div>
        </div>
      ) : (
        /* Input de búsqueda */
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full rounded-lg border border-green-400 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-2 ring-green-100"
          />
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && !createLabel && (
              <p className="px-3 py-4 text-center text-sm text-gray-400">Sin resultados</p>
            )}

            {filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectOption(opt)}
                className="flex w-full items-center px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-green-50 hover:text-green-800"
              >
                {opt.label}
              </button>
            ))}

            {/* Opción "Crear nuevo" */}
            {createLabel && onCreateNew && search.trim().length >= 2 && !hasExactMatch && (
              <button
                type="button"
                onClick={handleCreateNew}
                className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2.5 text-sm font-medium text-green-600 transition-colors hover:bg-green-50"
              >
                <Plus className="h-4 w-4 flex-shrink-0" />
                <span>
                  Crear nuevo {createLabel}{' '}
                  <span className="font-semibold">«{search.trim()}»</span>
                </span>
              </button>
            )}

            {/* Sin resultados pero con create */}
            {createLabel && filtered.length === 0 && search.trim().length < 2 && (
              <p className="px-3 py-3 text-center text-xs text-gray-400">
                Escribí para buscar o crear nuevo
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
