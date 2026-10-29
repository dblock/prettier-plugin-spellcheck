import { parsers } from "prettier/plugins/markdown";
import {
  getDictionary,
  normalizeApostrophes,
  wordOnly,
} from "./dictionaries.mjs";
import { spellingSettings } from "./configuration.mjs";
import { frontMatterSpans } from "./front-matter.mjs";
import { codeParsers, codeSpans } from "./code.mjs";

const wordPattern =
  /[\p{L}\p{M}\p{N}\p{Pc}]+(?:['’][\p{L}\p{M}\p{N}\p{Pc}]+)*/gu;
const nonProse =
  /(?:https?:\/\/|mailto:|www\.)[^\s<>]+|[\p{L}\p{N}_.+-]+@[\p{L}\p{N}_.-]+|&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);/giu;
const overlaps = (ranges, start, end) =>
  ranges.some(([first, last]) => start < last && end > first);
const directive = (node, name) =>
  node.type === "html" && node.value.trim() === `<!-- ${name} -->`;

export function oneEditAway(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  if (a.length === b.length) {
    const different = a.flatMap((letter, index) =>
      letter === b[index] ? [] : [index],
    );
    return (
      different.length === 1 ||
      (different.length === 2 &&
        different[1] === different[0] + 1 &&
        a[different[0]] === b[different[1]] &&
        a[different[1]] === b[different[0]])
    );
  }
  if (Math.abs(a.length - b.length) !== 1) {
    return false;
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  let skipped = false;
  for (let i = 0, j = 0; i < long.length; i++) {
    if (long[i] === short[j]) {
      j++;
    } else if (skipped) {
      return false;
    } else {
      skipped = true;
    }
  }
  return true;
}

function replacement(word, candidates, dictionary) {
  const lower = word.toLowerCase();
  const title = (text) => {
    const [first, ...rest] = text;
    return first.toUpperCase() + rest.join("").toLowerCase();
  };
  if (word !== lower && (word !== title(word) || word === word.toUpperCase())) {
    return undefined;
  }
  const candidate = candidates[0]?.toLowerCase();
  if (
    !candidate ||
    !wordOnly.test(candidate) ||
    !oneEditAway(
      normalizeApostrophes(lower),
      normalizeApostrophes(candidate),
    ) ||
    (word.includes("'") && word.includes("\u2019"))
  ) {
    return undefined;
  }
  const styled = word.includes("\u2019")
    ? candidate.replaceAll("'", "\u2019")
    : candidate;
  const result = word === lower ? styled : title(styled);
  return dictionary.has(result) ? result : undefined;
}

function lineStarts(text) {
  return [
    0,
    ...Array.from(
      text.matchAll(/\r\n|\r|\n/gu),
      (match) => match.index + match[0].length,
    ),
  ];
}

function position(offsets, offset) {
  let low = 0;
  let high = offsets.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle] <= offset) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return { line: low + 1, column: offset - offsets[low] + 1 };
}

