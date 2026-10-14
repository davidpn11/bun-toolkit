import type { BoxStyle } from "../theme/types.ts";

export type Box = {
  h: string;
  v: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  topJoin: string;
  bottomJoin: string;
  leftJoin: string;
  rightJoin: string;
  cross: string;
};

export const BOXES: Record<BoxStyle, Box> = {
  rounded: {
    h: "─",
    v: "│",
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    topJoin: "┬",
    bottomJoin: "┴",
    leftJoin: "├",
    rightJoin: "┤",
    cross: "┼",
  },
  square: {
    h: "─",
    v: "│",
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    topJoin: "┬",
    bottomJoin: "┴",
    leftJoin: "├",
    rightJoin: "┤",
    cross: "┼",
  },
  ascii: {
    h: "-",
    v: "|",
    topLeft: "+",
    topRight: "+",
    bottomLeft: "+",
    bottomRight: "+",
    topJoin: "+",
    bottomJoin: "+",
    leftJoin: "+",
    rightJoin: "+",
    cross: "+",
  },
};
