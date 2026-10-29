import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/sync";
import rule from "markdownlint-rule-spellcheck";
import { parsers as markdownParsers } from "prettier/plugins/markdown";
import { loadSettings } from "./configuration.mjs";

export const options = {
  spellcheckConfig: {
    type: "string",
    category: "Spelling",
    description: "Path to a JSON spelling configuration file.",
  },
  spellcheck: {
    type: "boolean",
    category: "Spelling",
    default: true,
    description: "Check Markdown prose spelling.",
  },
  spellcheckAutocorrect: {
    type: "boolean",
    category: "Spelling",
    default: false,
    description: "Apply conservative spelling corrections before formatting.",
  },
};

function check(text, autocorrect, settings) {
  return lint({
    strings: { source: text },
    customRules: [rule],
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

async function preprocess(text, options) {
  let corrected = text;
  if (options.spellcheck) {
    const errors = check(
      text,
      options.spellcheckAutocorrect,
      loadSettings(options.spellcheckConfig),
    );
    const unresolved = options.spellcheckAutocorrect
      ? errors.filter((error) => !error.fixInfo)
      : errors;
    if (unresolved.length) {
      const location = options.filepath || "<markdown>";
      const details = unresolved.map(
        (error) =>
          `${location}:${error.lineNumber}:${error.errorRange[0]} ${error.errorDetail}`,
      );
      throw new Error(
        `Spelling check failed; this file was not formatted.\n${details.join("\n")}`,
      );
    }
    if (options.spellcheckAutocorrect) {
      corrected = applyFixes(text, errors);
    }
  }
  return markdownParsers.markdown.preprocess
    ? markdownParsers.markdown.preprocess(corrected, options)
    : corrected;
}

export const parsers = {
  markdown: { ...markdownParsers.markdown, preprocess },
};
