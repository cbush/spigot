import { CompletionItem } from "vscode-languageserver";
export function onCompletionResolveHandler(
  item: CompletionItem
): CompletionItem {
  return {
    ...item,
    detail: "Some detail",
    documentation: "Some documentation",
  };
}
