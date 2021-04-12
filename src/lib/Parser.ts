import restructured from "restructured";
import { DocumentUri, TextDocument } from "vscode-languageserver-textdocument";
import { ParsedRst } from "./ParsedRst";

type DocumentVersion = number;

export class Parser {
  /*
    Returns the result of parsing the given rST text document. Uses cached
    results based on the document version where possible.
   */
  parse = (document: TextDocument): ParsedRst => {
    const entry = this._documents.get(document.uri);
    if (entry !== undefined) {
      const [lastParsedVersion, lastResult] = entry;
      if (lastParsedVersion === document.version) {
        return lastResult;
      }
    }
    const result = restructured.parse(document.getText(), {
      position: true,
      blanklines: false,
      indent: false,
    }) as ParsedRst;
    this._documents.set(document.uri, [document.version, result]);
    return result;
  };

  private _documents = new Map<DocumentUri, [DocumentVersion, ParsedRst]>();
}
