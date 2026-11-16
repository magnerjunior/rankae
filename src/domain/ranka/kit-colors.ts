export const kitColors = {
  yellow: { label: "Amarelo", background: "#edbd00", text: "#211900" },
  red: { label: "Vermelho", background: "#a92235", text: "#fff" },
  blue: { label: "Azul", background: "#0739d5", text: "#fff" },
  green: { label: "Verde", background: "#176845", text: "#fff" },
  orange: { label: "Laranja", background: "#f29432", text: "#261400" },
  purple: { label: "Roxo", background: "#6736ab", text: "#fff" },
  white: { label: "Branco", background: "#eef3ff", text: "#101a35" },
  black: { label: "Preto", background: "#222b42", text: "#fff" },
  shirt: { label: "Com camisa", background: "#0739d5", text: "#fff" },
  shirtless: { label: "Sem camisa", background: "#e7bd99", text: "#282018" },
} as const;

export type KitColor = keyof typeof kitColors;

export function isKitColor(value: unknown): value is KitColor {
  return typeof value === "string" && Object.hasOwn(kitColors, value);
}

export function kitStyle(color: KitColor) {
  return { backgroundColor: kitColors[color].background, color: kitColors[color].text };
}
