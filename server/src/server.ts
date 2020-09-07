import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  WorkspaceFolder,
  InitializeResult,
  TextDocumentChangeEvent,
  TextDocumentPositionParams,
  CompletionItem,
  Range,
  CompletionItemKind,
  DeclarationParams,
  Location,
  ReferenceParams,
  DocumentLinkParams,
  DocumentLink,
} from "vscode-languageserver";
import globby = require("globby");
import { TextDocument } from "vscode-languageserver-textdocument";
import { Project } from "./Project";
import { URL } from "url";
import { readFile } from "fs";
import { findEntityAtPosition } from "./findEntityAtPosition";

class Server {
  workspaceFolders: WorkspaceFolder[] = [];
  project = new Project();

  onInitialize = (params: InitializeParams): InitializeResult => {
    this.workspaceFolders = params.workspaceFolders || [];

    const { capabilities } = params;

    const clientCapabilities = {
      diagnosticRelatedInformation:
        capabilities.textDocument?.publishDiagnostics?.relatedInformation ??
        false,
      workspaceFolders: capabilities.workspace?.workspaceFolders ?? false,
    };

    // Report server capabilities to the client.
    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        completionProvider: {
          resolveProvider: true,
        },
        declarationProvider: true,
        referencesProvider: true,
        renameProvider: true,
        documentLinkProvider: {
          resolveProvider: false,
          workDoneProgress: false,
        },
      },
    };
  };

  onInitialized = () => {
    this.workspaceFolders.forEach(this.addWorkspaceFolder);
  };

  addWorkspaceFolder = async (folder: WorkspaceFolder) => {
    const cwd = new URL(folder.uri).pathname;

    // TODO: allow configuration
    const sourceDirectory = "source/";

    const paths = await globby(sourceDirectory, {
      onlyFiles: true,
      expandDirectories: { extensions: ["txt", "yaml", "rst"] },
      cwd,
      followSymbolicLinks: false,
      ignore: ["node_modules/", "build/"],
    });

    const { project } = this;
    const promises = paths.map(
      (path): Promise<TextDocument | null> =>
        new Promise((resolve, reject) => {
          const fullPath = `${cwd}/${path}`;
          const uri = `file://${fullPath}`;
          if (project.getDocument(uri)) {
            console.log(`Already have document for ${uri} (before read)`);
            return resolve(null);
          }
          readFile(fullPath, "utf8", (err, contents) => {
            if (err) {
              console.error(`Failed to read ${fullPath}: ${err}`);
              return reject(err);
            }
            if (project.getDocument(uri)) {
              console.log(`Already have document for ${uri} (after read)`);
              return resolve(null);
            }
            const document = TextDocument.create(
              uri,
              "restructuredtext",
              0,
              contents
            );

            project.addDocument(document);

            return resolve(document);
          });
        })
    );

    Promise.all(promises).then((documents) => {
      documents.forEach((document) => {
        if (!document) {
          return;
        }
        project.updateDocument(document);
      });
    });
  };

  onDidChangeContent = (change: TextDocumentChangeEvent<TextDocument>) => {
    this.project.updateDocument(change.document);
  };

  onCompletion = (
    textDocumentPosition: TextDocumentPositionParams
  ): CompletionItem[] | null => {
    const document = this.project.getDocument(
      textDocumentPosition.textDocument.uri
    );
    if (!document) {
      return null;
    }

    const { position } = textDocumentPosition;

    // Check if you are in a :ref:
    const line = document.getText(
      Range.create(
        {
          line: position.line - 1,
          character: 0,
        },
        position
      )
    );

    if (!/:ref:`[^`]*?/gms.test(line)) {
      return null;
    }

    return this.project.declarations.map((declaration) => ({
      label: declaration.name,
      kind: CompletionItemKind.Reference,
      data: declaration,
    }));
  };

  onCompletionResolve = (item: CompletionItem): CompletionItem => {
    return {
      ...item,
      detail: "Some detail",
      documentation: "Some documentation",
    };
  };

  onDeclaration = (params: DeclarationParams): Location | null => {
    const entity = findEntityAtPosition(
      this.project,
      params.textDocument.uri,
      params.position
    );

    if (!entity) {
      return null;
    }

    const declaration = this.project.getDeclaration(entity.name);

    if (!declaration) {
      return null;
    }

    return declaration.location;
  };

  onReferences = (params: ReferenceParams): Location[] | null => {
    const entity = findEntityAtPosition(
      this.project,
      params.textDocument.uri,
      params.position
    );

    if (!entity) {
      return null;
    }

    const refs = this.project.getReferences(entity.name);

    if (!refs) {
      return null;
    }

    return refs.map((ref) => ref.location);
  };

  onDocumentLinks = (params: DocumentLinkParams): DocumentLink[] | null => {
    const { project } = this;
    const documentEntities = project.getEntitiesInDocument(
      params.textDocument.uri
    );

    if (!documentEntities) {
      return null;
    }

    return documentEntities
      .filter(
        (entity) =>
          entity.type !== "decl" && project.getDeclaration(entity.name)
      )
      .map((entity) => {
        const { location } = project.getDeclaration(entity.name)!;
        return DocumentLink.create(
          entity.location.range,
          `${location.uri}#${location.range.start.line + 1}:${
            location.range.start.character
          }`
        );
      });
  };
}

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

// Create the server.
const server = new Server();

server.project.reporter = connection;

// These handlers report the server capabilities to the client and load the workspace.
connection.onInitialize(server.onInitialize);
connection.onInitialized(server.onInitialized);

// This handler provides the initial list of the completion items.
connection.onCompletion(server.onCompletion);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(server.onCompletionResolve);

// This handler provides the declaration for a given entity.
connection.onDeclaration(server.onDeclaration);

// This handler provides the list of references to a given entity.
connection.onReferences(server.onReferences);

// This handler provides the links in a document.
connection.onDocumentLinks(server.onDocumentLinks);

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(server.onDidChangeContent);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
