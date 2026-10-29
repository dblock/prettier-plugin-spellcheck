import { parsers } from "prettier/plugins/markdown";
import {
  getDictionary,
  isDictionaryFile,
  normalizeApostrophes,
  wordOnly,
} from "./dictionaries.mjs";
import { spellingSettings } from "./configuration.mjs";
import { frontMatterSpans } from "./front-matter.mjs";
import { codeParsers, codeSpans } from "./code.mjs";
import { textParser } from "./text.mjs";
import { fenceSource } from "./fences.mjs";
import { htmlSpans } from "./html.mjs";

const wordPattern =
  /[\p{L}\p{M}\p{N}\p{Pc}]+(?:['’][\p{L}\p{M}\p{N}\p{Pc}]+)*/gu;
const nonProse =
  /(?:https?:\/\/|mailto:|www\.)[^\s<>]+|[\p{L}\p{N}_.+-]+@[\p{L}\p{N}_.-]+/giu;
const entities = /&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);/giu;
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

function templateRanges(text, excluded) {
  const ignored = [];
  let cursor = 0;
  const opener = /\{\{|\{%/gu;
  while (cursor < text.length) {
    opener.lastIndex = cursor;
    const match = opener.exec(text);
    if (!match) break;
    const containing = excluded.find(
      ([first, last]) => match.index >= first && match.index < last,
    );
    if (containing) {
      cursor = containing[1];
      continue;
    }
    const closing = text.indexOf(
      match[0] === "{{" ? "}}" : "%}",
      match.index + 2,
    );
    if (closing === -1) cursor = match.index + 2;
    else {
      ignored.push([match.index, closing + 2]);
      cursor = closing + 2;
    }
  }
  return ignored;
}

async function markdownSpans(text, frontMatter, checkFences = false) {
  const ast = await parsers.markdown.parse(text, { parser: "markdown" });
  const spans = [];
  const ignored = [];
  const code = [];
  const comments = [];
  const fences = [];
  const markup = [];
  async function visit(node, base = 0) {
    const start = base + node.position.start.offset;
    const end = base + node.position.end.offset;
    if (node.type === "frontMatter") {
      spans.push(...frontMatterSpans(text, node, frontMatter));
    } else if (node.type === "code" || node.type === "inlineCode") {
      code.push([start, end]);
      if (checkFences && node.type === "code") {
        const fence = fenceSource(text, node, start, end);
        if (fence) fences.push(fence);
      }
    } else if (node.type === "text") {
      spans.push({ start, end });
      const raw = text.slice(start, end);
      for (const match of raw.matchAll(
        /<!--\s*(?:markdownlint|spellcheck)[-:]/gu,
      )) {
        const first = start + match.index;
        if (
          overlaps(markup, first, first + 1) ||
          /\\*$/u.exec(text.slice(0, first))[0].length % 2
        ) {
          continue;
        }
        const closing = text.indexOf("-->", first + match[0].length);
        if (closing !== -1) {
          const last = closing + 3;
          comments.push({ text: text.slice(first, last), start: first });
          markup.push([first, last]);
        }
      }
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
  ignored.push(...templateRanges(text, code));
  return {
    spans,
    ignored,
    comments,
    fences,
    markup,
    directiveIgnored: [
      ...code,
      ...markup,
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
  {
    suggestions = true,
    parser = "markdown",
    excludeDictionaries = [],
    ...parserOptions
  } = {},
) {
  if (text.startsWith("\uFEFF")) {
    const issues = await checkSource(text.slice(1), config, {
      suggestions,
      parser,
      excludeDictionaries,
      ...parserOptions,
    });
    return issues.map((issue) => ({ ...issue, offset: issue.offset + 1 }));
  }
  const settings = spellingSettings(config);
  if (!settings.enabled) {
    return [];
  }
  if (
    !["markdown", "html", textParser].includes(parser) &&
    !Object.hasOwn(codeParsers, parser)
  ) {
    throw new Error(`Unsupported spelling parser: ${parser}.`);
  }
  if (parser === "html" && !settings.html) return [];
  if (
    parser === textParser &&
    isDictionaryFile(settings.dictionaries, parserOptions.filepath)
  ) {
    return [];
  }
  const dictionary = getDictionary(settings.dictionaries, {
    exclude: excludeDictionaries,
  });
  const context = Object.hasOwn(codeParsers, parser)
    ? await codeSpans(text, parser, parserOptions, settings.code)
    : parser === textParser
      ? {
          spans: [{ start: 0, end: text.length, literal: true }],
          ignored: [],
          comments: [],
        }
      : parser === "html"
        ? await htmlSpans(text, parserOptions)
        : await markdownSpans(text, settings.frontMatter, settings.code.fences);
  const { spans, ignored, comments } = context;
  if (parser === "html") ignored.push(...templateRanges(text, ignored));
  const fences = context.fences || [];
  const markup = context.markup || [];
  const nativeIgnored = [];
  for (const source of context.prose || []) {
    nativeIgnored.push(...source.directiveIgnored);
    if (!source.mapping.length) continue;
    const parsed = await markdownSpans(
      source.text,
      false,
      settings.code.fences && source.enabled,
    );
    const scope = {
      start: source.mapping[0].start,
      end: source.mapping.at(-1).end,
    };
    for (const span of parsed.spans) {
      if (!source.enabled) continue;
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
    for (const [start, end] of parsed.markup) {
      markup.push([source.mapping[start].start, source.mapping[end - 1].end]);
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
    for (const fence of parsed.fences) {
      fences.push({
        ...fence,
        start: source.mapping[fence.start].start,
        end: source.mapping[fence.end - 1].end,
        mapping: fence.mapping.map(({ start, end }) => ({
          start: source.mapping[start].start,
          end: source.mapping[Math.max(start, end - 1)].end,
        })),
      });
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
    const excluded = [
      ...raw.matchAll(nonProse),
      ...(span.literal ? [] : raw.matchAll(entities)),
    ].map((match) => [match.index, match.index + match[0].length]);
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
        overlaps(markup, offset, sourceEnd) ||
        (!span.literal &&
          (/&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);$/iu.test(raw.slice(0, first)) ||
            /^&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);/iu.test(raw.slice(last)))) ||
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
  for (const fence of fences) {
    if (
      !fence.text ||
      [...ignored, ...markup].some(
        ([first, last]) => first <= fence.start && last >= fence.end,
      ) ||
      lineStarts(fence.text)
        .filter((offset) => offset < fence.mapping.length)
        .every((offset) => {
          const first = fence.mapping[offset].start;
          return suppressed(position(offsets, first).line, first);
        })
    ) {
      continue;
    }
    let findings;
    try {
      findings = await checkSource(
        fence.text,
        { ...settings, code: { ...settings.code, fences: false } },
        {
          ...parserOptions,
          parser: fence.parser,
          filepath: `${parserOptions.filepath || "fence"}.${fence.language}`,
          suggestions,
          excludeDictionaries,
        },
      );
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new Error(
        `Invalid ${fence.language} code fence at line ${position(offsets, fence.start).line}: ${error.message}`,
        { cause: error },
      );
    }
    for (const issue of findings) {
      const offset = fence.mapping[issue.offset].start;
      const end = fence.mapping[issue.offset + issue.length - 1].end;
      const location = position(offsets, offset);
      if (
        suppressed(location.line, offset) ||
        overlaps(ignored, offset, end) ||
        overlaps(markup, offset, end)
      ) {
        continue;
      }
      issues.push({
        ...issue,
        offset,
        length: end - offset,
        ...location,
        replacement:
          text.slice(offset, end) === issue.word
            ? issue.replacement
            : undefined,
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
