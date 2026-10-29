import { parsers as markdownParsers } from "prettier/plugins/markdown";
import { loadSettings, spellingSettings } from "./configuration.mjs";
import { applyCorrections, checkSource, describeIssue } from "./spelling.mjs";
import { codeParsers } from "./code.mjs";
import { htmlParser } from "./html.mjs";
import { languages, parsers as textParsers, printers } from "./text.mjs";

export { languages, printers };

export const options = {
  spellcheck: {
    type: "boolean",
    category: "Spelling",
    description: "Enable or disable spelling checks.",
  },
  spellcheckConfig: {
    type: "string",
    category: "Spelling",
    description:
      "Spelling configuration file; defaults to spellcheck.json when present.",
  },
};

async function preprocess(text, options, parser, original) {
  const settings = loadSettings(options);
  let corrected = text;
  if (settings.enabled) {
    const errors = await checkSource(text, settings, { ...options, parser });
    const unresolved = settings.autocorrect
      ? errors.filter((error) => error.replacement === undefined)
      : errors;
    if (unresolved.length) {
      const location =
        options.filepath ||
        `<${parser === "markdown" ? "markdown" : parser === "html" ? "html" : parser === "spellcheck-text" ? "text" : "code"}>`;
      const details = unresolved.map(
        (error) =>
          `${location}:${error.line}:${error.column} ${describeIssue(error)}`,
      );
      throw new Error(`Spelling check failed.\n${details.join("\n")}`);
    }
    if (settings.autocorrect) {
      corrected = applyCorrections(text, errors);
    }
  }
  // Embedded printers must not widen the spelling scopes already checked above.
  options.spellcheck = false;
  return original.preprocess
    ? original.preprocess(corrected, options)
    : corrected;
}

export const parsers = {
  ...Object.fromEntries(
    Object.entries({
      markdown: markdownParsers.markdown,
      html: htmlParser,
      ...codeParsers,
      ...textParsers,
    }).map(([name, parser]) => [
      name,
      {
        ...parser,
        preprocess: (text, options) => preprocess(text, options, name, parser),
      },
    ]),
  ),
};

const plugin = { options, parsers, languages, printers };
export default plugin;

function inlineOptions(options) {
  const value = options.spellcheck;
  if (value === undefined) {
    const result = { ...options };
    delete result.spellcheck;
    return result;
  }
  if (typeof value === "boolean") {
    return options;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("spellcheck must be an object or boolean.");
  }
  const result = {
    ...options,
    spellcheckConfig: JSON.stringify(spellingSettings(value)),
  };
  delete result.spellcheck;
  if (value.enabled !== undefined) {
    result.spellcheck = value.enabled;
  }
  return result;
}

export function defineConfig(config = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Prettier configuration must be an object.");
  }
  if (config.plugins !== undefined && !Array.isArray(config.plugins)) {
    throw new Error("Prettier plugins must be an array.");
  }
  if (config.overrides !== undefined && !Array.isArray(config.overrides)) {
    throw new Error("Prettier overrides must be an array.");
  }
  return {
    ...inlineOptions(config),
    plugins: [
      ...(config.plugins || []).filter(
        (entry) => entry !== plugin && entry !== "prettier-plugin-spellcheck",
      ),
      plugin,
    ],
    ...(config.overrides
      ? {
          overrides: config.overrides.map((override) => ({
            ...override,
            ...(override.options &&
            Object.hasOwn(override.options, "spellcheck")
              ? {
                  options: inlineOptions(override.options),
                }
              : {}),
          })),
        }
      : {}),
  };
}
