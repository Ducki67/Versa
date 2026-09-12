export interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  content: string;
}

const ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
};

function decodeEntities(input: string): string {
  if (!input.includes("&")) return input;
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1] === "x" || entity[1] === "X"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return ENTITIES[entity] ?? match;
  });
}

export function parseXml(input: string): XmlNode | null {
  const src = input;
  let pos = 0;

  function skipWhitespace() {
    while (pos < src.length && /\s/.test(src[pos]!)) pos++;
  }

  function skipProlog() {
    for (;;) {
      skipWhitespace();
      if (src.startsWith("<?", pos)) {
        const end = src.indexOf("?>", pos);
        pos = end === -1 ? src.length : end + 2;
        continue;
      }
      if (src.startsWith("<!--", pos)) {
        const end = src.indexOf("-->", pos);
        pos = end === -1 ? src.length : end + 3;
        continue;
      }
      if (src.startsWith("<!", pos)) {
        const end = src.indexOf(">", pos);
        pos = end === -1 ? src.length : end + 1;
        continue;
      }
      return;
    }
  }

  function parseName(): string {
    const start = pos;
    while (pos < src.length && !/[\s/>=]/.test(src[pos]!)) pos++;
    return src.slice(start, pos);
  }

  function parseAttributes(): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (;;) {
      skipWhitespace();
      if (pos >= src.length) break;
      const ch = src[pos];
      if (ch === ">" || ch === "/") break;

      const name = parseName();
      if (!name) {
        pos++;
        continue;
      }

      skipWhitespace();
      if (src[pos] !== "=") {
        attrs[name] = "";
        continue;
      }
      pos++;
      skipWhitespace();

      const quote = src[pos];
      if (quote === '"' || quote === "'") {
        pos++;
        const start = pos;
        while (pos < src.length && src[pos] !== quote) pos++;
        attrs[name] = decodeEntities(src.slice(start, pos));
        pos++;
      } else {
        const start = pos;
        while (pos < src.length && !/[\s/>]/.test(src[pos]!)) pos++;
        attrs[name] = decodeEntities(src.slice(start, pos));
      }
    }
    return attrs;
  }

  function parseElement(): XmlNode | null {
    skipProlog();
    if (src[pos] !== "<") return null;
    pos++;
    if (src[pos] === "/") return null;

    const name = parseName();
    if (!name) return null;

    const node: XmlNode = { name, attributes: parseAttributes(), children: [], content: "" };
    skipWhitespace();

    if (src[pos] === "/") {
      pos++;
      skipWhitespace();
      if (src[pos] === ">") pos++;
      return node;
    }
    if (src[pos] !== ">") return node;
    pos++;

    let text = "";
    for (;;) {
      if (pos >= src.length) break;

      if (src.startsWith("</", pos)) {
        const end = src.indexOf(">", pos);
        pos = end === -1 ? src.length : end + 1;
        break;
      }
      if (src.startsWith("<!--", pos)) {
        const end = src.indexOf("-->", pos);
        pos = end === -1 ? src.length : end + 3;
        continue;
      }
      if (src.startsWith("<![CDATA[", pos)) {
        const end = src.indexOf("]]>", pos);
        text += src.slice(pos + 9, end === -1 ? src.length : end);
        pos = end === -1 ? src.length : end + 3;
        continue;
      }
      if (src[pos] === "<") {
        const before = pos;
        const child = parseElement();
        if (!child) {
          pos = pos === before ? before + 1 : pos;
          continue;
        }
        node.children.push(child);
        continue;
      }

      const next = src.indexOf("<", pos);
      const stop = next === -1 ? src.length : next;
      text += decodeEntities(src.slice(pos, stop));
      pos = stop;
    }

    node.content = text.trim();
    return node;
  }

  try {
    return parseElement();
  } catch {
    return null;
  }
}

export function findChild(node: XmlNode | null | undefined, name: string): XmlNode | undefined {
  return node?.children.find((child) => child.name === name);
}

export function childContent(node: XmlNode | null | undefined, name: string): string | undefined {
  return findChild(node, name)?.content;
}

export interface XmlElement {
  name: string;
  attrs?: Record<string, string | number | boolean | undefined | null>;
  children?: (XmlElement | null | undefined | false)[];
  text?: string;
}

function escapeText(value: string): string {
  return value.replace(/[&<>]/g, (ch) => (ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : "&gt;"));
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&apos;";
    }
  });
}

export function xml(element: XmlElement): string {
  const attrs = Object.entries(element.attrs ?? {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => ` ${key}="${escapeAttr(String(value))}"`)
    .join("");

  const children = (element.children ?? []).filter(Boolean) as XmlElement[];
  const hasText = element.text !== undefined && element.text !== "";

  if (!children.length && !hasText) return `<${element.name}${attrs}/>`;

  const inner = hasText ? escapeText(element.text!) : children.map(xml).join("");
  return `<${element.name}${attrs}>${inner}</${element.name}>`;
}

export function isJSON(value: string | undefined): boolean {
  if (!value) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}