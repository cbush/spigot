import { TextDocumentChangeEvent } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { updateDocument } from "./workspace";
export function onDidChangeContentHandler(
  change: TextDocumentChangeEvent<TextDocument>
) {
  updateDocument(change.document);
}
