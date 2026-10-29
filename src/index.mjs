import { parsers as markdownParsers } from "prettier/plugins/markdown";
import { loadSettings } from "./configuration.mjs";
import { applyCorrections, checkSource, describeIssue } from "./spelling.mjs";

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

async function preprocess(text, options) {
  let corrected = text;
  if (options.spellcheck) {
    const errors = await checkSource(
      text,
      loadSettings(options.spellcheckConfig),
      {
        autocorrect: options.spellcheckAutocorrect,
      },
    );
    const unresolved = options.spellcheckAutocorrect
      ? errors.filter((error) => error.replacement === undefined)
      : errors;
    if (unresolved.length) {
      const location = options.filepath || "<markdown>";
      const details = unresolved.map(
        (error) =>
          `${location}:${error.line}:${error.column} ${describeIssue(error)}`,
      );
      throw new Error(
        `Spelling check failed; this file was not formatted.\n${details.join("\n")}`,
      );
    }
    if (options.spellcheckAutocorrect) {
      corrected = applyCorrections(text, errors);
    }
  }
  return markdownParsers.markdown.preprocess
    ? markdownParsers.markdown.preprocess(corrected, options)
    : corrected;
}

export const parsers = {
  markdown: { ...markdownParsers.markdown, preprocess },
};
