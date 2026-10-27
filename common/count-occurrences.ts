/**
 * Count non-overlapping occurrences of a substring.
 *
 * Batch progress used to call `text.match(/Successful/g)`, which allocates an
 * array of every match. upscayl-bin emits one line per image, so for a large
 * batch this runs thousands of times and the allocations add up. A plain
 * indexOf loop avoids that garbage entirely.
 */
export default function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(needle, index + needle.length);
  }
  return count;
}
