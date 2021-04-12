import restructured from "restructured";
import { DocumentUri, TextDocument } from "vscode-languageserver-textdocument";
import { Entity } from "./Entity";
import { InterpretedTextNode, RstNode, rstPositionToRange } from "./RstNode";

type DocumentVersion = number;

/*
  Searches a tree depth-first and collects all nodes that match the given
  predicate. 

  The optional enterSubtree predicate can prevent the search from entering the
  current node subtree by returning false.
 */
function findAll(
  node: RstNode,
  predicate: (node: RstNode) => boolean,
  enterSubtree?: (node: RstNode) => boolean
): RstNode[] {
  const result: RstNode[] = [];
  if (predicate(node)) {
    result.push(node);
  }
  if (enterSubtree && !enterSubtree(node)) {
    return result;
  }
  if (node.children !== undefined) {
    node.children.forEach((child) => {
      result.push(...findAll(child, predicate));
    });
  }
  return result;
}

export class Parser {
  /*
    Returns the result of parsing the given rST text document. Uses cached
    results based on the document version where possible.
   */
  parse = (document: TextDocument): RstNode => {
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
    }) as RstNode;
    this._documents.set(document.uri, [document.version, result]);
    return result;
  };

  findReferences = (document: TextDocument): Entity[] => {
    const result = this.parse(document);
    const nodes = findAll(
      result,
      (node) => {
        if (node.type !== "interpreted_text") {
          return false;
        }
        const interpretedTextNode = node as InterpretedTextNode;
        if (interpretedTextNode.role !== "ref") {
          return false;
        }
        return true;
      },
      (node) => node.type !== "comment"
    ) as InterpretedTextNode[];
    return nodes.map(
      (node): Entity => {
        const text = node.children.map((textNode) => textNode.value).join("\n");
        const match = /<([^>]*)>/m.exec(text);
        const name = match === null ? text : match[1];
        return {
          location: {
            range: rstPositionToRange(node),
            uri: document.uri,
          },
          type: "rst.role.ref",
          name,
        };
      }
    );
  };

  private _documents = new Map<DocumentUri, [DocumentVersion, RstNode]>();
}
