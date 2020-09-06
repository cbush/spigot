import { TextDocumentChangeEvent } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { validateTextDocument } from "./validateTextDocument";
import { updateDocument } from "./workspace";
export function onDidChangeContentHandler(
  change: TextDocumentChangeEvent<TextDocument>
) {
  validateTextDocument(change.document);
  updateDocument(change.document);
}
