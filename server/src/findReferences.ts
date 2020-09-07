import { TextDocument } from "vscode-languageserver";
import { isCommentedOut } from "./isCommentedOut";
import { Entity } from "./Entity";

// Scans a document for a list of references (to labels)
export function findReferences(document: TextDocument): Entity[] {
  const { uri } = document;
  const text = document.getText();
  const found: Entity[] = [];

  const patterns = [
    // :ref:`some text <label>`
    /:ref:`[^<>`]*?<([^`>]*?)>`/gms,

    // :ref:`label`
    /:ref:`([^<>`]*?)`/gms,
  ];

  patterns.forEach((pattern) => {
    let m: RegExpExecArray | null;

    while ((m = pattern.exec(text))) {
      const range = {
        start: document.positionAt(m.index),
        end: document.positionAt(m.index + m[0].length),
      };

      // Ignore commented lines
      if (isCommentedOut(document, range)) {
        continue;
      }

      const label = m[1];

      const entity: Entity = {
        name: label,
        type: "ref",
        location: {
          uri,
          range,
        },
      };

      found.push(entity);
    }
  });

  found.sort(
    (a, b) =>
      document.offsetAt(a.location.range.start) -
      document.offsetAt(b.location.range.start)
  );

  return found;
}
