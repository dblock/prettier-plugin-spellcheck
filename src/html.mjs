import { parsers } from "prettier/plugins/html";
import { proseAttributes } from "./code.mjs";

export const htmlParser = parsers.html;

const excludedElements = new Set([
  "script",
  "style",
  "code",
  "pre",
  "kbd",
  "samp",
  "template",
]);
const blocks = new Set(
  "address article aside blockquote body br caption dd desc details dialog div dl dt fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 head header hgroup hr html legend li main menu nav ol p section summary svg table tbody td text tfoot th thead title tr ul".split(
    " ",
  ),
);
const range = (node) => [
  node.sourceSpan.start.offset,
  node.sourceSpan.end.offset,
];

function decodedSpan(text, tokens, allowFix) {
  let decoded = "";
  const mapping = [];
  const append = (value, start, end) => {
    decoded += value;
    for (let unit = 0; unit < value.length; unit++) {
      mapping.push({ start, end });
    }
  };
  for (const token of tokens) {
    const [start, end] = range(token);
    const raw = text.slice(start, end);
    if (
      token.parts.length === 2 &&
      token.parts[1] === raw &&
      raw.startsWith("&")
    ) {
      append(token.parts[0], start, end);
    } else if (token.parts.length === 3) {
      // An interpolation must not turn its neighboring fragments into words.
      append("_", start, end);
    } else {
      const first = decoded.length;
      for (let index = start; index < end; index++) {
        const character = text[index];
        if (character === "\r") {
          const last = text[index + 1] === "\n" ? index + 2 : index + 1;
          append("\n", index, last);
          index = last - 1;
        } else {
          append(character, index, index + 1);
        }
      }
      if (decoded.slice(first) !== token.parts[0]) {
        throw new Error(`Cannot map HTML text at offset ${start}.`);
      }
    }
  }
  return { text: decoded, mapping, allowFix, literal: true };
}

export async function htmlSpans(text, options) {
  let ast = await htmlParser.parse(text, { ...options, parser: "html" });
  const ignored = [];
  const frontMatter = ast.children.find((node) => node.kind === "frontMatter");
  if (frontMatter) {
    const [start, end] = range(frontMatter);
    // Reparse masked front matter to preserve UTF-16 offsets across versions.
    text =
      text.slice(0, start) +
      text.slice(start, end).replace(/[^\r\n]/g, " ") +
      text.slice(end);
    ignored.push([start, end]);
    ast = await htmlParser.parse(text, { ...options, parser: "html" });
  }
  const spans = [];
  const comments = [];
  const ignoredAttributes = new WeakMap();
  let prose = { text: "", mapping: [], literal: true };
  const flush = () => {
    if (prose.text.trim()) spans.push(prose);
    prose = { text: "", mapping: [], literal: true };
  };
  function visit(node) {
    const [start, end] = range(node);
    if (ignored.some(([first, last]) => start >= first && end <= last)) {
      flush();
      return;
    }
    if (node.kind === "element") {
      const name = node.name.toLowerCase();
      if (
        excludedElements.has(name) ||
        node.attrs.some(
          (attribute) => attribute.name.toLowerCase() === "hidden",
        )
      ) {
        ignored.push([start, end]);
        flush();
        return;
      }
      if (blocks.has(name) || node.isVoid) flush();
      const excluded = ignoredAttributes.get(node);
      for (const attribute of node.attrs) {
        if (
          proseAttributes.has(attribute.name.toLowerCase()) &&
          attribute.value &&
          excluded !== true &&
          !excluded?.has(attribute.name.toLowerCase())
        ) {
          if (!Array.isArray(attribute.valueTokens)) {
            throw new Error(`Cannot locate HTML attribute at offset ${start}.`);
          }
          spans.push(decodedSpan(text, attribute.valueTokens, false));
        }
      }
    } else if (node.kind === "text" || node.kind === "cdata") {
      if (!Array.isArray(node.tokens)) {
        throw new Error(`Cannot locate HTML text at offset ${start}.`);
      }
      const span = decodedSpan(text, node.tokens, true);
      prose.text += span.text;
      for (const unit of span.mapping) prose.mapping.push(unit);
    } else if (node.kind === "comment") {
      comments.push({ text: text.slice(start, end), start });
    }
    const children = node.children || [];
    for (const [index, child] of children.entries()) {
      if (child.kind === "comment") {
        const next = children
          .slice(index + 1)
          .find(
            (candidate) => candidate.kind !== "text" || candidate.value.trim(),
          );
        if (next && child.value.trim() === "prettier-ignore") {
          ignored.push(range(next));
        }
        const attributes = /^prettier-ignore-attribute(?:\s+([\s\S]*))?$/u.exec(
          child.value.trim(),
        );
        if (next?.kind === "element" && attributes) {
          ignoredAttributes.set(
            next,
            attributes[1]
              ? new Set(attributes[1].toLowerCase().split(/\s+/u))
              : true,
          );
        }
      }
      visit(child);
    }
    if (
      node.kind === "element" &&
      (blocks.has(node.name.toLowerCase()) || node.isVoid)
    ) {
      flush();
    }
  }
  visit(ast);
  flush();
  return { spans, ignored, comments };
}
