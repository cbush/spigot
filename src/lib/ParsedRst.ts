type Position = {
  line: number;
  column: number;
  offset: number;
};

export type ParsedRst = {
  // See https://github.com/seikichi/restructured/blob/master/src/Type.js#L3
  type:
    | "attribution"
    | "author"
    | "authors"
    | "block_quote"
    | "bullet_list"
    | "citation"
    | "citation_reference"
    | "classifier"
    | "colspec"
    | "comment"
    | "contact"
    | "copyright"
    | "date"
    | "definition"
    | "definition_list"
    | "definition_list_item"
    | "description"
    | "directive"
    | "docinfo"
    | "doctest_block"
    | "document"
    | "emphasis"
    | "entry"
    | "enumerated_list"
    | "field"
    | "field_body"
    | "field_list"
    | "field_name"
    | "footnote"
    | "footnote_reference"
    | "interpreted_text"
    | "label"
    | "line"
    | "line_block"
    | "list_item"
    | "literal"
    | "literal_block"
    | "option"
    | "option_argument"
    | "option_group"
    | "option_list"
    | "option_list_item"
    | "option_string"
    | "organization"
    | "paragraph"
    | "problematic"
    | "reference"
    | "row"
    | "section"
    | "status"
    | "strong"
    | "substitution_definition"
    | "substitution_reference"
    | "system_message"
    | "table"
    | "target"
    | "tbody"
    | "term"
    | "tgroup"
    | "thead"
    | "title"
    | "topic"
    | "transition"
    | "unknown"
    | "version";
  position: {
    start: Position;
    end: Position;
  };
  depth?: number;
  children?: ParsedRst[];
  value?: string;
};
