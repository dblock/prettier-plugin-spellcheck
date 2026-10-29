import { defineConfig } from "./src/index.mjs";

export default defineConfig({
  proseWrap: "never",
  spellcheck: {
    dictionaries: [
      "@cspell/dict-en_us",
      "@cspell/dict-software-terms",
      "./.spellcheck.txt",
    ],
  },
});
