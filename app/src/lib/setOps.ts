export function intersectSorted(arrays: number[][]): number[] {
  if (!arrays.length) return [];
  return arrays.reduce((acc, cur) => {
    let i = 0;
    let j = 0;
    const out: number[] = [];
    while (i < acc.length && j < cur.length) {
      if (acc[i] === cur[j]) { out.push(acc[i]); i++; j++; }
      else if (acc[i] < cur[j]) i++;
      else j++;
    }
    return out;
  });
}
