import katex from "katex";

function titleParts(title: string) {
  const parts: { math: boolean; value: string }[] = [];
  let textStart = 0;
  let index = 0;

  while (index < title.length) {
    if (title[index] === "\\" && title[index + 1] === "(") {
      const end = title.indexOf("\\)", index + 2);
      if (end !== -1) {
        if (index > textStart) parts.push({ math: false, value: title.slice(textStart, index) });
        parts.push({ math: true, value: title.slice(index + 2, end) });
        index = end + 2;
        textStart = index;
        continue;
      }
    }

    if (title[index] === "$" && title[index - 1] !== "\\") {
      let end = index + 1;
      while (end < title.length && (title[end] !== "$" || title[end - 1] === "\\")) end += 1;
      if (end < title.length) {
        if (index > textStart) parts.push({ math: false, value: title.slice(textStart, index) });
        parts.push({ math: true, value: title.slice(index + 1, end) });
        index = end + 1;
        textStart = index;
        continue;
      }
    }

    index += 1;
  }

  if (textStart < title.length) parts.push({ math: false, value: title.slice(textStart) });
  return parts.length > 0 ? parts : [{ math: false, value: title }];
}

export function MathTitle({ title }: { title: string }) {
  return titleParts(title).map((part, index) => part.math ? (
    <span
      className="title-inline-math"
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(part.value, {
          displayMode: false,
          output: "html",
          strict: false,
          throwOnError: false,
          trust: false,
        }),
      }}
      key={`${index}-${part.value}`}
    />
  ) : part.value);
}
