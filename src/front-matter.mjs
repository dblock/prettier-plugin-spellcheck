import { isMap, isScalar, isSeq, parse, parseDocument } from "yaml";

export function frontMatterSpans(text, node, config) {
  if (config === false || node.language !== "yaml") {
    return [];
  }
  const firstLine = /\r\n|\r|\n/u.exec(node.raw);
  if (!firstLine || !node.endDelimiter) {
    throw new Error("Unterminated YAML front matter.");
  }
  const start =
    node.position.start.offset + firstLine.index + firstLine[0].length;
  const end = node.position.end.offset - node.endDelimiter.length;
  const source = text.slice(start, end);
  const doc = parseDocument(source, { keepSourceTokens: true, strict: true });
  if (doc.errors.length || doc.warnings.length) {
    throw new Error(
      `Invalid YAML front matter: ${(doc.errors[0] || doc.warnings[0]).message}`,
    );
  }
  const spans = [];
  const matches = (paths, path) =>
    paths.some((parent) => path === parent || path.startsWith(`${parent}.`));
  function visit(value, path) {
    if (isMap(value)) {
      for (const pair of value.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
          throw new Error("YAML front matter field names must be strings.");
        }
        visit(pair.value, path ? `${path}.${pair.key.value}` : pair.key.value);
      }
    } else if (isSeq(value)) {
      for (const item of value.items) {
        visit(item, path);
      }
    } else if (isScalar(value) && typeof value.value === "string") {
      if (
        (config.include && !matches(config.include, path)) ||
        matches(config.exclude || [], path)
      ) {
        return;
      }
      let raw = source.slice(value.range[0], value.range[1]);
      let offset = start + value.range[0];
      const quoted =
        value.type === "QUOTE_SINGLE" || value.type === "QUOTE_DOUBLE";
      if (quoted) {
        raw = raw.slice(1, -1);
        offset++;
      } else if (value.srcToken.type === "block-scalar") {
        raw = value.srcToken.source;
        offset += value.srcToken.props.reduce(
          (size, prop) => size + prop.source.length,
          0,
        );
      }
      let decoded = "";
      const mapping = [];
      for (let index = 0; index < raw.length;) {
        let length = 1;
        let character = raw[index];
        if (value.type === "QUOTE_SINGLE" && raw.startsWith("''", index)) {
          character = "'";
          length = 2;
        } else if (value.type === "QUOTE_DOUBLE" && raw[index] === "\\") {
          const escape =
            /^\\(?:x[\da-f]{2}|u[\da-f]{4}|U[\da-f]{8}|\r?\n[ \t]*|[\s\S])/iu.exec(
              raw.slice(index),
            )[0];
          length = escape.length;
          character = /^\\\r?\n/u.test(escape) ? "" : parse(`"${escape}"`);
        }
        decoded += character;
        for (let unit = 0; unit < character.length; unit++) {
          mapping.push({ start: offset + index, end: offset + index + length });
        }
        index += length;
      }
      spans.push({
        text: decoded,
        mapping,
        allowFix: value.type === "PLAIN",
        safeReplacement: (first, length, replacement) =>
          typeof parse(
            decoded.slice(0, first) +
              replacement +
              decoded.slice(first + length),
          ) === "string",
      });
    }
  }
  visit(doc.contents, "");
  return spans;
}
