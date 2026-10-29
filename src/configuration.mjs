export function spellingSettings(value) {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch (error) {
      throw new Error(`Invalid spellcheck JSON: ${error.message}`, {
        cause: error,
      });
    }
  }
  if (value === undefined || value === true) {
    value = {};
  } else if (value === false) {
    value = { enabled: false };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("spellcheck must be an object or boolean.");
  }
  for (const key of Object.keys(value)) {
    if (
      !["enabled", "autocorrect", "dictionaries", "frontMatter"].includes(key)
    ) {
      throw new Error(`Unknown spellcheck option: ${key}.`);
    }
  }
  for (const key of ["enabled", "autocorrect"]) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") {
      throw new Error(`spellcheck.${key} must be a boolean.`);
    }
  }
  const dictionaries =
    value.dictionaries === undefined
      ? ["@cspell/dict-en_us"]
      : value.dictionaries;
  if (
    !Array.isArray(dictionaries) ||
    !dictionaries.length ||
    dictionaries.some((entry) => typeof entry !== "string" || !entry.trim())
  ) {
    throw new Error(
      "spellcheck.dictionaries must be a nonempty array of dictionary packages or .txt paths.",
    );
  }
  const frontMatter =
    value.frontMatter === undefined || value.frontMatter === true
      ? {}
      : value.frontMatter;
  if (frontMatter !== false) {
    if (
      !frontMatter ||
      typeof frontMatter !== "object" ||
      Array.isArray(frontMatter)
    ) {
      throw new Error("spellcheck.frontMatter must be a boolean or an object.");
    }
    for (const [key, paths] of Object.entries(frontMatter)) {
      if (
        !["include", "exclude"].includes(key) ||
        !Array.isArray(paths) ||
        paths.some(
          (path) =>
            typeof path !== "string" ||
            !path ||
            path.split(".").some((part) => !part),
        )
      ) {
        throw new Error(
          "spellcheck.frontMatter include/exclude must be arrays of dotted field paths.",
        );
      }
    }
  }
  return {
    enabled: value.enabled !== false,
    autocorrect: value.autocorrect === true,
    dictionaries,
    frontMatter,
  };
}
