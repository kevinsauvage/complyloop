declare module "axobject-query" {
  export interface AXObjectModelDefinition {
    type: "widget" | "structure" | "window" | "generic";
  }

  export interface AXRelatedConcept {
    name: string;
    attributes?: Array<{
      name: string;
      value?: string | number;
      constraints?: string[];
    }>;
  }

  export const AXObjects: {
    keys: () => string[];
    get: (name: string) => AXObjectModelDefinition | undefined;
  };

  export const elementAXObjects: {
    entries: () => Array<[AXRelatedConcept, string[]]>;
  };
}
