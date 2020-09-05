// Desired functionality:
// - Report duplicate refs
// - Report unknown refs
// - Code completion for refs
// - "Go to declaration" for refs https://code.visualstudio.com/api/references/vscode-api#DeclarationProvider
// - "Find references" for refs https://code.visualstudio.com/api/references/vscode-api#ReferenceProvider

import { Range } from "vscode-languageserver-textdocument";
import { TextDocument } from "vscode-languageserver";

type Name = string;
interface Declaration {
  name: Name;
  textDocument: TextDocument;
  range: Range;
}

export const declarations = new Map<Name, Declaration>();

export function findLabels(textDocument: TextDocument) {
  let text = textDocument.getText();
  let pattern = /.. _([A-z-]+):/g;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(text))) {
    const start = textDocument.positionAt(m.index);
    const end = textDocument.positionAt(m.index + m[0].length);
    const name = m[1];
    declarations.set(name, {
      name,
      textDocument,
      range: {
        start,
        end,
      },
    });
  }
}
