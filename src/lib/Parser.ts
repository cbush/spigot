import { strict as assert } from "assert";
import restructured from "restructured";
import { DocumentUri, TextDocument } from "vscode-languageserver-textdocument";
import {
  ReferenceEntity,
  SectionEntity,
  SeeAlsoEntity,
  TargetEntity,
} from "./Entity";
import {
  DirectiveNode,
  InterpretedTextNode,
  RstNode,
  rstPositionToRange,
} from "./RstNode";

export type ParseOptions = {
  offset?: {
    line: number;
    offset: number;
    column: number;
  };
};

type DocumentVersion = number;

function isDirective(node: RstNode, directiveName?: string): boolean {
  return (
    node.type === "directive" &&
    (directiveName === undefined ||
      (node as DirectiveNode).directive === directiveName)
  );
}

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

function getSeeAlsos(
  node: RstNode,
  options: {
    documentUri: string;
    enterSubtree?: (node: RstNode) => boolean;
  }
): SeeAlsoEntity[] {
  const directiveNodes = findAll(
    node,
    (node) => isDirective(node, "seealso"),
    (innerNode) =>
      innerNode.type !== "comment" &&
      (!options.enterSubtree || options.enterSubtree(node))
  ) as DirectiveNode[];
  return directiveNodes.map(
    (node): SeeAlsoEntity => ({
      location: {
        range: rstPositionToRange(node),
        uri: options.documentUri,
      },
      name: "See Also",
      type: "seealso",
      refs: getRefs(node, {
        documentUri: options.documentUri,
      }),
    })
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
    (node) =>
      !["comment", "section"].includes(node.type) &&
      !isDirective(node, "seealso")
  ).map(
    (node): SectionEntity => {
      const title = getTitle(node) ?? "";
      const text = getContentText(node);

      // Inline refs are all refs in the body text except in the seealsos and
      // subsections.
      const inlineRefs = getRefs(node, {
        documentUri: options.documentUri,
        enterSubtree: (innerNode) =>
          !isDirective(innerNode, "seealso") &&
          (innerNode.type !== "section" || innerNode === node),
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
        inlineRefs,
        subsections,
        text,
        seeAlsos: getSeeAlsos(node, {
          documentUri: options.documentUri,
          enterSubtree: (innerNode) =>
            innerNode.type !== "section" || innerNode === node,
        }),
      };
    }
  );
}

function parse(text: string, optionsIn?: ParseOptions): RstNode {
  const options: ParseOptions = {
    ...(optionsIn ?? {}),
  };
  const result = restructured.parse(text, {
    position: true,
    blanklines: true,
    indent: true,
  }) as RstNode;

  // 'restructured' library does not process inner text as rST.
  // Run through directive nodes and update the child nodes.
  findAll(result, isDirective).forEach((directiveNode) => {
    // Some directives have literal bodies. Add more here.
    if (["code-block"].includes((directiveNode as DirectiveNode).directive)) {
      return;
    }

    // TODO: Parse directive options

    const textNodes = findAll(directiveNode, (node) => node.type === "text");
    // Check the assumption that 'restructured' will ONLY put text nodes in the
    // directive nodes. If you hit this assertion please send the rST snippet
    // that triggered it.
    assert(textNodes.length === directiveNode.children?.length);

    if (textNodes.length === 0) {
      return;
    }

    // 'restructured' does not include newline information in the inner text
    // nodes of the directive node. This makes them useless for reconstructing
    // the rST, so instead we'll extract the raw text from the original input
    // string. See https://github.com/seikichi/restructured/issues/5
    const { start, end } = directiveNode.position;
    const lines = text.substring(start.offset, end.offset).split("\n");
    // The first line is the directive itself, so remove it.
    const directiveLine = lines.shift();
    assert(directiveLine !== undefined);
    const indentOffset = directiveNode.indent?.offset ?? 0;
    const innerText = lines.join("\n");

    const innerOptions = {
      ...options,
      offset: {
        // Line and column are 1-based. Offsets must be 0-based for addition, so
        // convert by subtracting 1. But we removed the directive line, so we add 1
        // again. Net result = start.line + 0
        line: start.line,
        column: 0,
        offset: start.offset + directiveLine.length,
      },
    };
    // Do not re-add options.offset to the innerOptions.offset.
    // Each recursion layer will add its own offset.
    const innerResult = parse(innerText, innerOptions);
    if (innerResult.children === undefined) {
      return;
    }
    directiveNode.children = innerResult.children.reduce(
      (acc, cur) => [...acc, ...(cur.children ?? [])],
      [] as RstNode[]
    );
  });

  const { offset } = options;
  if (offset !== undefined) {
    // Apply the offset in case of inner parsing. Columns are SCREWED
    findAll(result, (node) => {
      const originalPosition = node.position;
      node.position = {
        start: {
          column: originalPosition.start.column + offset.column,
          offset: originalPosition.start.offset + offset.offset,
          line: originalPosition.start.line + offset.line,
        },
        end: {
          offset: originalPosition.end.offset + offset.offset,
          line: originalPosition.end.line + offset.line,
          column: originalPosition.end.column + offset.column,
        },
      };
      return false;
    });
  }

  return result;
}

export class Parser {
  /**
    Returns the result of parsing the given rST text document. Uses cached
    results based on the document version where possible.
   */
  parse = (document: TextDocument, options?: ParseOptions): RstNode => {
    const entry = this._documents.get(document.uri);
    if (entry !== undefined) {
      const [lastParsedVersion, lastResult] = entry;
      if (lastParsedVersion === document.version) {
        return lastResult;
      }
    }
    const result = parse(document.getText(), options);
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
