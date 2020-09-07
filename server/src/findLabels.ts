import { TextDocument } from "vscode-languageserver";
import { Entity } from "./Entity";
import { isCommentedOut } from "./isCommentedOut";

export function findLabels(textDocument: TextDocument): Entity[] {
  let text = textDocument.getText();
  let pattern = /\.\. _([A-z-]+):/g;
  let m: RegExpExecArray | null;

  const { uri } = textDocument;

  const found: Entity[] = [];

  while ((m = pattern.exec(text))) {
    const start = textDocument.positionAt(m.index);
    const end = textDocument.positionAt(m.index + m[0].length);

    // Ignore commented lines
    if (isCommentedOut(textDocument, { start, end })) {
      continue;
    }

    const label = m[1];
    const entity: Entity = {
      name: label,
      type: "decl",
      location: {
        uri,
        range: {
          start,
          end,
        },
      },
    };
    found.push(entity);
  }
  return found;
}
