import { parsers as babel } from "prettier/plugins/babel";
import { parsers as typescript } from "prettier/plugins/typescript";
import { parsers as flow } from "prettier/plugins/flow";
import { parsers as acorn } from "prettier/plugins/acorn";

export const codeParsers = {
  babel: babel.babel,
  "babel-flow": babel["babel-flow"],
  "babel-ts": babel["babel-ts"],
  typescript: typescript.typescript,
  flow: flow.flow,
  acorn: acorn.acorn,
  espree: acorn.espree,
};

const range = (node) => [
  node.start ?? node.range?.[0],
  node.end ?? node.range?.[1],
];
const mask = (text) => text.replace(/[^\r\n]/g, " ");
const machinery =
  /^(?:eslint\b|eslint-|global\b|globals\b|exported\b|prettier-ignore\b|@(?:ts-|flow\b|noflow\b)|(?:istanbul|c8|v8|jshint|jslint)\b|[#@]\s*source(?:Mapping)?URL=|SPDX-License-Identifier:|spellcheck[-:](?:disable|enable|todo)\b)/u;
const metadataTag =
  /^(?:author|license|preserve|type|typedef|callback|implements|extends|augments|satisfies|this|enum|namespace|memberof|alias|name|module|requires|import|default|defaultValue|inheritDoc)$/iu;
const parameterTag =
  /^(?:param|arg|argument|property|prop|template|typeParam)$/iu;
const proseAttributes = new Set([
  "alt",
  "title",
  "placeholder",
  "aria-label",
  "aria-description",
]);

function documentation(text, ignored) {
  let example = false;
  return text.replace(/[^\r\n]+/g, (line, offset) => {
    const trimmed = line.trimStart();
    if (machinery.test(trimmed)) {
      if (example || !/^spellcheck[-:]/u.test(trimmed)) {
        ignored.push([offset, offset + line.length]);
      }
      return mask(line);
    }
    let result = line;
    const tag = /^[ \t]*@([\w-]+)\b[ \t]*/u.exec(line);
    if (tag) {
      example = tag[1].toLowerCase() === "example";
      if (example || metadataTag.test(tag[1])) {
        ignored.push([offset, offset + line.length]);
        return mask(line);
      }
      let end = tag[0].length;
      if (line[end] === "{") {
        let depth = 0;
        do {
          if (line[end] === "{") depth++;
          if (line[end] === "}") depth--;
          end++;
        } while (end < line.length && depth);
      }
      if (parameterTag.test(tag[1])) {
        const name = /^[ \t]*(?:\[[^\]]*\]|[^\s]+)[ \t]*(?:-[ \t]*)?/u.exec(
          line.slice(end),
        );
        if (name) end += name[0].length;
      }
      ignored.push([offset, offset + end]);
      result = mask(line.slice(0, end)) + line.slice(end);
    } else if (example) {
      ignored.push([offset, offset + line.length]);
      return mask(line);
    }
    result = result.replace(
      /^([ \t]*)(?:TODO|FIXME|XXX|HACK|NOTE)(?:\([^)]*\))?:[ \t]*/u,
      mask,
    );
    return result.replace(/\{@[\w-]+[^}]*\}/gu, (inline) => {
      const link =
        /^\{@(?:link|linkcode|linkplain)[ \t]+[^\s|}]+(?:[|\s]+([^}]*))?\}$/u.exec(
          inline,
        );
      if (!link?.[1]) return mask(inline);
      const first = inline.length - link[1].length - 1;
      return mask(inline.slice(0, first)) + link[1] + " ";
    });
  });
}

function commentSource(text, group) {
  let source = "";
  const mapping = [];
  for (const [index, comment] of group.entries()) {
    const [start, end] = range(comment);
    if (index) {
      source += "\n";
      mapping.push({ start: start - 1, end: start });
    }
    const block = text.startsWith("/*", start);
    const raw = text.slice(start + 2, end - (block ? 2 : 0));
    const lines = [...raw.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)].filter(
      (match) => match[0],
    );
    const margins = lines
      .slice(1)
      .filter(([line]) => line.trim() && !/^[ \t]*\*/u.test(line))
      .map(([line]) => /^[ \t]*/u.exec(line)[0].length);
    const margin = margins.length ? Math.min(...margins) : 0;
    for (const [lineIndex, line] of lines.entries()) {
      let prefix;
      if (!block) {
        prefix = line[0].startsWith(" ") ? 1 : 0;
      } else {
        const marker = /^[ \t]*\*(?:[ \t]|(?=\r|\n|$))/u.exec(line[0]);
        prefix = marker
          ? marker[0].length
          : lineIndex
            ? margin
            : line[0].startsWith(" ")
              ? 1
              : 0;
      }
      const content = line[0].slice(prefix);
      source += content;
      for (let unit = 0; unit < content.length; unit++) {
        const offset = start + 2 + line.index + prefix + unit;
        mapping.push({ start: offset, end: offset + 1 });
      }
    }
  }
  const excluded = [];
  const cleaned = documentation(source, excluded);
  let prose = "";
  const positions = [];
  const append = (first, last) => {
    for (let index = first; index < last; index++)
      positions.push(mapping[index]);
  };
  for (const line of cleaned.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    if (!line[0]) continue;
    const first = line.index;
    const originalIndent = /^[ \t]*/u.exec(source.slice(first))[0].length;
    const cleanedIndent = /^[ \t]*/u.exec(line[0])[0].length;
    // Removed tags must not become Markdown's four-space code indentation.
    if (line[0].trim() && cleanedIndent > originalIndent) {
      prose +=
        source.slice(first, first + originalIndent) +
        line[0].slice(cleanedIndent);
      append(first, first + originalIndent);
      append(first + cleanedIndent, first + line[0].length);
    } else {
      prose += line[0];
      append(first, first + line[0].length);
    }
  }
  return {
    text: prose,
    mapping: positions,
    directiveIgnored: excluded.map(([start, end]) => [
      mapping[start].start,
      mapping[end - 1].end,
    ]),
  };
}

