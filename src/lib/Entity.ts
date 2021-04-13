import { Location } from "vscode-languageserver";

export type Name = string;
export type EntityType = "rst.role.ref" | "rst.target" | "section";

export interface Entity {
  type: EntityType;
  name: Name;
  location: Location;
}

export type ReferenceEntity = Entity & {
  type: "rst.role.ref";
};

export type TargetEntity = Entity & {
  type: "rst.target";
};

export type SectionEntity = Entity & {
  type: "section";
  depth: number;
  preSectionTargets: TargetEntity[];
  refs: ReferenceEntity[];
  text: string;
  subsections: SectionEntity[];
};
