import { builders } from "prettier/doc";

export const textParser = "spellcheck-text";
export const languages = [
  {
    name: "Plain text",
    parsers: [textParser],
    extensions: [".txt", ".text"],
    vscodeLanguageIds: ["plaintext"],
  },
];
export const parsers = {
  [textParser]: {
    astFormat: textParser,
    parse: (text) => ({ text }),
    locStart: () => 0,
    locEnd: (node) => node.text.length,
  },
};
export const printers = {
  [textParser]: {
    print: (path) =>
      builders.join(builders.literalline, path.node.text.split("\n")),
  },
};
