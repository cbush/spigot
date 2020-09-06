import {
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { declarations } from "./workspace";

export function onCompletionHandler(
  _textDocumentPosition: TextDocumentPositionParams
): CompletionItem[] {
  return Array.from(declarations, ([label, declaration]) => ({
    label,
    kind: CompletionItemKind.Value,
    data: declaration,
  }));
}
