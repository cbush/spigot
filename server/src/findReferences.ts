import { TextDocument } from "vscode-languageserver";
import { isCommentedOut } from "./isCommentedOut";
import { Entity } from "./Entity";

export function findReferences(textDocument: TextDocument) {
  const { uri } = textDocument;
  const text = textDocument.getText();
  const found: Entity[] = [];

  // :ref:`some text <label>`
  const labelAndTextPattern = /:ref:`[^<>]*?<([^`>]*?)>`/gms;

  // :ref:`label`
  const labelPattern = /:ref:`([^<>`]*?)`/gms;

  let m: RegExpExecArray | null;

  while ((m = labelAndTextPattern.exec(text) || labelPattern.exec(text))) {
    const range = {
      start: textDocument.positionAt(m.index),
      end: textDocument.positionAt(m.index + m[0].length),
    };

    // Ignore commented lines
    if (isCommentedOut(textDocument, range)) {
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

  return found;
}