function decodedString(raw, start, expected, template = false) {
  let text = "";
  const mapping = [];
  for (let index = 0; index < raw.length;) {
    let length = 1;
    let character = raw[index];
    if (character === "\\") {
      const escape =
        /^\\(?:u\{[\da-f]+\}|u[\da-f]{4}|x[\da-f]{2}|\r\n|[\r\n\u2028\u2029]|[0-3][0-7]{0,2}|[4-7][0-7]?|[\s\S])/iu.exec(
          raw.slice(index),
        )[0];
      length = escape.length;
      const value = escape.slice(1);
      if (/^[\r\n\u2028\u2029]/u.test(value)) character = "";
      else if (/^u\{/u.test(value))
        character = String.fromCodePoint(
          Number.parseInt(value.slice(2, -1), 16),
        );
      else if (/^[ux]/u.test(value))
        character = String.fromCharCode(Number.parseInt(value.slice(1), 16));
      else if (/^[0-7]+$/u.test(value))
        character = String.fromCharCode(Number.parseInt(value, 8));
      else
        character =
          { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v" }[value] ??
          value;
    } else if (template && character === "\r") {
      length = raw[index + 1] === "\n" ? 2 : 1;
      character = "\n";
    }
    text += character;
    for (let unit = 0; unit < character.length; unit++) {
      mapping.push({ start: start + index, end: start + index + length });
    }
    index += length;
  }
  if (text !== expected) {
    throw new Error(
      `Cannot map JavaScript string contents at offset ${start} to source positions.`,
    );
  }
  return { text, mapping, allowFix: false };
}

function moduleCall(callee) {
  if (
    callee?.type === "Import" ||
    (callee?.type === "Identifier" && callee.name === "require")
  )
    return true;
  if (
    !["MemberExpression", "OptionalMemberExpression"].includes(callee?.type) ||
    callee.computed
  )
    return false;
  return (
    (callee.property.name === "require" && callee.object.name === "module") ||
    (callee.property.name === "resolve" &&
      (callee.object.name === "require" ||
        (callee.object.type === "MetaProperty" &&
          callee.object.meta.name === "import")))
  );
}

function excludedString(node, parents) {
  let context = parents.get(node);
  if (node.type === "TemplateElement") {
    node = context.parent;
    context = parents.get(node);
    if (context?.parent?.type === "TaggedTemplateExpression") return true;
  }
  const parent = context?.parent;
  const key = context?.key;
  if (!parent) return false;
  if (
    key === "source" ||
    parent.type === "ImportAttribute" ||
    (parent.type === "ExpressionStatement" && parent.directive !== undefined) ||
    key === "key" ||
    key === "property"
  )
    return true;
  if (
    ["CallExpression", "OptionalCallExpression"].includes(parent.type) &&
    parent.arguments[0] === node &&
    moduleCall(parent.callee)
  )
    return true;
  if (
    parent.type === "NewExpression" &&
    parent.callee.name === "URL" &&
    parent.arguments[0] === node
  )
    return true;
  while (
    context &&
    ["TSLiteralType", "LiteralTypeAnnotation"].includes(context.parent.type)
  ) {
    context = parents.get(context.parent);
  }
  return context?.parent?.type === "TSImportType";
}

export async function codeSpans(text, parser, options, config) {
  const ast = await codeParsers[parser].parse(text, { ...options, parser });
  const spans = [];
  const ignored = [];
  const prose = [];
  const comments = [];
  const records = [];
  const parents = new WeakMap();
  const seen = new WeakSet();
  function visit(node, parent, key) {
    if (
      !node ||
      typeof node !== "object" ||
      typeof node.type !== "string" ||
      seen.has(node)
    )
      return;
    seen.add(node);
    parents.set(node, { parent, key });
    records.push(node);
    for (const [childKey, value] of Object.entries(node)) {
      if (
        [
          "comments",
          "leadingComments",
          "trailingComments",
          "innerComments",
          "tokens",
          "loc",
          "range",
          "extra",
          "parent",
        ].includes(childKey)
      )
        continue;
      if (Array.isArray(value))
        value.forEach((child) => visit(child, node, childKey));
      else visit(value, node, childKey);
    }
  }
  visit(ast);
  const ordered = records
    .filter((node) => Number.isInteger(range(node)[0]))
    .sort(
      (left, right) =>
        range(left)[0] - range(right)[0] || range(right)[1] - range(left)[1],
    );
  const groups = [];
  for (const comment of [...(ast.comments || [])].sort(
    (a, b) => range(a)[0] - range(b)[0],
  )) {
    const [start, end] = range(comment);
    const raw = text.slice(start, end);
    if (!raw.startsWith("//") && !raw.startsWith("/*")) continue;
    comments.push({ text: comment.value, start: start + 2, syntax: "code" });
    if (comment.value.trim() === "prettier-ignore") {
      const next = ordered.find((node) => range(node)[0] >= end);
      if (next) ignored.push(range(next));
    }
    const previous = groups.at(-1)?.at(-1);
    if (
      previous &&
      raw.startsWith("//") &&
      text.startsWith("//", range(previous)[0]) &&
      /^[ \t]*(?:\r\n|\r|\n)[ \t]*$/u.test(
        text.slice(range(previous)[1], start),
      )
    ) {
      groups.at(-1).push(comment);
    } else groups.push([comment]);
  }
  for (const group of groups) {
    prose.push({ ...commentSource(text, group), enabled: config.comments });
  }
  for (const node of records) {
    const [start, end] = range(node);
    if (!Number.isInteger(start) || !Number.isInteger(end)) continue;
    const context = parents.get(node);
    const attribute =
      context?.parent?.type === "JSXAttribute"
        ? context.parent
        : context?.parent?.type === "JSXExpressionContainer" &&
            parents.get(context.parent)?.parent?.type === "JSXAttribute"
          ? parents.get(context.parent).parent
          : undefined;
    const proseAttribute =
      attribute && proseAttributes.has(attribute.name.name);
    const string =
      node.type === "StringLiteral" ||
      (node.type === "Literal" && typeof node.value === "string");
    if (node.type === "JSXText" && config.jsx) {
      spans.push({ start, end });
    } else if (
      string &&
      (config.strings || (config.jsx && proseAttribute)) &&
      (!attribute || (config.jsx && proseAttribute)) &&
      !excludedString(node, parents)
    ) {
      if (context.parent.type === "JSXAttribute") {
        spans.push({ start: start + 1, end: end - 1, allowFix: false });
      } else
        spans.push(
          decodedString(text.slice(start + 1, end - 1), start + 1, node.value),
        );
    } else if (
      node.type === "TemplateElement" &&
      config.strings &&
      !excludedString(node, parents)
    ) {
      let first = start;
      let last = end;
      const normalize = (raw) => raw.replace(/\r\n?/gu, "\n");
      if (normalize(text.slice(first, last)) !== normalize(node.value.raw)) {
        first++;
        last -= node.tail ? 1 : 2;
        if (normalize(text.slice(first, last)) !== normalize(node.value.raw)) {
          throw new Error(`Cannot locate template text at offset ${start}.`);
        }
      }
      spans.push(
        decodedString(text.slice(first, last), first, node.value.cooked, true),
      );
    } else if (
      config.identifiers &&
      ["Identifier", "JSXIdentifier", "PrivateIdentifier"].includes(node.type)
    ) {
      const first = text[start] === "#" ? start + 1 : start;
      const raw =
        node.type === "JSXIdentifier"
          ? text.slice(first, first + node.name.length)
          : /^(?:\\u(?:\{[\da-f]+\}|[\da-f]{4})|[$\p{ID_Continue}\u200c\u200d])+/iu.exec(
              text.slice(first, end),
            )?.[0];
      if (!raw) {
        throw new Error(`Cannot locate identifier at offset ${first}.`);
      }
      const decoded = decodedString(raw, first, node.name);
      for (const match of decoded.text.matchAll(/[\p{L}\p{M}]+/gu)) {
        let offset = match.index;
        for (const word of match[0].split(
          /(?<=\p{Ll})(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u,
        )) {
          spans.push({
            text: word,
            mapping: decoded.mapping.slice(offset, offset + word.length),
            allowFix: false,
          });
          offset += word.length;
        }
      }
    }
  }
  return { spans, ignored, comments, prose };
}
