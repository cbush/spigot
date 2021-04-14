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
  DocumentNode,
  InterpretedTextNode,
  RstNode,
  TargetNode,
  rstPositionToRange,
} from "./RstNode";

export type ParseOptions = {
  offset?: {
    line: number;
    offset: number;
    column: number;
  };
};

export class Parser {
  /**
    Returns the result of parsing the given rST text document. Uses cached
    results based on the document version where possible.
   */
  parse = (document: TextDocument, options?: ParseOptions): DocumentNode => {
    const lastResult = this._documents.get(document.uri);
    if (
      lastResult !== undefined &&
      lastResult.meta?.version === document.version
    ) {
      return lastResult;
    }
    const result = parse(document.getText(), options);

    // Decorate the root with additional information that restructured can't
    // provide.
    result.meta = {
      flat: paintAndFlatten(result),
      uri: document.uri,
      version: document.version,
    };

    this._documents.set(document.uri, result);
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
    return (findAll(
      result as RstNode,
      (node) => node.type === "target",
      (node) => node.type !== "comment"
    ) as TargetNode[]).map((node) => ({
      location: {
        range: rstPositionToRange(node),
        uri: document.uri,
      },
      type: "rst.target",
      name: node.name,
    }));
  };

  /**
    Searches the document for section elements.
   */
  findSections = (document: TextDocument): SectionEntity[] => {
    const result = this.parse(document);
    return getSections(result, result, { documentUri: document.uri });
  };

  private _documents = new Map<DocumentUri, DocumentNode>();
}

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

/**
  Visits every node.
 */
function forEach<T extends { children?: T[] }>(
  node: T,
  callback: (node: T, index?: number) => void
) {
  let i = 0;
  findAll(node, (node) => {
    callback(node, i++);
    return true;
  });
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
  document: DocumentNode,
  section: RstNode,
  options: {
    documentUri: string;
  }
): SectionEntity[] {
  return findAll(
    section,
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
          (acc, cur) => [...acc, ...getSections(document, cur, options)],
          [] as SectionEntity[]
        ) ?? [];

      const preSectionTargets = getPreSectionTargets({
        document,
        section: node,
      });
      return {
        type: "section",
        depth: node.depth ?? 0,
        location: {
          range: rstPositionToRange(node),
          uri: options.documentUri,
        },
        name: title,
        preSectionTargets,
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

/**
  Finds targets in the document associated with the section. The restructured
  library puts targets before a section into the previous element.
 */
function getPreSectionTargets({
  document,
  section,
}: {
  document: DocumentNode;
  section: RstNode;
}): TargetEntity[] {
  assert(
    section._index !== undefined && document.meta !== undefined,
    "Tree metadata not provided after parsing!"
  );
  // Work backwards in the flat tree to collect any preceding targets.
  // TODO: Ignore comments
  const targets: TargetEntity[] = [];
  const { flat } = document.meta;
  for (let i = section._index - 1; i >= 0; --i) {
    const priorNode = flat[i];
    if (priorNode.type !== "target") {
      break;
    }
    const target = priorNode as TargetNode;
    targets.unshift({
      location: {
        range: rstPositionToRange(target),
        uri: document.meta.uri,
      },
      name: target.name,
      type: "rst.target",
    });
  }
  return targets;
}

function parse(text: string, optionsIn?: ParseOptions): DocumentNode {
  const options: ParseOptions = {
    ...(optionsIn ?? {}),
  };
  const result = restructured.parse(text, {
    position: true,
    blanklines: true,
    indent: true,
  }) as DocumentNode;

  fixRestructuredNodes(result, text, options);

  const { offset } = options;
  if (offset !== undefined) {
    // Apply the offset in case of inner parsing. Columns are SCREWED
    forEach(result as RstNode, (node) => {
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
    });
  }

  return result;
}

/**
  Assigns an index to each node and returns the flattened tree. This is useful
  when scanning the tree as a sequential document.
 */
function paintAndFlatten(result: DocumentNode): RstNode[] {
  let index = 0;
  return findAll(result as RstNode, (node) => {
    node._index = index++;
    return true;
  });
}

/**
  Iterate through the nodes returned by restructured and fix them to suit our
  needs.
 */
function fixRestructuredNodes(
  result: RstNode,
  text: string,
  options: ParseOptions
) {
  findAll(
    result,
    (node) => isDirective(node) || node.type === "comment"
  ).forEach((node) => {
    if (isDirective(node)) {
      fixDirective(node as DirectiveNode, text, options);
      return;
    }
    fixTarget(node);
  });
}

/**
  'restructured' library does not process directive inner text as rST. Run
  through directive nodes and update the child nodes.
 */
function fixDirective(
  directiveNode: DirectiveNode,
  text: string,
  options: ParseOptions
) {
  // Some directives have literal bodies. Add more here.
  if (["code-block"].includes(directiveNode.directive)) {
    return;
  }

  // TODO: Parse directive options

  const textNodes = findAll(
    directiveNode as RstNode,
    (node) => node.type === "text"
  );
  assert(
    textNodes.length === directiveNode.children?.length,
    `Assumption failed: expected 'restructured' to ONLY put text nodes in the directive nodes.
If you hit this assertion please send the rST snippet that triggered it.`
  );

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
}

/**
  'restructured' sees explicit targets as comments. Run through and replace any
  such nodes with target nodes. This will make them easier to work with later.
 */
function fixTarget(node: RstNode) {
  // `restructured` library views targets as comments
  if (node.type !== "comment") {
    return;
  }
  if (node.children === undefined || node.children.length !== 1) {
    return;
  }
  const textNode = node.children[0];
  if (
    textNode.position.start.line !== node.position.start.line ||
    textNode.type !== "text"
  ) {
    return;
  }
  const text = textNode.value;
  if (text === undefined) {
    return;
  }
  const re = /^_([^:]+):\s*$/;
  const match = re.exec(text);
  if (match === null) {
    return;
  }

  const targetNode = node as TargetNode;
  // Convert the node inline.
  targetNode.children = undefined;
  targetNode.name = match[1];
  targetNode.type = "target";
}
