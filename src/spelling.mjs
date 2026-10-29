import { lint } from "markdownlint/sync";
import rule, { createRule } from "markdownlint-rule-spellcheck";

const collectionRule = createRule({ suggestions: false });

export function checkSource(
  text,
  settings = {},
  { autocorrect = false, suggestions = true } = {},
) {
  return lint({
    strings: { source: text },
    customRules: [suggestions ? rule : collectionRule],
    config: {
      default: false,
      spellcheck: {
        ...settings,
        autocorrect,
        markdown: { frontMatter: false },
      },
    },
  }).source;
}
