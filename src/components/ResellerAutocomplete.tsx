'use client';

import { useState, useEffect, useRef } from 'react';

interface Reseller {
  id: string;
  reseller: string;
  parentReseller: string | null;
}

interface ResellerAutocompleteProps {
  onResellerSelect: (reseller: string, parentReseller: string | null) => void;
  value: string;
  onChange: (value: string) => void;
}

export default function ResellerAutocomplete({ 
  onResellerSelect, 
  value, 
  onChange 
}: ResellerAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Reseller[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (value.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      try {
        const response = await fetch(`/api/resellers?search=${encodeURIComponent(value)}`);
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
          setSelectedIndex(-1);
        }
      } catch (error) {
        console.error('Error fetching resellers:', error);
      }
    };

    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleSuggestionClick = (reseller: Reseller) => {
    onChange(reseller.reseller);
    onResellerSelect(reseller.reseller, reseller.parentReseller);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (_e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

    switch (_e.key) {
      case 'ArrowDown':
        _e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        _e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        _e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSuggestionClick(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Delay hiding suggestions to allow clicking on them
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(document.activeElement)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    }, 150);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={() => value.length >= 2 && suggestions.length > 0 && setShowSuggestions(true)}
        placeholder="Enter reseller name"
        id="reseller"
        className="a-input"
        required
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-10 w-full mt-1 bg-white border border-[#ebe8e3] rounded-[10px] shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((reseller, index) => (
            <div
              key={reseller.id}
              className={`px-4 py-3 cursor-pointer hover:bg-[#f6f5f2] ${
                index === selectedIndex ? 'bg-[#fdf6f0]' : ''
              }`}
              onClick={() => handleSuggestionClick(reseller)}
            >
              <div className="font-medium text-gray-900">{reseller.reseller}</div>
              {reseller.parentReseller && (
                <div className="text-sm text-gray-500">Parent: {reseller.parentReseller}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
