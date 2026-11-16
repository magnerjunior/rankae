export function preferredTieMethod(fullWaiting: number, preferBothOut: boolean, fallback: "odd_even" | "manual" | "penalties") {
  return preferBothOut && fullWaiting >= 2 ? "both_out" : fallback;
}
