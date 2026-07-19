import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

async function* recordsFromChunks(chunks) {
  let row = [];
  let field = "";
  let quoted = false;
  let pendingQuote = false;

  for await (const chunk of chunks) {
    const text = chunk.toString("utf8");

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (pendingQuote) {
        pendingQuote = false;
        if (char === '"') {
          field += '"';
          continue;
        }
        quoted = false;
      }

      if (quoted) {
        if (char === '"') {
          if (index === text.length - 1) {
            pendingQuote = true;
          } else if (text[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            quoted = false;
          }
        } else {
          field += char;
        }
        continue;
      }

      if (char === '"' && field.length === 0) {
        quoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field.replace(/\r$/, ""));
        yield row;
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
  }

  if (pendingQuote) quoted = false;
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    yield row;
  }
}

export async function* parseCsv(chunks) {
  let headers;
  for await (const fields of recordsFromChunks(chunks)) {
    if (!headers) {
      headers = fields.map((field, index) =>
        index === 0 ? field.replace(/^\uFEFF/, "") : field,
      );
      continue;
    }
    if (fields.length === 1 && fields[0] === "") continue;
    const row = {};
    headers.forEach((header, index) => {
      row[header] = fields[index] ?? "";
    });
    yield row;
  }
}

export function csvFile(path) {
  return parseCsv(createReadStream(path));
}

export async function csvUrl(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "BeforeYouDip/1.0 public-data-prototype" },
  });
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download ${url}: ${response.status}`);
  }
  return parseCsv(Readable.fromWeb(response.body));
}

