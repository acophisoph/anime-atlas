import type { ChangeEvent } from 'react';

export function SearchBox({ placeholder, value, setValue }: { placeholder: string; value: string; setValue: (v: string) => void }) {
  return <input style={{ width: '100%', padding: 8 }} placeholder={placeholder} value={value} onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)} />;
}
