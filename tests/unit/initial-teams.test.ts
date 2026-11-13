import { expect, it } from "vitest";
import { validInitialSelection } from "@/domain/initial-teams";
it("requires two complete teams without duplicate players", () => {
 expect(validInitialSelection(["a","b","c","d"],2)).toBe(true);
 expect(validInitialSelection(["a","b","a","d"],2)).toBe(false);
 expect(validInitialSelection(["a","b","c"],2)).toBe(false);
 expect(validInitialSelection(["a","b","c",""],2)).toBe(false);
});
