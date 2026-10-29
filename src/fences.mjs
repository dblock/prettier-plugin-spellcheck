const languages = new Map([
  ["js", "babel"],
  ["javascript", "babel"],
  ["jsx", "babel"],
  ["mjs", "babel"],
  ["cjs", "babel"],
  ["ts", "typescript"],
  ["typescript", "typescript"],
  ["tsx", "typescript"],
  ["flow", "flow"],
]);

export function fenceSource(text, node, start, end) {
  const language = node.lang?.toLowerCase();
  const parser = languages.get(language);
  if (!parser) return undefined;
  const mapping = [];
  if (node.value) {
    const rawLines = [
      ...text.slice(start, end).matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/gu),
    ];
    const lines = node.value.split("\n");
    for (const [index, line] of lines.entries()) {
      const raw = rawLines[index + 1];
      if (!raw) throw new Error(`Cannot locate code fence at offset ${start}.`);
      const content = raw[0].replace(/(?:\r\n|\r|\n)$/u, "");
      let common = 0;
      while (
        common < Math.min(content.length, line.length) &&
        content.at(-common - 1) === line.at(-common - 1)
      ) {
        common++;
      }
      const prefix = line.length - common;
      if (line.slice(0, prefix).trim()) {
        throw new Error(`Cannot map code fence at offset ${start}.`);
      }
      const first = start + raw.index;
      const matched = first + content.length - common;
      for (let unit = 0; unit < line.length; unit++) {
        const offset = matched + unit - prefix;
        mapping.push(
          unit < prefix
            ? { start: first, end: matched }
            : { start: offset, end: offset + 1 },
        );
      }
      if (index < lines.length - 1) {
        mapping.push({
          start: first + content.length,
          end: first + raw[0].length,
        });
      }
    }
  }
  return { text: node.value, mapping, start, end, parser, language };
}
