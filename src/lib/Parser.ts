import restructured from "restructured";
import { DocumentUri, TextDocument } from "vscode-languageserver-textdocument";
import { ReferenceEntity, SectionEntity, TargetEntity } from "./Entity";
import { InterpretedTextNode, RstNode, rstPositionToRange } from "./RstNode";

type DocumentVersion = number;

/**
  Searches a tree depth first and collects all nodes that match the given
  predicate. 

  The optional enterSubtree predicate can prevent the search from entering the
  current node subtree by returning false.
 */
function findAll<T extends { children?: T[] }>(
  node: T,
  predicate: (node: T) => boolean,
  enterSubtree?: (node: T) => boolean
): T[] {
  const result: T[] = [];
  if (predicate(node)) {
    result.push(node);
  }
  if (enterSubtree && !enterSubtree(node)) {
    return result;
  }
  if (node.children !== undefined) {
    node.children.forEach((child) => {
      result.push(...findAll(child, predicate, enterSubtree));
    });
  }
  return result;
}

function findFirst<T extends { children?: T[] }>(
  node: T,
  predicate: (node: T) => boolean,
  enterSubtree?: (node: T) => boolean
): T | undefined {
  if (predicate(node)) {
    return node;
  }
  if (node.children === undefined || (enterSubtree && !enterSubtree(node))) {
    return undefined;
  }
  for (const child of node.children) {
    const match = findFirst(child, predicate, enterSubtree);
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
}

function getTitle(node: RstNode): string | undefined {
  const titleNode = findFirst(
    node,
    (node) => node.type === "title",
    (node) => node.type !== "comment"
  );
  if (titleNode === undefined) {
    return undefined;
  }
  const textNode = findFirst(titleNode, (node) => node.type === "text");
  if (textNode === undefined) {
    return undefined;
  }
  return textNode.value;
}

function getContentText(node: RstNode): string {
  const textNodes = findAll(
    node,
    (node) => node.type === "text",
    (innerNode) =>
      innerNode.type !== "comment" &&
      innerNode.type !== "title" &&
      (innerNode === node || innerNode.type !== "section") // Don't enter subsections
  );
  return textNodes.map((node) => node.value ?? "").join("");
}

function getRefs(
  node: RstNode,
  options: {
    documentUri: string;
    enterSubtree?: (node: RstNode) => boolean;
  }
): ReferenceEntity[] {
  const nodes = findAll(
    node,
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
    (node) =>
      node.type !== "comment" &&
      (!options.enterSubtree || options.enterSubtree(node))
  ) as InterpretedTextNode[];
  return nodes.map(
    (node): ReferenceEntity => {
      const text = node.children.map((textNode) => textNode.value).join("\n");
      const match = /<([^>]*)>/m.exec(text);
      const name = match === null ? text : match[1];
      return {
        location: {
          range: rstPositionToRange(node),
          uri: options.documentUri,
        },
        type: "rst.role.ref",
        name,
      };
    }
  );
}

function getSections(
  node: RstNode,
  options: {
    documentUri: string;
  }
): SectionEntity[] {
  return findAll(
    node,
    (node) => node.type === "section",
    (node) => node.type !== "comment" && node.type !== "section" // Do not enter inner sections
  ).map(
    (node): SectionEntity => {
      const title = getTitle(node) ?? "";
      const text = getContentText(node);
      const refs = getRefs(node, {
        documentUri: options.documentUri,
        enterSubtree: (innerNode) =>
          innerNode === node || innerNode.type !== "section",
      });
      const subsections =
        node.children?.reduce(
          (acc, cur) => [...acc, ...getSections(cur, options)],
          [] as SectionEntity[]
        ) ?? [];
      return {
        type: "section",
        depth: node.depth ?? 0,
        location: {
          range: rstPositionToRange(node),
          uri: options.documentUri,
        },
        name: title,
        preSectionTargets: [],
        refs,
        subsections,
        text,
      };
    }
  );
}

export class Parser {
  /**
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

  /**
    Searches the document for ref-roles.
   */
  findReferences = (document: TextDocument): ReferenceEntity[] => {
    const result = this.parse(document);
    return getRefs(result, { documentUri: document.uri });
  };

  /**
    Searches the document for targets that refs can link to.
   */
  findTargets = (document: TextDocument): TargetEntity[] => {
    const result = this.parse(document);
    const entities: TargetEntity[] = [];
    findAll(result, (node) => {
      // `restructured` library views targets as comments
      if (node.type !== "comment") {
        return false;
      }
      if (node.children === undefined || node.children.length !== 1) {
        return false;
      }
      const textNode = node.children[0];
      if (
        textNode.position.start.line !== node.position.start.line ||
        textNode.type !== "text"
      ) {
        return false;
      }
      const text = textNode.value;
      if (text === undefined) {
        return false;
      }
      const re = /^_([^:]+):\s*$/;
      const match = re.exec(text);
      if (match === null) {
        return false;
      }
      const name = match[1];
      const range = rstPositionToRange(node);
      entities.push({
        location: {
          range,
          uri: document.uri,
        },
        type: "rst.target",
        name,
      });
      return true;
    });
    return entities;
  };

  /**
    Searches the document for section elements.
   */
  findSections = (document: TextDocument): SectionEntity[] => {
    const result = this.parse(document);
    return getSections(result, { documentUri: document.uri });
  };

  private _documents = new Map<DocumentUri, [DocumentVersion, RstNode]>();
}
