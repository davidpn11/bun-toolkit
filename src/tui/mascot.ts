import { ACCENT } from "../output/palette.ts";

/**
 * The btk mascot: Bun in a hardhat. One character per pixel, `.` is transparent.
 * `<Mascot>` draws it in the terminal and `scripts/mascot.ts` turns it into the SVGs in docs/assets.
 */
export const MASCOT_PALETTE: Record<string, string> = {
  o: "#1B0F0A", // outline, eyes
  b: "#FBF0DF", // bun
  s: "#F2D7BC", // bun shade
  w: "#FFFFFF", // eye sparkle
  m: "#3B0A12", // mouth
  t: "#FF6164", // tongue
  c: "#FF8FC4", // cheeks
  y: "#FFC53D", // hardhat
  r: "#E9A620", // hardhat ridges
  k: "#F2A91F", // brim
  K: "#C98410", // brim shade
  p: ACCENT, // badge
  q: "#FF7ABF", // badge highlight
};

export const MASCOT_SPRITE = [
  "............oooooooooo............",
  "..........ooyyyyppyyyyoo..........",
  "........ooyryyypqppyyyryoo........",
  ".......oyyyryyyppppyyyryyyo.......",
  ".......oyyyryyyyppyyyyryyyo.......",
  "......oyyyyryyyyyyyyyyryyyyo......",
  "......oyyyyryyyyyyyyyyryyyyo......",
  ".....ooyyyyryyyyyyyyyyryyyyoo.....",
  "ooooookkkkkkkkkkkkkkkkkkkkkkoooooo",
  "oKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKo",
  ".oooooooooooooooooooooooooooooooo.",
  "..obbbbbbbbbbbbbbbbbbbbbbbbbbbbo..",
  "..obbbbbbbbbbbbbbbbbbbbbbbbbbbbo..",
  ".obbbbbbbbbwobbbbbbbbwobbbbbbbbbo.",
  ".obbbbbbbbboobbbbbbbboobbbbbbbbbo.",
  ".obbbbbbbbboobbbbbbbboobbbbbbbbbo.",
  ".obbbbbbccbbbbbmmmmbbbbbccbbbbbbo.",
  ".obbbbbbbbbbbbbmttmbbbbbbbbbbbbbo.",
  "..obbbbbbbbbbbbbmmbbbbbbbbbbbbbo..",
  "..osssssssssssssssssssssssssssso..",
  "...oossssssssssssssssssssssssoo...",
  ".....ooossssssssssssssssssooo.....",
  "........oooooooooooooooooo........",
];

/** Color of each pixel, `null` where transparent. */
export function mascotPixels(sprite: string[] = MASCOT_SPRITE): (string | null)[][] {
  return sprite.map((row) => [...row].map((ch) => (ch === "." ? null : (MASCOT_PALETTE[ch] ?? null))));
}
