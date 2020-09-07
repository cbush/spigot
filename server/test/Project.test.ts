import { Project } from "../src/Project";
import { TextDocument } from "vscode-languageserver-textdocument";

test("can add and update documents", () => {
  const project = new Project();

  expect(project.documentCount).toBe(0);

  const document = TextDocument.create(
    "test",
    "",
    0,
    `
This document has two entities. A label:

.. _some-ref:

...and a reference to :ref:\`some-ref\`.
`
  );

  project.addDocument(document);

  expect(project.documentCount).toBe(1);
  expect(project.getDocument("test")).toBeDefined();

  // Only one document entry per URI
  project.addDocument(document);
  expect(project.documentCount).toBe(1);

  // Declarations are populated on add
  const decl = project.getDeclaration("some-ref");
  expect(decl.name).toBe("some-ref");
  expect(decl.location.uri).toBe("test");
  expect(decl.location.range.start.line).toBe(3);
  expect(decl.location.range.start.character).toBe(0);

  expect(project.getEntitiesInDocument("test").length).toBe(2);

  // TODO: This could change, but currently references don't get populated until the first update
  project.updateDocument(document);
  const references = project.getReferences("some-ref");
  expect(references.length).toBe(1);
  expect(references[0].location.uri).toBe("test");
  expect(references[0].location.range.start.line).toBe(5);
  expect(references[0].location.range.start.character).toBe(22);
});

test("can remove documents", () => {
  const project = new Project();

  expect(project.documentCount).toBe(0);

  const document = TextDocument.create(
    "test",
    "",
    0,
    `
This document has two entities. A label:

.. _some-ref:

...and a reference to :ref:\`some-ref\`.
`
  );
  project.updateDocument(document);

  const document2 = TextDocument.create(
    "test2",
    "",
    0,
    `
This document has :ref:\`some-ref\` to another document.
`
  );
  project.updateDocument(document2);

  expect(project.documentCount).toBe(2);
  expect(project.getEntitiesInDocument("test").length).toBe(2);
  expect(project.getEntitiesInDocument("test2").length).toBe(1);
  const decl = project.getDeclaration("some-ref");
  expect(decl.name).toBe("some-ref");
  const references = project.getReferences("some-ref");
  expect(references.length).toBe(2);

  project.removeDocument(document.uri);
  expect(project.documentCount).toBe(1);
  expect(project.getEntitiesInDocument("test")).toBeUndefined();
  expect(project.getDeclaration("some-ref")).toBeUndefined();
  expect(project.getReferences("some-ref").length).toBe(1);

  project.removeDocument(document2.uri);
  expect(project.documentCount).toBe(0);
  expect(project.getReferences("some-ref")).toBeUndefined();
});