function imageLabel(text, node) {
  const start = node.position.start.offset + 2;
  let depth = 1;
  for (let index = start; index < node.position.end.offset; index++) {
    if (text[index] === "\\") {
      index++;
    } else if (text[index] === "`") {
      const delimiter = /^`+/u.exec(text.slice(index))[0];
      const closing = text.indexOf(delimiter, index + delimiter.length);
      if (closing !== -1 && closing < node.position.end.offset) {
        index = closing + delimiter.length - 1;
      }
    } else if (text[index] === "[") {
      depth++;
    } else if (text[index] === "]" && --depth === 0) {
      return [start, index];
    }
  }
  throw new Error("Cannot locate Markdown image description.");
}

async function markdownSpans(text, frontMatter) {
  const ast = await parsers.markdown.parse(text, { parser: "markdown" });
  const spans = [];
  const ignored = [];
  const code = [];
  const comments = [];
  async function visit(node, base = 0) {
    const start = base + node.position.start.offset;
    const end = base + node.position.end.offset;
    if (node.type === "frontMatter") {
      spans.push(...frontMatterSpans(text, node, frontMatter));
    } else if (node.type === "code" || node.type === "inlineCode") {
      code.push([start, end]);
    } else if (node.type === "text") {
      spans.push({ start, end });
    } else if (node.type === "html") {
      comments.push({ text: node.value, start });
    } else if (node.type === "image" || node.type === "imageReference") {
      const [first, last] = imageLabel(text.slice(base), node);
      const label = text.slice(base + first, base + last);
      const parsed = await parsers.markdown.parse(label, {
        parser: "markdown",
      });
      await visit(parsed, base + first);
    } else {
      const children = node.children || [];
      for (const [index, child] of children.entries()) {
        if (directive(child, "prettier-ignore") && children[index + 1]) {
          const next = children[index + 1];
          ignored.push([
            base + next.position.start.offset,
            base + next.position.end.offset,
          ]);
        }
        await visit(child, base);
      }
    }
  }
  await visit(ast);
  const lines = text.split(/\r\n|\r|\n/u);
  const blankBefore = (node) =>
    node.position.start.line === 1 ||
    !lines[node.position.start.line - 2].trim();
  let start;
  for (const child of ast.children) {
    if (directive(child, "prettier-ignore-start") && blankBefore(child)) {
      start ??= child.position.end.offset;
    } else if (
      start !== undefined &&
      directive(child, "prettier-ignore-end") &&
      blankBefore(child)
    ) {
      ignored.push([start, child.position.start.offset]);
      start = undefined;
    }
  }
  let cursor = 0;
  const opener = /\{\{|\{%/gu;
  while (cursor < text.length) {
    opener.lastIndex = cursor;
    const match = opener.exec(text);
    if (!match) {
      break;
    }
    const containingCode = code.find(
      ([first, last]) => match.index >= first && match.index < last,
    );
    if (containingCode) {
      cursor = containingCode[1];
      continue;
    }
    const closing = text.indexOf(
      match[0] === "{{" ? "}}" : "%}",
      match.index + 2,
    );
    if (closing === -1) {
      cursor = match.index + 2;
    } else {
      ignored.push([match.index, closing + 2]);
      cursor = closing + 2;
    }
  }
  return {
    spans,
    ignored,
    comments,
    directiveIgnored: [
      ...code,
      ...comments.map((comment) => [
        comment.start,
        comment.start + comment.text.length,
      ]),
    ],
  };
}

function suppressions(comments, offsets, text, ignored, nativeIgnored) {
  const scopes = Map.groupBy(comments, (comment) => comment.scope);
  const checks = [...scopes].map(([scope, scopedComments]) => {
    const events = [];
    const lines = new Set();
    let fileDisabled = false;
    for (const comment of scopedComments) {
      const native = comment.syntax === "code";
      const pattern = native
        ? /\b(spellcheck)([-:])(disable|enable|todo)(-file|-line|-next-line)?(?:[ \t]+([^\r\n]*?))?[ \t]*$/gmu
        : /<!--\s*(markdownlint|spellcheck)([-:])(disable|enable|todo)(-file|-line|-next-line)?(?:\s+([\s\S]*?))?\s*-->/gu;
      for (const match of comment.text.matchAll(pattern)) {
        const offset = comment.mapping
          ? comment.mapping[match.index].start
          : comment.start + match.index;
        if (
          overlaps(ignored, offset, offset + 1) ||
          (native && overlaps(nativeIgnored, offset, offset + 1))
        ) {
          continue;
        }
        if (native) ignored.push([offset, offset + match[0].length]);
        const names = (match[5] || "")
          .split(/(?:^|\s)--(?:\s|$)/u, 1)[0]
          .trim()
          .split(/[,\s]+/u)
          .filter(Boolean);
        if (
          names.length &&
          !names.some((name) =>
            ["all", "spellcheck", "spelling"].includes(name),
          )
        ) {
          continue;
        }
        const line = position(offsets, offset).line;
        const disabled = match[3] !== "enable";
        const prefix = text
          .slice(offsets[line - 1], offset)
          .replace(/^[ \t]*(?:\/\/|\/\*+|\*)[ \t]*/u, "");
        const ownLine =
          match[3] === "todo" ||
          (match[2] === ":" && disabled && prefix.trim());
        if (match[4] === "-file") {
          fileDisabled = disabled;
        } else if (
          ownLine ||
          match[4] === "-line" ||
          match[4] === "-next-line"
        ) {
          const target = line + (match[4] === "-next-line" ? 1 : 0);
          if (disabled) lines.add(target);
          else lines.delete(target);
        } else {
          events.push({ line, disabled });
        }
      }
    }
    events.sort((left, right) => left.line - right.line);
    return (line, offset) => {
      if (scope && (offset < scope.start || offset >= scope.end)) {
        return false;
      }
      if (fileDisabled || lines.has(line)) return true;
      let disabled = false;
      for (const event of events) {
        if (event.line > line) break;
        disabled = event.disabled;
      }
      return disabled;
    };
  });
  return (line, offset) => checks.some((check) => check(line, offset));
}

export async function checkSource(
  text,
  config = {},
  { suggestions = true, parser = "markdown", ...parserOptions } = {},
) {
  if (text.startsWith("\uFEFF")) {
    const issues = await checkSource(text.slice(1), config, {
      suggestions,
      parser,
      ...parserOptions,
    });
    return issues.map((issue) => ({ ...issue, offset: issue.offset + 1 }));
  }
  const settings = spellingSettings(config);
  if (!settings.enabled) {
    return [];
  }
  if (parser !== "markdown" && !Object.hasOwn(codeParsers, parser)) {
    throw new Error(`Unsupported spelling parser: ${parser}.`);
  }
  const dictionary = getDictionary(settings.dictionaries);
  const context = Object.hasOwn(codeParsers, parser)
    ? await codeSpans(text, parser, parserOptions, settings.code)
    : await markdownSpans(text, settings.frontMatter);
  const { spans, ignored, comments } = context;
  const nativeIgnored = [];
  for (const source of context.prose || []) {
    if (!source.mapping.length) continue;
    const parsed = await markdownSpans(source.text, false);
    const scope = {
      start: source.mapping[0].start,
      end: source.mapping.at(-1).end,
    };
    for (const span of parsed.spans) {
      spans.push({
        ...span,
        text: source.text.slice(span.start, span.end),
        mapping: source.mapping.slice(span.start, span.end),
      });
    }
    for (const [start, end] of parsed.ignored) {
      if (end > start)
        ignored.push([
          source.mapping[start].start,
          source.mapping[end - 1].end,
        ]);
    }
    for (const comment of parsed.comments) {
      comments.push({
        ...comment,
        start: source.mapping[comment.start].start,
        mapping: source.mapping.slice(
          comment.start,
          comment.start + comment.text.length,
        ),
        scope,
      });
    }
    for (const [start, end] of parsed.directiveIgnored) {
      if (end > start)
        nativeIgnored.push([
          source.mapping[start].start,
          source.mapping[end - 1].end,
        ]);
    }
  }
  const offsets = lineStarts(text);
  const suppressed = suppressions(
    comments,
    offsets,
    text,
    ignored,
    nativeIgnored,
  );
  const issues = [];
  for (const span of spans) {
    const raw = span.text ?? text.slice(span.start, span.end);
    const excluded = [...raw.matchAll(nonProse)].map((match) => [
      match.index,
      match.index + match[0].length,
    ]);
    for (const match of raw.matchAll(wordPattern)) {
      const word = match[0];
      const first = match.index;
      const last = first + word.length;
      const offset = span.mapping
        ? span.mapping[first].start
        : span.start + first;
      const sourceEnd = span.mapping
        ? span.mapping[last - 1].end
        : offset + word.length;
      const location = position(offsets, offset);
      if (
        !wordOnly.test(word) ||
        suppressed(location.line, offset) ||
        overlaps(excluded, first, last) ||
        overlaps(ignored, offset, sourceEnd) ||
        /&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);$/iu.test(raw.slice(0, first)) ||
        /^&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);/iu.test(raw.slice(last)) ||
        dictionary.has(word)
      ) {
        continue;
      }
      const candidates = suggestions ? dictionary.suggest(word) : [];
      const standalone =
        !/[\p{L}\p{M}\p{N}\p{Pc}](?:[.-])?$/u.test(raw.slice(0, first)) &&
        !/^(?:[.-])?[\p{L}\p{M}\p{N}\p{Pc}]/u.test(raw.slice(last));
      let fix =
        settings.autocorrect &&
        standalone &&
        span.allowFix !== false &&
        text.slice(offset, sourceEnd) === word
          ? replacement(word, candidates, dictionary)
          : undefined;
      if (
        fix &&
        span.safeReplacement &&
        !span.safeReplacement(first, word.length, fix)
      ) {
        fix = undefined;
      }
      issues.push({
        word,
        offset,
        length: sourceEnd - offset,
        ...location,
        suggestions: candidates,
        replacement: fix,
      });
    }
  }
  return issues.sort((left, right) => left.offset - right.offset);
}

export function describeIssue(issue) {
  return `Misspelled word: "${issue.word}".${
    issue.suggestions.length
      ? ` Suggestions: ${issue.suggestions.join(", ")}.`
      : ""
  }`;
}

export function applyCorrections(text, issues) {
  for (const issue of [...issues].sort(
    (left, right) => right.offset - left.offset,
  )) {
    if (issue.replacement !== undefined) {
      text =
        text.slice(0, issue.offset) +
        issue.replacement +
        text.slice(issue.offset + issue.length);
    }
  }
  return text;
}
