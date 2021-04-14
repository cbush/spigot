import { TextDocument } from "vscode-languageserver-textdocument";
import { Parser } from "./Parser";

describe("findSections", () => {
  it("finds sections", () => {
    const parser = new Parser();
    const document = TextDocument.create(
      "test",
      "",
      0,
      `This document has one section

==============
It's a Section
==============

This is the section text.
`
    );

    const sections = parser.findSections(document);
    expect(sections.length).toBe(1);
    const section = sections[0];
    expect(section.depth).toBe(1);
    expect(section.name).toBe("It's a Section");
    expect(section.text).toBe("This is the section text.\n");
  });

  it("finds subsections", () => {
    const parser = new Parser();
    const document = TextDocument.create(
      "test",
      "",
      0,
      `This document has one section with a subsection

==============
It's a Section
==============

This is the section text.

Subsection
----------

This is the subsection text.

.. code-block::
   
   Directives will be included.


.. 
   Ignore this comment

And here's some more text.

.. _another-subsection:

Another Subsection
------------------

This is the other subsection text.

`
    );

    const sections = parser.findSections(document);
    expect(sections.length).toBe(1);
    const section = sections[0];
    expect(section.depth).toBe(1);
    expect(section.name).toBe("It's a Section");
    expect(section.text).toBe("This is the section text.\n");
    const { subsections } = section;
    expect(subsections.length).toBe(2);
    expect(subsections[0].depth).toBe(2);
    expect(subsections[0].name).toBe("Subsection");
    expect(subsections[0].text).toBe(`This is the subsection text.
Directives will be included.And here's some more text.
`);
    expect(subsections[1].depth).toBe(2);
    expect(subsections[1].name).toBe("Another Subsection");
    expect(subsections[1].subsections.length).toBe(0);
    expect(subsections[1].text).toBe("This is the other subsection text.\n");
    expect(subsections[0].inlineRefs).toStrictEqual([]);
  });

  it("finds refs in the section but not seealsos", () => {
    const parser = new Parser();
    const document = TextDocument.create(
      "test",
      "",
      0,
      `
==============
It's a Section
==============

Here's a :ref:\`link <to-something>\`.

Subsection
----------

Here's another :ref:\`link <to-something-else>\`.

.. seealso::

   Please :ref:\`don't include this <link>\`
`
    );

    const sections = parser.findSections(document);
    expect(sections.length).toBe(1);
    const section = sections[0];
    expect(section.depth).toBe(1);
    expect(section.name).toBe("It's a Section");
    expect(section.text).toBe("Here's a link <to-something>.\n");
    expect(section.inlineRefs.length).toBe(1);
    expect(section.inlineRefs[0].name).toBe("to-something");
    const { subsections } = section;
    expect(subsections.length).toBe(1);
    expect(subsections[0].depth).toBe(2);
    expect(subsections[0].name).toBe("Subsection");
    expect(subsections[0].inlineRefs[0].name).toBe("to-something-else");
    expect(subsections[0].seeAlsos.length).toBe(1);
    expect(subsections[0].seeAlsos[0].refs.length).toBe(1);
    expect(subsections[0].seeAlsos[0].refs[0].name).toBe("link");
    expect(subsections[0].preSectionTargets).toStrictEqual([]);
  });

  it("finds leading targets before the section", () => {
    const parser = new Parser();
    const document = TextDocument.create(
      "test",
      "",
      0,
      `.. _first-target:

Section
=======

.. _alias1:
.. _alias2:

Subsection
----------

.. seealso::

   Why doesn't this work :ref:\`don't include this <link>\`

.. _another-target:

Section 2
=========

Text

.. _alias:

.. this is a comment

.. _target:

Section 3
=========

Text
`
    );

    const sections = parser.findSections(document);
    expect(sections.length).toBe(3);
    let section = sections[0];
    expect(section.preSectionTargets.length).toBe(1);
    expect(section.preSectionTargets[0].name).toBe("first-target");
    expect(section.subsections[0].preSectionTargets.length).toBe(2);
    expect(section.subsections[0].preSectionTargets[0].name).toBe("alias1");
    expect(section.subsections[0].preSectionTargets[1].name).toBe("alias2");
    section = sections[1];
    expect(section.preSectionTargets.length).toBe(1);
    expect(section.preSectionTargets[0].name).toBe("another-target");
    section = sections[2];

    // It does not respect comments
    expect(section.preSectionTargets.length).toBe(1);
    expect(section.preSectionTargets[0].name).toBe("target");
  });
});
