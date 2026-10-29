import { parsers as markdownParsers } from "prettier/plugins/markdown";
import { spellingSettings } from "./configuration.mjs";
import { applyCorrections, checkSource, describeIssue } from "./spelling.mjs";

export const options = {
  spellcheck: {
    type: "string",
    category: "Spelling",
    default: "{}",
    description:
      "JSON spelling settings; use defineConfig for nested configuration.",
  },
};

async function preprocess(text, options) {
  const settings = spellingSettings(options.spellcheck);
  let corrected = text;
  if (settings.enabled) {
    const errors = await checkSource(text, settings);
    const unresolved = settings.autocorrect
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
    if (settings.autocorrect) {
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

const plugin = { options, parsers };
export default plugin;

function serialized(value) {
  return JSON.stringify(spellingSettings(value));
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
    ...config,
    plugins: [
      ...(config.plugins || []).filter(
        (entry) => entry !== plugin && entry !== "prettier-plugin-spellcheck",
      ),
      plugin,
    ],
    spellcheck: serialized(config.spellcheck),
    ...(config.overrides
      ? {
          overrides: config.overrides.map((override) => ({
            ...override,
            ...(override.options &&
            Object.hasOwn(override.options, "spellcheck")
              ? {
                  options: {
                    ...override.options,
                    spellcheck: serialized(override.options.spellcheck),
                  },
                }
              : {}),
          })),
        }
      : {}),
  };
}
