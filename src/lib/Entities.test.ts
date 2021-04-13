import { strict as assert } from "assert";
import { Entities } from "./entities";
import { TextDocument } from "vscode-languageserver-textdocument";

test("can add entities", () => {
  const entities = new Entities();
  let diagnostics = entities.add({
    location: {
      uri: "test",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
    name: "some-ref",
    type: "rst.target",
  });
  expect(diagnostics).toBeUndefined();
  expect(entities.size).toBe(1);
  expect(entities.getDeclaration("some-ref")?.name).toBe("some-ref");
  expect(entities.getReferences("some-ref")).toBeUndefined();
  expect(entities.getEntitiesInDocument("test")?.length).toBe(1);

  diagnostics = entities.add({
    location: {
      uri: "test",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
    name: "some-ref",
    type: "rst.role.ref",
  });
  expect(diagnostics).toBeUndefined();
  expect(entities.size).toBe(2);
  expect(entities.getDeclaration("some-ref")?.name).toBe("some-ref");
  expect(entities.getReferences("some-ref")?.length).toBe(1);
  expect(entities.getEntitiesInDocument("test")?.length).toBe(2);
});

test("can add document targets and references", () => {
  const document = TextDocument.create(
    "test",
    "",
    0,
    `
This document has two entities. A target:

.. _some-ref:

...and a reference to :ref:\`some-ref\`.
`
  );

  const entities = new Entities();
  expect(entities.size).toBe(0);
  const targetDiagnostics = entities.addDocumentTargets(document);
  expect(targetDiagnostics.length).toBe(0);
  expect(entities.size).toBe(1);
  const referenceDiagnostics = entities.addDocumentReferences(document);
  expect(referenceDiagnostics.length).toBe(0);
  expect(entities.size).toBe(2);
  expect(entities.getEntitiesInDocument("test")?.length).toBe(2);

  const decl = entities.getDeclaration("some-ref");
  expect(decl?.name).toBe("some-ref");
  expect(decl?.location.uri).toBe("test");
  expect(decl?.location.range.start.line).toBe(3);
  expect(decl?.location.range.start.character).toBe(0);

  const references = entities.getReferences("some-ref");
  assert(references !== undefined);
  expect(references.length).toBe(1);
  expect(references[0].location.uri).toBe("test");
  expect(references[0].location.range.start.line).toBe(5);
  expect(references[0].location.range.start.character).toBe(22);
});

test("duplicate targets report error", () => {
  const document = TextDocument.create(
    "test",
    "",
    0,
    `
This document has two identical targets:

.. _some-ref:
.. _some-ref:
`
  );

  const entities = new Entities();
  expect(entities.size).toBe(0);
  const targetDiagnostics = entities.addDocumentTargets(document);
  expect(targetDiagnostics.length).toBe(1);
  expect(entities.size).toBe(1);
  expect(targetDiagnostics[0].message).toBe("Duplicate target: some-ref");
});

test("unknown targets report error", () => {
  const document = TextDocument.create(
    "test",
    "",
    0,
    `
This document has a reference to an unknown target:
:ref:\`some-unknown-target\`
`
  );

  const entities = new Entities();
  expect(entities.size).toBe(0);
  const diagnostics = entities.addDocumentReferences(document);
  expect(entities.size).toBe(0);
  expect(diagnostics.length).toBe(1);
  expect(diagnostics[0].message).toBe("Unknown target: some-unknown-target");
});

test("can't remove unknown entity", () => {
  const entities = new Entities();
  const result = entities.remove({
    location: {
      uri: "unknown",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
    },
    name: "not-a-ref",
    type: "rst.role.ref",
  });
  expect(result).toBe(false);
});
